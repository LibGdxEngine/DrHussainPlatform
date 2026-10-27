from datetime import date, timedelta

from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from product.patients.models import Patient
from product.patients.serializers import age_on

from .models import Appointment, VisitKind


def _person(user) -> str:
    if user is None:
        return ''
    return user.get_full_name() or user.email or user.phone or ''


class AppointmentPatientSerializer(serializers.ModelSerializer):
    age = serializers.SerializerMethodField()
    has_email = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = ['id', 'file_number', 'full_name', 'full_name_ar', 'age', 'has_email', 'preferred_language']

    def get_age(self, obj) -> int:
        return age_on(obj.date_of_birth, date.today())

    def get_has_email(self, obj) -> bool:
        return bool(obj.email)


class AppointmentFormSerializer(serializers.Serializer):
    """The visit's latest patient form, as the schedule shows it."""
    id = serializers.UUIDField()
    kind = serializers.CharField()
    status = serializers.CharField()
    sent_at = serializers.DateTimeField(allow_null=True)
    sent_via = serializers.CharField()
    opened_at = serializers.DateTimeField(allow_null=True)
    submitted_at = serializers.DateTimeField(allow_null=True)
    mrs_total = serializers.IntegerField(allow_null=True)


class AppointmentSerializer(serializers.ModelSerializer):
    patient = AppointmentPatientSerializer(read_only=True)
    kind_label = serializers.CharField(source='get_kind_display', read_only=True)
    form_kind = serializers.CharField(read_only=True)
    needs_scanning = serializers.BooleanField(read_only=True)
    form = serializers.SerializerMethodField()
    checked_in_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = [
            'id', 'patient', 'starts_at', 'duration_minutes', 'kind', 'kind_label', 'reason', 'notes', 'status',
            'form_kind', 'needs_scanning', 'form', 'checked_in_at', 'checked_in_by_name', 'created_at',
        ]
        read_only_fields = fields

    @extend_schema_field(AppointmentFormSerializer(allow_null=True))
    def get_form(self, obj):
        forms = getattr(obj, 'prefetched_forms', None)
        if forms is not None:
            form = forms[0] if forms else None
        else:
            form = obj.forms.order_by('-created_at').first()
        return AppointmentFormSerializer(form).data if form else None

    def get_checked_in_by_name(self, obj) -> str:
        return _person(obj.checked_in_by)


class AppointmentWriteSerializer(serializers.ModelSerializer):
    patient = serializers.PrimaryKeyRelatedField(queryset=Patient.objects.none())
    send_form = serializers.BooleanField(default=False, write_only=True,
                                         help_text='Email the patient form link now, from the clinic mailbox.')

    class Meta:
        model = Appointment
        fields = ['patient', 'starts_at', 'duration_minutes', 'kind', 'reason', 'notes', 'send_form']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        organization = self.context.get('organization')
        if organization is not None:
            self.fields['patient'].queryset = Patient.objects.filter(organization=organization)

    def validate_starts_at(self, value):
        if self.instance is None and value < timezone.now() - timedelta(hours=12):
            raise serializers.ValidationError('Choose a time from today onwards.')
        return value

    def validate_duration_minutes(self, value):
        if not 5 <= value <= 240:
            raise serializers.ValidationError('Enter between 5 and 240 minutes.')
        return value


class AppointmentUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Appointment
        fields = ['starts_at', 'duration_minutes', 'kind', 'reason', 'notes', 'status']

    def validate_status(self, value):
        if value == Appointment.Status.CHECKED_IN:
            raise serializers.ValidationError('Use check-in to record that the patient arrived.')
        return value


class DayCountSerializer(serializers.Serializer):
    date = serializers.DateField()
    count = serializers.IntegerField()


class VisitKindSerializer(serializers.Serializer):
    id = serializers.ChoiceField(choices=VisitKind.choices)
    label = serializers.CharField()
    form_kind = serializers.CharField(help_text="'full', 'followup' or '' when the visit needs no patient form.")
