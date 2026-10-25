from rest_framework import serializers

from .models import (
    AlertLevel, AlertRule, AlertRuleVersion, ClinicProfile, EmailTemplate, EmailTemplateVersion, Leaflet,
    LeafletVersion, PrescriptionItem, PrescriptionVersion, ScoreBandSet, ScoreBandVersion, TemplatePart,
)
from .placeholders import validate_text


def _user_name(user) -> str:
    if user is None:
        return ''
    return user.get_full_name() or user.email or ''


class VersionMetaMixin(serializers.Serializer):
    created_by_name = serializers.SerializerMethodField()

    def get_created_by_name(self, obj) -> str:
        return _user_name(obj.created_by)


# --- Templates ------------------------------------------------------------------------------------

class EmailTemplateVersionSerializer(VersionMetaMixin, serializers.ModelSerializer):
    approved = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = EmailTemplateVersion
        fields = ['id', 'number', 'subject', 'body', 'note', 'created_by_name', 'created_at', 'approved',
                  'approved_by_name', 'approved_at']

    def get_approved(self, obj) -> bool:
        return obj.approved_at is not None

    def get_approved_by_name(self, obj) -> str:
        return _user_name(obj.approved_by)


class EmailTemplateSerializer(serializers.ModelSerializer):
    latest = EmailTemplateVersionSerializer(read_only=True, allow_null=True)
    approved = EmailTemplateVersionSerializer(read_only=True, allow_null=True)
    default_leaflets = serializers.PrimaryKeyRelatedField(many=True, queryset=Leaflet.objects.none(), required=False)

    class Meta:
        model = EmailTemplate
        fields = ['id', 'key', 'language', 'name', 'kind', 'part', 'section_key', 'sort_order', 'archived',
                  'default_leaflets', 'latest', 'approved', 'updated_at']
        read_only_fields = ['id', 'key', 'language', 'kind', 'part', 'section_key', 'updated_at']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        organization = self.context.get('organization')
        if organization is not None:
            self.fields['default_leaflets'].child_relation.queryset = Leaflet.objects.filter(organization=organization)


def _validate_wording(attrs):
    errors = {}
    for name in ('subject', 'body'):
        problems = validate_text(attrs.get(name, ''))
        if problems:
            errors[name] = problems
    if errors:
        raise serializers.ValidationError(errors)
    return attrs


class TemplateWordingSerializer(serializers.Serializer):
    subject = serializers.CharField(max_length=255, allow_blank=True, required=False, default='')
    body = serializers.CharField()
    note = serializers.CharField(max_length=255, allow_blank=True, required=False, default='')
    approve = serializers.BooleanField(default=False, help_text='Approve this version so drafts use it.')

    def validate(self, attrs):
        return _validate_wording(attrs)


class TemplatePreviewRequestSerializer(serializers.Serializer):
    subject = serializers.CharField(max_length=255, allow_blank=True, required=False, default='')
    body = serializers.CharField(allow_blank=True)


class TemplatePreviewSerializer(serializers.Serializer):
    subject = serializers.CharField()
    body = serializers.CharField()
    open_slots = serializers.ListField(child=serializers.CharField())
    errors = serializers.ListField(child=serializers.CharField())


class TemplateApproveSerializer(serializers.Serializer):
    number = serializers.IntegerField(min_value=1, help_text='The version to approve.')


class EmailTemplateCreateSerializer(serializers.ModelSerializer):
    """A new template, e.g. the Arabic version of an existing one or a new STI section."""
    subject = serializers.CharField(max_length=255, allow_blank=True, required=False, default='')
    body = serializers.CharField()

    class Meta:
        model = EmailTemplate
        fields = ['key', 'language', 'name', 'kind', 'part', 'section_key', 'sort_order', 'subject', 'body']

    def validate(self, attrs):
        organization = self.context['organization']
        if EmailTemplate.objects.filter(organization=organization, key=attrs['key'],
                                        language=attrs.get('language', 'en')).exists():
            raise serializers.ValidationError({'key': ['A template with this key and language already exists.']})
        if attrs.get('part') == TemplatePart.SECTION and not attrs.get('section_key'):
            raise serializers.ValidationError({'section_key': ['Sections need the test or plan they are for.']})
        return _validate_wording(attrs)


class PlaceholderSerializer(serializers.Serializer):
    name = serializers.CharField()
    description = serializers.CharField()
    filled = serializers.ChoiceField(choices=['automatic', 'review'])


# --- Prescriptions --------------------------------------------------------------------------------

class PrescriptionVersionSerializer(VersionMetaMixin, serializers.ModelSerializer):
    class Meta:
        model = PrescriptionVersion
        fields = ['id', 'number', 'drug', 'dose', 'directions', 'note', 'created_by_name', 'created_at']


class PrescriptionSerializer(serializers.ModelSerializer):
    """The item with its current wording flattened in; saving changed wording adds a version."""
    drug = serializers.CharField(max_length=255)
    dose = serializers.CharField(max_length=255, allow_blank=True, required=False)
    directions = serializers.CharField(allow_blank=True, required=False)
    note = serializers.CharField(max_length=255, allow_blank=True, required=False, write_only=True)
    version = serializers.IntegerField(read_only=True)
    changed_at = serializers.DateTimeField(read_only=True)
    changed_by_name = serializers.CharField(read_only=True)

    class Meta:
        model = PrescriptionItem
        fields = ['id', 'drug', 'dose', 'directions', 'note', 'sort_order', 'archived', 'version', 'changed_at',
                  'changed_by_name']

    def to_representation(self, instance):
        current = instance.current
        return {
            'id': str(instance.id), 'sort_order': instance.sort_order, 'archived': instance.archived,
            'drug': current.drug if current else '', 'dose': current.dose if current else '',
            'directions': current.directions if current else '', 'version': current.number if current else 0,
            'changed_at': current.created_at.isoformat() if current else None,
            'changed_by_name': _user_name(current.created_by) if current else '',
        }


# --- Alert rules ----------------------------------------------------------------------------------

class AlertRuleVersionSerializer(VersionMetaMixin, serializers.ModelSerializer):
    class Meta:
        model = AlertRuleVersion
        fields = ['id', 'number', 'field', 'pre', 'threshold_a', 'mid', 'threshold_b', 'post', 'level', 'message',
                  'enabled', 'note', 'created_by_name', 'created_at']


_RULE_FIELDS = ('field', 'pre', 'threshold_a', 'mid', 'threshold_b', 'post', 'level', 'message', 'enabled')


class AlertRuleSerializer(serializers.ModelSerializer):
    field = serializers.CharField(max_length=255)
    pre = serializers.CharField(max_length=255, allow_blank=True, required=False)
    threshold_a = serializers.CharField(max_length=32, allow_null=True, required=False)
    mid = serializers.CharField(max_length=255, allow_blank=True, required=False)
    threshold_b = serializers.CharField(max_length=32, allow_null=True, required=False)
    post = serializers.CharField(max_length=255, allow_blank=True, required=False)
    level = serializers.ChoiceField(choices=AlertLevel.choices)
    message = serializers.CharField(max_length=255)
    enabled = serializers.BooleanField(required=False)
    note = serializers.CharField(max_length=255, allow_blank=True, required=False, write_only=True)
    version = serializers.IntegerField(read_only=True)
    changed_at = serializers.DateTimeField(read_only=True)
    changed_by_name = serializers.CharField(read_only=True)

    class Meta:
        model = AlertRule
        fields = ['id', 'code', *_RULE_FIELDS, 'note', 'sort_order', 'version', 'changed_at', 'changed_by_name']
        read_only_fields = ['id', 'code']

    def validate(self, attrs):
        current = self.instance.current if self.instance else None
        for name in ('threshold_a', 'threshold_b'):
            if name in attrs and current is not None and (attrs[name] is None) != (getattr(current, name) is None):
                raise serializers.ValidationError({name: ['This rule does not have that cut-off.']})
            if attrs.get(name) is not None and not attrs[name].strip():
                raise serializers.ValidationError({name: ['Enter a cut-off.']})
        return attrs

    def to_representation(self, instance):
        current = instance.current
        data = {'id': str(instance.id), 'code': instance.code, 'sort_order': instance.sort_order}
        for name in _RULE_FIELDS:
            data[name] = getattr(current, name) if current else None
        data.update({
            'version': current.number if current else 0,
            'changed_at': current.created_at.isoformat() if current else None,
            'changed_by_name': _user_name(current.created_by) if current else '',
        })
        return data


class AlertRuleChangeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=10)
    threshold_a = serializers.CharField(max_length=32, allow_null=True, required=False)
    threshold_b = serializers.CharField(max_length=32, allow_null=True, required=False)
    enabled = serializers.BooleanField(required=False)


class AlertRuleBulkSerializer(serializers.Serializer):
    """Several rule changes saved together, as the alert rules screen's "Save changes" does."""
    note = serializers.CharField(max_length=255, allow_blank=True, required=False, default='')
    rules = AlertRuleChangeSerializer(many=True)


# --- Score bands ----------------------------------------------------------------------------------

class ScoreBandSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=64)
    min = serializers.IntegerField(min_value=0)


class ScoreBandVersionSerializer(VersionMetaMixin, serializers.ModelSerializer):
    bands = ScoreBandSerializer(many=True)

    class Meta:
        model = ScoreBandVersion
        fields = ['id', 'number', 'bands', 'note', 'created_by_name', 'created_at']


class ScoreBandSetSerializer(serializers.ModelSerializer):
    current = ScoreBandVersionSerializer(read_only=True, allow_null=True)

    class Meta:
        model = ScoreBandSet
        fields = ['id', 'code', 'name', 'current']


class ScoreBandUpdateSerializer(serializers.Serializer):
    bands = ScoreBandSerializer(many=True)
    note = serializers.CharField(max_length=255, allow_blank=True, required=False, default='')

    def validate_bands(self, bands):
        minimums = [band['min'] for band in bands]
        if not bands or minimums != sorted(set(minimums)):
            raise serializers.ValidationError('Each band must start higher than the one before it.')
        return bands


# --- Leaflets -------------------------------------------------------------------------------------

class LeafletVersionSerializer(VersionMetaMixin, serializers.ModelSerializer):
    class Meta:
        model = LeafletVersion
        fields = ['id', 'number', 'original_filename', 'size', 'note', 'created_by_name', 'created_at']


class LeafletSerializer(serializers.ModelSerializer):
    current = LeafletVersionSerializer(read_only=True, allow_null=True)

    class Meta:
        model = Leaflet
        fields = ['id', 'title', 'archived', 'current', 'updated_at']
        read_only_fields = ['id', 'updated_at']


class LeafletUploadSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255)
    file = serializers.FileField(allow_empty_file=False)


class LeafletReplaceSerializer(serializers.Serializer):
    file = serializers.FileField(allow_empty_file=False)
    note = serializers.CharField(max_length=255, allow_blank=True, required=False, default='')


# --- Clinic profile -------------------------------------------------------------------------------

class ClinicProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClinicProfile
        fields = ['display_name', 'phone', 'doctor_name', 'signature', 'updated_at']
        read_only_fields = ['updated_at']
