from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from product.content.models import Leaflet, PrescriptionItem
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


class DraftLeafletSerializer(serializers.Serializer):
    leaflet = serializers.UUIDField(source='leaflet_id')
    title = serializers.CharField(source='leaflet.title')
    number = serializers.IntegerField()


_PART_ORDER = {'opening': 0, 'full': 1, 'section': 1, 'closing': 2}


class DraftSerializer(serializers.ModelSerializer):
    open_slots = serializers.ListField(child=serializers.CharField(), read_only=True)
    template_versions = serializers.SerializerMethodField()
    prescriptions = DraftPrescriptionSerializer(many=True, read_only=True)
    leaflets = DraftLeafletSerializer(many=True, read_only=True)

    class Meta:
        model = Draft
        fields = ['id', 'language', 'subject', 'body', 'open_slots', 'template_versions', 'prescriptions',
                  'leaflets', 'follow_up', 'attach_report', 'edited', 'created_at']
        read_only_fields = fields

    @extend_schema_field(DraftTemplateSerializer(many=True))
    def get_template_versions(self, obj):
        """The wording used, in the order the email was put together."""
        versions = sorted(obj.template_versions.all(),
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

    class Meta:
        model = SentEmail
        fields = ['id', 'to_address', 'from_address', 'subject', 'body', 'attachments', 'status', 'message_id',
                  'error', 'approved_by_name', 'sent_at', 'created_at']

    def get_approved_by_name(self, obj) -> str:
        return _name(obj.approved_by)


class SmearPlanSerializer(serializers.Serializer):
    key = serializers.CharField()
    name = serializers.CharField()
    approved = serializers.BooleanField()


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


class DraftEditSerializer(_ClinicScoped):
    subject = serializers.CharField(max_length=255, required=False)
    body = serializers.CharField(required=False)
    leaflets = serializers.PrimaryKeyRelatedField(many=True, queryset=Leaflet.objects.none(), required=False)
    attach_report = serializers.BooleanField(required=False)


class ReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500)
