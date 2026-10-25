from rest_framework import serializers

from product.patients.models import Patient

from .models import Document


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
