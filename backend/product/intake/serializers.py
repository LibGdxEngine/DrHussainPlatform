from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from product.appointments.models import Appointment
from product.patients.models import Patient

from .catalogue import ADDABLE_MODULES, AnswerError, clean_answers
from .models import MRS_ITEMS, IntakeForm
from .services import history_summary

# Named in settings (ENUM_NAME_OVERRIDES 'YesNoEnum') for the yes/no choice sets in the API.
YES_NO = [('yes', 'Yes'), ('no', 'No')]


class FormSaveSerializer(serializers.Serializer):
    """The answers are checked against the question catalogue (intake/catalogue.py) for the form's kind."""
    answers = serializers.JSONField(required=False, default=dict,
                                    help_text='Question id -> answer, as the catalogue describes.')
    mrs = serializers.ListField(child=serializers.IntegerField(min_value=0, max_value=4), min_length=MRS_ITEMS,
                                max_length=MRS_ITEMS, required=False, allow_null=True)

    def validate_answers(self, value):
        try:
            return clean_answers(value, self.context.get('kind', IntakeForm.Kind.FULL))
        except AnswerError as exc:
            raise serializers.ValidationError(getattr(exc, 'fields', None) or str(exc))


class CatalogueOptionSerializer(serializers.Serializer):
    value = serializers.JSONField(help_text='A string, or a 0-3 score for the mood questions.')
    label = serializers.CharField()


class CatalogueFieldSerializer(serializers.Serializer):
    """One column of a repeating-row question."""
    id = serializers.CharField()
    label = serializers.CharField()
    type = serializers.ChoiceField(choices=['single', 'text', 'number', 'date', 'tick'])
    options = CatalogueOptionSerializer(many=True, required=False)
    required = serializers.BooleanField(default=False)
    default = serializers.JSONField(required=False)
    min = serializers.IntegerField(required=False)
    max = serializers.IntegerField(required=False)
    max_length = serializers.IntegerField(required=False)


class CatalogueQuestionSerializer(serializers.Serializer):
    id = serializers.CharField()
    label = serializers.CharField(help_text='Forms-doc wording.')
    type = serializers.ChoiceField(choices=['single', 'multi', 'number', 'scale', 'text', 'date', 'tick', 'rows',
                                            'mrs'])
    options = CatalogueOptionSerializer(many=True, required=False)
    fields = CatalogueFieldSerializer(many=True, required=False)
    show_if = serializers.JSONField(required=False, help_text='A catalogue condition.')
    required = serializers.JSONField(default=False, help_text='true, or a catalogue condition.')
    carry_forward = serializers.BooleanField()
    inferred = serializers.BooleanField(default=False,
                                        help_text='Not a question in the forms doc; to confirm with the clinic.')
    also_in = serializers.ListField(child=serializers.CharField(), default=list,
                                    help_text='Other sections that ask it when its own section is closed.')
    rules = serializers.ListField(child=serializers.CharField(), default=list)
    flag = serializers.JSONField(required=False,
                                 help_text='Answer values highlighted for the doctor, or "any" for any answer.')
    min = serializers.IntegerField(required=False)
    max = serializers.IntegerField(required=False)
    max_length = serializers.IntegerField(required=False)
    max_rows = serializers.IntegerField(required=False)
    not_sure = serializers.BooleanField(default=False, help_text='Number questions: "not_sure" is accepted.')


class CatalogueSectionSerializer(serializers.Serializer):
    id = serializers.CharField()
    title = serializers.CharField()
    kinds = serializers.ListField(child=serializers.ChoiceField(choices=IntakeForm.Kind.choices))
    addable = serializers.BooleanField()
    opens_when = serializers.JSONField(help_text='A catalogue condition.')
    intro = serializers.CharField(required=False)
    questions = CatalogueQuestionSerializer(many=True)


class CatalogueSerializer(serializers.Serializer):
    version = serializers.CharField()
    sections = CatalogueSectionSerializer(many=True)


class TokenSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=128)


class VerifySerializer(TokenSerializer):
    date_of_birth = serializers.DateField()


class LinkOpenedSerializer(serializers.Serializer):
    clinic_name = serializers.CharField()
    first_name = serializers.CharField()
    kind = serializers.ChoiceField(choices=IntakeForm.Kind.choices)
    status = serializers.ChoiceField(choices=IntakeForm.Status.choices)
    visit_at = serializers.DateTimeField(allow_null=True)


class SessionSerializer(serializers.Serializer):
    session = serializers.CharField()


class MrsPointSerializer(serializers.Serializer):
    date = serializers.DateTimeField()
    total = serializers.IntegerField()
    somatic = serializers.IntegerField()
    psychological = serializers.IntegerField()
    urogenital = serializers.IntegerField()


class PatientFormSerializer(serializers.Serializer):
    """The form as the patient sees it after verifying: their answers and nothing else from the record."""
    clinic_name = serializers.CharField()
    first_name = serializers.CharField()
    kind = serializers.ChoiceField(choices=IntakeForm.Kind.choices)
    status = serializers.ChoiceField(choices=IntakeForm.Status.choices)
    visit_at = serializers.DateTimeField(allow_null=True)
    answers = serializers.JSONField()
    mrs = serializers.ListField(child=serializers.IntegerField(), allow_null=True)
    previous_mrs = MrsPointSerializer(many=True)
    current_medicines = serializers.ListField(child=serializers.CharField(),
                                              help_text='Her current medicines (product.medicines), to confirm.')
    catalogue = CatalogueSerializer(help_text='Every section and question; the form evaluates visibility live.')
    previous_answers = serializers.DictField(
        child=serializers.JSONField(),
        help_text='Carry-forward answers from her earlier complete forms, newest first, to confirm or edit.')
    patient_age = serializers.IntegerField(allow_null=True)
    extra_modules = serializers.ListField(child=serializers.ChoiceField(choices=ADDABLE_MODULES))


class IntakeFormSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    file_number = serializers.CharField(source='patient.file_number', read_only=True)
    has_email = serializers.SerializerMethodField()
    mrs_groups = serializers.JSONField(read_only=True, allow_null=True)

    class Meta:
        model = IntakeForm
        fields = [
            'id', 'patient', 'patient_name', 'file_number', 'has_email', 'appointment', 'kind', 'status',
            'expires_at', 'sent_at', 'sent_via', 'opened_at', 'verified_at', 'submitted_at', 'mrs_total',
            'mrs_groups', 'created_at',
        ]
        read_only_fields = fields

    def get_has_email(self, obj) -> bool:
        return bool(obj.patient.email)


class SummaryRowSerializer(serializers.Serializer):
    question = serializers.CharField()
    label = serializers.CharField()
    value = serializers.CharField(allow_blank=True)
    highlight = serializers.BooleanField(help_text='The answer feeds a red or amber rule and may set it off.')
    not_answered = serializers.BooleanField()


class SummaryModuleSerializer(serializers.Serializer):
    module = serializers.CharField()
    title = serializers.CharField()
    rows = SummaryRowSerializer(many=True)


class IntakeFormDetailSerializer(IntakeFormSerializer):
    answers = serializers.JSONField(read_only=True)
    mrs = serializers.ListField(child=serializers.IntegerField(), read_only=True, allow_null=True)
    history_summary = serializers.SerializerMethodField()
    rule_errors = serializers.JSONField(read_only=True)
    extra_modules = serializers.ListField(child=serializers.CharField(), read_only=True)

    class Meta(IntakeFormSerializer.Meta):
        fields = IntakeFormSerializer.Meta.fields + [
            'answers', 'mrs', 'history_summary', 'rules_evaluated_at', 'rule_errors', 'extra_modules',
            'catalogue_version',
        ]
        read_only_fields = fields

    @extend_schema_field(SummaryModuleSerializer(many=True))
    def get_history_summary(self, obj):
        return history_summary(obj)


class IntakeFormLinkSerializer(serializers.Serializer):
    form = IntakeFormSerializer()
    link = serializers.CharField(help_text='Shown once. Sending or copying again makes a new link.')


class IntakeFormCreateSerializer(serializers.Serializer):
    patient = serializers.PrimaryKeyRelatedField(queryset=Patient.objects.none(), required=False)
    appointment = serializers.PrimaryKeyRelatedField(queryset=Appointment.objects.none(), required=False)
    kind = serializers.ChoiceField(choices=IntakeForm.Kind.choices, required=False)
    send_email = serializers.BooleanField(default=False)
    extra_modules = serializers.ListField(child=serializers.ChoiceField(choices=ADDABLE_MODULES), required=False,
                                          max_length=len(ADDABLE_MODULES),
                                          help_text='Modules to add on top of the ones her answers open.')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        organization = self.context.get('organization')
        if organization is not None:
            self.fields['patient'].queryset = Patient.objects.filter(organization=organization)
            self.fields['appointment'].queryset = Appointment.objects.filter(organization=organization)

    def validate(self, attrs):
        appointment = attrs.get('appointment')
        if appointment is not None:
            attrs['patient'] = appointment.patient
            attrs.setdefault('kind', appointment.form_kind or IntakeForm.Kind.FULL)
        elif 'patient' not in attrs:
            raise serializers.ValidationError({'patient': ['Choose the patient or the appointment.']})
        attrs.setdefault('kind', IntakeForm.Kind.FULL)
        return attrs
