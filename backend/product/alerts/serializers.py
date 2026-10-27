from rest_framework import serializers

from .models import PatientAlert


class PatientAlertSerializer(serializers.ModelSerializer):
    code = serializers.CharField(source='rule.code', read_only=True)
    field = serializers.CharField(source='rule_version.field', read_only=True)
    rule_version = serializers.IntegerField(source='rule_version.number', read_only=True)
    value_text = serializers.SerializerMethodField()
    result_date = serializers.DateField(source='value.result_date', read_only=True, allow_null=True, default=None)
    examined_on = serializers.DateField(source='examination.examined_on', read_only=True, allow_null=True, default=None)
    acknowledged_by_name = serializers.SerializerMethodField()
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    file_number = serializers.CharField(source='patient.file_number', read_only=True)

    class Meta:
        model = PatientAlert
        fields = ['id', 'patient', 'patient_name', 'file_number', 'code', 'field', 'rule_version', 'level', 'message',
                  'detail', 'value_text', 'result_date', 'report', 'examination', 'examined_on', 'status',
                  'acknowledged_by_name', 'acknowledged_at', 'reason',
                  'created_at', 'closed_at']
        read_only_fields = fields

    def get_value_text(self, obj) -> str:
        return f'{obj.value.value_text} {obj.value.unit}'.strip() if obj.value else ''

    def get_acknowledged_by_name(self, obj) -> str:
        user = obj.acknowledged_by
        return (user.get_full_name() or user.email) if user else ''


class AcknowledgeSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500)
