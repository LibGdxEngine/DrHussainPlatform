from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from product.content.models import Leaflet, PrescriptionItem, TemplateKind
from product.results.serializers import InvestigationReportSerializer

from .models import Draft, ResultsCase, ReviewAction, SentEmail


def _name(user) -> str:
    return (user.get_full_name() or user.email) if user else ''


class CasePatientSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    file_number = serializers.CharField()
    full_name = serializers.CharField()
    email = serializers.CharField()
    preferred_language = serializers.CharField()


class CaseReportSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    report_type = serializers.CharField()
    collected_on = serializers.DateField(allow_null=True)
    lab_name = serializers.CharField()
    document = serializers.UUIDField(source='document_id')
    document_title = serializers.CharField(source='document.title')


class CaseQuestionSerializer(serializers.Serializer):
    """For a reply case: the patient's email being answered."""
    id = serializers.UUIDField()
    thread = serializers.UUIDField(source='thread_id')
    from_address = serializers.CharField()
    subject = serializers.CharField()
    body_text = serializers.CharField()
    sent_at = serializers.DateTimeField()
    # The thread is with someone other than the patient (e.g. a relative): replies go to the
    # patient unless the doctor confirms sending to the thread contact.
    third_party = serializers.BooleanField(source='thread.third_party')
    third_party_relation = serializers.CharField(source='thread.third_party_relation')


class ResultsCaseSerializer(serializers.ModelSerializer):
    patient = CasePatientSerializer(read_only=True)
    report = CaseReportSummarySerializer(read_only=True, allow_null=True)
    question = CaseQuestionSerializer(source='inbound_message', read_only=True, allow_null=True)
    flag_reasons = serializers.ListField(child=serializers.CharField(), read_only=True)
    plan_template = serializers.SlugRelatedField(slug_field='key', read_only=True, allow_null=True)

    class Meta:
        model = ResultsCase
        fields = ['id', 'kind', 'patient', 'report', 'question', 'status', 'route', 'flag_reasons', 'plan_template',
                  'created_at', 'updated_at']
        read_only_fields = fields


class DraftTemplateSerializer(serializers.Serializer):
    key = serializers.CharField(source='template.key')
    name = serializers.CharField(source='template.name')
    language = serializers.CharField(source='template.language')
    number = serializers.IntegerField()


class DraftPrescriptionSerializer(serializers.Serializer):
    item = serializers.UUIDField(source='item_id')
    number = serializers.IntegerField()
    drug = serializers.CharField()
    dose = serializers.CharField()
    directions = serializers.CharField()


class DraftSectionPrescriptionSerializer(serializers.Serializer):
    section_key = serializers.CharField()
    item = serializers.UUIDField(source='prescription.item_id')
    number = serializers.IntegerField(source='prescription.number')
    drug = serializers.CharField(source='prescription.drug')
    dose = serializers.CharField(source='prescription.dose')
    directions = serializers.CharField(source='prescription.directions')


class DraftLeafletSerializer(serializers.Serializer):
    leaflet = serializers.UUIDField(source='leaflet_id')
    title = serializers.CharField(source='leaflet.title')
    number = serializers.IntegerField()


_PART_ORDER = {'opening': 0, 'full': 1, 'section': 1, 'closing': 2}


class DraftSerializer(serializers.ModelSerializer):
    open_slots = serializers.ListField(child=serializers.CharField(), read_only=True)
    template_versions = serializers.SerializerMethodField()
    prescriptions = DraftPrescriptionSerializer(many=True, read_only=True)
    section_prescriptions = DraftSectionPrescriptionSerializer(many=True, read_only=True)
    leaflets = DraftLeafletSerializer(many=True, read_only=True)
    missing_translations = serializers.ListField(
        child=serializers.CharField(), read_only=True,
        help_text='Template and phrase keys still in English; the draft cannot be sent until each is translated.',
    )

    class Meta:
        model = Draft
        fields = ['id', 'language', 'subject', 'body', 'open_slots', 'missing_translations', 'template_versions',
                  'prescriptions', 'section_prescriptions', 'leaflets', 'follow_up', 'attach_report', 'edited',
                  'created_at']
        read_only_fields = fields

    @extend_schema_field(DraftTemplateSerializer(many=True))
    def get_template_versions(self, obj):
        """The templates used, in the order the email was put together (system phrases are not listed)."""
        versions = sorted((v for v in obj.template_versions.all() if v.template.kind != TemplateKind.PHRASE),
                          key=lambda v: (_PART_ORDER.get(v.template.part, 1), v.template.sort_order, v.template.key))
        return DraftTemplateSerializer(versions, many=True).data


class ReviewActionSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = ReviewAction
        fields = ['id', 'action', 'actor_name', 'details', 'created_at']

    def get_actor_name(self, obj) -> str:
        return _name(obj.actor) or 'Platform'


class SentEmailSerializer(serializers.ModelSerializer):
    approved_by_name = serializers.SerializerMethodField()
    to_thread_contact_confirmed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = SentEmail
        fields = ['id', 'to_address', 'from_address', 'subject', 'body', 'attachments', 'status', 'message_id',
                  'error', 'approved_by_name', 'to_thread_contact_confirmed_by_name', 'sent_at', 'created_at']

    def get_approved_by_name(self, obj) -> str:
        return _name(obj.approved_by)

    def get_to_thread_contact_confirmed_by_name(self, obj) -> str:
        """Who confirmed sending a reply to a third-party thread contact instead of the patient."""
        return _name(obj.to_thread_contact_confirmed_by)


class SmearPlanSerializer(serializers.Serializer):
    key = serializers.CharField()
    name = serializers.CharField(help_text="The template's name, shown on the plan button.")
    approved = serializers.BooleanField()
    has_approved_wording = serializers.BooleanField(help_text='False: the plan cannot be chosen yet.')


class ResultsCaseDetailSerializer(ResultsCaseSerializer):
    report_detail = InvestigationReportSerializer(source='report', read_only=True, allow_null=True)
    draft = DraftSerializer(source='current_draft', read_only=True, allow_null=True)
    actions = ReviewActionSerializer(many=True, read_only=True)
    sent_emails = SentEmailSerializer(many=True, read_only=True)
    smear_plans = serializers.SerializerMethodField()

    class Meta(ResultsCaseSerializer.Meta):
        fields = ResultsCaseSerializer.Meta.fields + ['report_detail', 'draft', 'actions', 'sent_emails', 'smear_plans']
        read_only_fields = fields

    @extend_schema_field(SmearPlanSerializer(many=True))
    def get_smear_plans(self, obj):
        """For an abnormal smear: the sections (2-14) the doctor can choose as the plan."""
        return self.context.get('smear_plans', [])


class PlanRequestSerializer(serializers.Serializer):
    template = serializers.SlugField(help_text='The cervical smear section, e.g. smear_section_5.')


class _ClinicScoped(serializers.Serializer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        organization = self.context.get('organization')
        if organization is not None:
            for name, model in (('prescriptions', PrescriptionItem), ('leaflets', Leaflet)):
                if name in self.fields:
                    self.fields[name].child_relation.queryset = model.objects.filter(organization=organization)


class DraftOptionsSerializer(_ClinicScoped):
    """Choices that rebuild the draft from the templates. Rebuilding replaces typed edits."""
    prescriptions = serializers.PrimaryKeyRelatedField(many=True, queryset=PrescriptionItem.objects.none(),
                                                       required=False)
    follow_up = serializers.CharField(allow_blank=True, required=False)
    language = serializers.ChoiceField(choices=['en', 'ar'], required=False)
    leaflets = serializers.PrimaryKeyRelatedField(many=True, queryset=Leaflet.objects.none(), required=False)
    attach_report = serializers.BooleanField(required=False)
    section_prescriptions = serializers.DictField(
        child=serializers.ListField(child=serializers.UUIDField()), required=False,
        help_text='Per positive result: {"sti_section_<test>": [prescription item id, ...]}. Only the sections '
                  'given change; an empty list clears that section.',
    )

    def validate_section_prescriptions(self, value):
        """Item ids to the clinic's items, in the order given."""
        organization = self.context.get('organization')
        ids = {pk for picks in value.values() for pk in picks}
        items = {item.pk: item for item in PrescriptionItem.objects.filter(organization=organization, pk__in=ids)}
        unknown = sorted(str(pk) for pk in ids - set(items))
        if unknown:
            raise serializers.ValidationError(f'Unknown prescription: {", ".join(unknown)}.')
        return {key: [items[pk] for pk in dict.fromkeys(picks)] for key, picks in value.items()}


class DraftEditSerializer(_ClinicScoped):
    subject = serializers.CharField(max_length=255, required=False)
    body = serializers.CharField(required=False)
    leaflets = serializers.PrimaryKeyRelatedField(many=True, queryset=Leaflet.objects.none(), required=False)
    attach_report = serializers.BooleanField(required=False)


class ReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500)


class ApproveSerializer(serializers.Serializer):
    send_to_thread_contact = serializers.BooleanField(
        default=False, help_text='A reply on a third-party thread: send to the thread contact, not the patient.',
    )


class TranslationSuggestionSerializer(serializers.Serializer):
    subject = serializers.CharField(allow_blank=True)
    body = serializers.CharField()


class TranslationSourceSerializer(serializers.Serializer):
    """One part of the draft still in English: what to translate."""
    key = serializers.CharField()
    name = serializers.CharField()
    is_phrase = serializers.BooleanField()
    subject = serializers.CharField(allow_blank=True)
    body = serializers.CharField(allow_blank=True)
    english_version = serializers.IntegerField(allow_null=True, help_text='Null: the clinic profile signature.')
    placeholders = serializers.ListField(child=serializers.CharField())
    suggestion = TranslationSuggestionSerializer(allow_null=True,
                                                 help_text='A local translator suggestion, to be checked; usually none.')


class TranslationSaveSerializer(serializers.Serializer):
    key = serializers.CharField(max_length=80)
    subject = serializers.CharField(max_length=255, allow_blank=True, required=False, default='')
    body = serializers.CharField()
    keep_for_future = serializers.BooleanField(
        default=False, help_text='Also approve it, so later drafts in this language reuse it.',
    )
