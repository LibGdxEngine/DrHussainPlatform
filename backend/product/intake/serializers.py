from rest_framework import serializers

from product.appointments.models import Appointment
from product.patients.models import Patient

from .models import MRS_ITEMS, IntakeForm

VISIT_REASONS = [
    'routine', 'heavy', 'bleed', 'pain', 'contra', 'ttc', 'pcos', 'dis', 'uri', 'pms', 'smear', 'breast',
    'meno', 'hrt', 'lib', 'other',
]
YES_NO = [('yes', 'Yes'), ('no', 'No')]
YES_NO_UNSURE = [*YES_NO, ('unsure', 'Not sure')]
SIDE_EFFECTS = ['breast', 'bloat', 'head', 'sleepy', 'mood', 'acne', 'hair', 'facial']


class MedicineAnswerSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    still_taking = serializers.BooleanField(default=True)


class AnswersSerializer(serializers.Serializer):
    """What the patient can answer. Unknown keys are dropped, so the stored form stays predictable."""
    # Full history
    reasons = serializers.ListField(child=serializers.ChoiceField(choices=VISIT_REASONS), required=False,
                                    max_length=len(VISIT_REASONS))
    other_reason = serializers.CharField(max_length=500, required=False, allow_blank=True)
    last_period = serializers.CharField(max_length=40, required=False, allow_blank=True)
    period_status = serializers.ChoiceField(choices=['reg', 'irr', 'stopped', 'horm', 'hyst'], required=False)
    bleed_after_year = serializers.ChoiceField(choices=YES_NO, required=False)
    menopause_age = serializers.IntegerField(min_value=20, max_value=70, required=False, allow_null=True)
    uterus = serializers.ChoiceField(choices=YES_NO, required=False)
    pregnant = serializers.ChoiceField(choices=YES_NO_UNSURE, required=False)
    intermenstrual = serializers.ChoiceField(choices=YES_NO, required=False)
    # Follow-up
    overall = serializers.ChoiceField(choices=['much', 'better', 'same', 'worse'], required=False)
    adherence = serializers.ChoiceField(choices=['yes', 'some', 'stop'], required=False)
    adherence_reason = serializers.CharField(max_length=500, required=False, allow_blank=True)
    side_effects = serializers.ListField(child=serializers.ChoiceField(choices=SIDE_EFFECTS), required=False,
                                         max_length=len(SIDE_EFFECTS))
    bleeding = serializers.ChoiceField(choices=YES_NO, required=False)
    medicines = MedicineAnswerSerializer(many=True, required=False, max_length=20)
    # Both
    notes = serializers.CharField(max_length=2000, required=False, allow_blank=True)


class FormSaveSerializer(serializers.Serializer):
    answers = AnswersSerializer(required=False, default=dict)
    mrs = serializers.ListField(child=serializers.IntegerField(min_value=0, max_value=4), min_length=MRS_ITEMS,
                                max_length=MRS_ITEMS, required=False, allow_null=True)


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
                                              help_text='From the latest prescription, for the patient to confirm.')


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


class IntakeFormDetailSerializer(IntakeFormSerializer):
    answers = serializers.JSONField(read_only=True)
    mrs = serializers.ListField(child=serializers.IntegerField(), read_only=True, allow_null=True)

    class Meta(IntakeFormSerializer.Meta):
        fields = IntakeFormSerializer.Meta.fields + ['answers', 'mrs']
        read_only_fields = fields


class IntakeFormLinkSerializer(serializers.Serializer):
    form = IntakeFormSerializer()
    link = serializers.CharField(help_text='Shown once. Sending or copying again makes a new link.')


class IntakeFormCreateSerializer(serializers.Serializer):
    patient = serializers.PrimaryKeyRelatedField(queryset=Patient.objects.none(), required=False)
    appointment = serializers.PrimaryKeyRelatedField(queryset=Appointment.objects.none(), required=False)
    kind = serializers.ChoiceField(choices=IntakeForm.Kind.choices, required=False)
    send_email = serializers.BooleanField(default=False)

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
