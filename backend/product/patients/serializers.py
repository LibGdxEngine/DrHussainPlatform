from datetime import date

from rest_framework import serializers

from .models import Patient


def age_on(date_of_birth: date, today: date) -> int:
    return today.year - date_of_birth.year - ((today.month, today.day) < (date_of_birth.month, date_of_birth.day))


class PatientSerializer(serializers.ModelSerializer):
    age = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = [
            'id', 'file_number', 'full_name', 'full_name_ar', 'date_of_birth', 'age', 'mobile', 'whatsapp', 'email',
            'referring_doctor', 'first_contact_channel', 'preferred_language', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'file_number', 'created_at', 'updated_at']

    def get_age(self, obj) -> int:
        return age_on(obj.date_of_birth, date.today())

    def validate_full_name(self, value):
        value = ' '.join(value.split())
        if not value:
            raise serializers.ValidationError('Enter the patient\'s full name.')
        return value

    def validate_full_name_ar(self, value):
        return ' '.join(value.split())

    def validate_date_of_birth(self, value):
        if value > date.today():
            raise serializers.ValidationError('Date of birth cannot be in the future.')
        return value


class PatientCreateSerializer(PatientSerializer):
    confirm_duplicate = serializers.BooleanField(
        default=False, write_only=True,
        help_text='Create the file even though a patient with the same name and date of birth exists.',
    )

    class Meta(PatientSerializer.Meta):
        fields = PatientSerializer.Meta.fields + ['confirm_duplicate']


class SimilarPatientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = ['id', 'file_number', 'full_name', 'full_name_ar', 'date_of_birth']
