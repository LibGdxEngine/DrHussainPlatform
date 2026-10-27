from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from product.patients.models import Patient

from .models import SCREENING_ITEMS, Diagnosis, DiagnosisRevision, Document, Examination, ExaminationRevision


class DocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            'id', 'patient', 'slot', 'title', 'document_date', 'source', 'original_filename',
            'content_type', 'size', 'uploaded_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'patient', 'original_filename', 'content_type', 'size', 'created_at', 'updated_at',
        ]

    def get_uploaded_by_name(self, obj) -> str:
        user = obj.uploaded_by
        if user is None:
            return ''
        return user.get_full_name() or user.email or user.phone or ''


class DocumentUploadSerializer(serializers.ModelSerializer):
    patient = serializers.PrimaryKeyRelatedField(queryset=Patient.objects.none())
    title = serializers.CharField(max_length=255, required=False, allow_blank=True)
    file = serializers.FileField(write_only=True, allow_empty_file=False)

    class Meta:
        model = Document
        fields = ['patient', 'slot', 'title', 'document_date', 'source', 'file']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        organization = self.context.get('organization')
        if organization is not None:
            self.fields['patient'].queryset = Patient.objects.filter(organization=organization)


class DiagnosisRevisionSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = DiagnosisRevision
        fields = ['number', 'name', 'status', 'noted_on', 'notes', 'author_name', 'created_at']
        read_only_fields = fields

    def get_author_name(self, obj) -> str:
        user = obj.author
        return (user.get_full_name() or user.email or user.phone or '') if user else ''


class DiagnosisSerializer(serializers.ModelSerializer):
    patient = serializers.PrimaryKeyRelatedField(queryset=Patient.objects.none())
    revisions = DiagnosisRevisionSerializer(many=True, read_only=True)
    expected_version = serializers.IntegerField(min_value=1, write_only=True, required=False)

    class Meta:
        model = Diagnosis
        fields = ['id', 'patient', 'name', 'status', 'noted_on', 'notes', 'version',
                  'expected_version', 'revisions', 'created_at', 'updated_at']
        read_only_fields = ['id', 'version', 'revisions', 'created_at', 'updated_at']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        organization = self.context.get('organization')
        if organization is not None:
            self.fields['patient'].queryset = Patient.objects.filter(organization=organization)

    def validate(self, attrs):
        if self.instance is not None:
            if 'patient' in attrs:
                raise serializers.ValidationError({'patient': 'A diagnosis cannot be moved to another patient.'})
            if 'expected_version' not in attrs:
                raise serializers.ValidationError({'expected_version': 'Provide the version you are editing.'})
        elif 'expected_version' in attrs:
            raise serializers.ValidationError({'expected_version': 'Only used when editing.'})
        return attrs


class ExaminationRevisionSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = ExaminationRevision
        fields = ['number', 'data', 'author_name', 'created_at']
        read_only_fields = fields

    def get_author_name(self, obj) -> str:
        user = obj.author
        return (user.get_full_name() or user.email or user.phone or '') if user else ''


class BloodPressureSerializer(serializers.Serializer):
    systolic = serializers.IntegerField()
    diastolic = serializers.IntegerField()


# Plausible limits: anything outside them is a typing slip, not a reading.
_RANGES = {
    'bp1_systolic': (60, 260), 'bp2_systolic': (60, 260), 'bp1_diastolic': (30, 160), 'bp2_diastolic': (30, 160),
    'height_cm': (100, 220), 'weight_kg': (25, 300), 'waist_cm': (40, 200),
}


class ExaminationSerializer(serializers.ModelSerializer):
    patient = serializers.PrimaryKeyRelatedField(queryset=Patient.objects.none())
    revisions = ExaminationRevisionSerializer(many=True, read_only=True)
    expected_version = serializers.IntegerField(min_value=1, write_only=True, required=False)
    bp_average = serializers.SerializerMethodField()
    bmi = serializers.DecimalField(max_digits=5, decimal_places=1, read_only=True, allow_null=True)
    screening = serializers.DictField(child=serializers.BooleanField(), required=False)

    class Meta:
        model = Examination
        fields = ['id', 'patient', 'examined_on', 'bp1_systolic', 'bp1_diastolic', 'bp2_systolic', 'bp2_diastolic',
                  'height_cm', 'weight_kg', 'waist_cm', 'bp_average', 'bmi', 'breast_exam', 'pelvic_exam',
                  'screening', 'plan', 'plan_notes', 'next_review', 'send_follow_up_form', 'version',
                  'expected_version', 'revisions', 'created_at', 'updated_at']
        read_only_fields = ['id', 'version', 'revisions', 'created_at', 'updated_at']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        organization = self.context.get('organization')
        if organization is not None:
            self.fields['patient'].queryset = Patient.objects.filter(organization=organization)

    @extend_schema_field(BloodPressureSerializer(allow_null=True))
    def get_bp_average(self, obj):
        average = obj.bp_average
        return {'systolic': average[0], 'diastolic': average[1]} if average else None

    def validate_screening(self, value):
        unknown = sorted(set(value) - set(SCREENING_ITEMS))
        if unknown:
            raise serializers.ValidationError(f'Unknown screening item: {", ".join(unknown)}.')
        return value

    def validate(self, attrs):
        if self.instance is not None:
            if 'patient' in attrs:
                raise serializers.ValidationError({'patient': 'An examination cannot be moved to another patient.'})
            if 'expected_version' not in attrs:
                raise serializers.ValidationError({'expected_version': 'Provide the version you are editing.'})
        elif 'expected_version' in attrs:
            raise serializers.ValidationError({'expected_version': 'Only used when editing.'})
        errors = {}
        for name, (low, high) in _RANGES.items():
            value = attrs.get(name)
            if value is not None and not low <= value <= high:
                errors[name] = f'Enter a value between {low} and {high}.'
        for reading in ('bp1', 'bp2'):
            systolic = attrs.get(f'{reading}_systolic', getattr(self.instance, f'{reading}_systolic', None))
            diastolic = attrs.get(f'{reading}_diastolic', getattr(self.instance, f'{reading}_diastolic', None))
            if (systolic is None) != (diastolic is None):
                errors[f'{reading}_systolic'] = 'Enter both numbers of the reading, e.g. 120/80.'
        if errors:
            raise serializers.ValidationError(errors)
        return attrs
