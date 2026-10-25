from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from product.records.models import Document

from .catalog import ensure_catalog, normalize_test_name
from .comparison import compare
from .models import InvestigationReport, LabTest, LabTestAlias, ResultValue


class AliasListField(serializers.ListField):
    def get_attribute(self, instance):
        return sorted(a.alias for a in instance.aliases.all())


class LabTestSerializer(serializers.ModelSerializer):
    aliases = AliasListField(
        child=serializers.CharField(max_length=128), required=False,
        help_text="Every lab's name for this test. Saving replaces the whole list.",
    )

    class Meta:
        model = LabTest
        fields = [
            'id', 'code', 'name', 'kind', 'default_unit', 'optimal_low', 'optimal_high', 'optimal_text',
            'tracked', 'sort_order', 'aliases',
        ]
        read_only_fields = ['id']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if isinstance(self.instance, LabTest):
            # The code links a test to earlier results; it cannot change once it exists.
            self.fields['code'].read_only = True

    def validate(self, attrs):
        low = attrs.get('optimal_low', getattr(self.instance, 'optimal_low', None))
        high = attrs.get('optimal_high', getattr(self.instance, 'optimal_high', None))
        if low is not None and high is not None and low >= high:
            raise serializers.ValidationError({'optimal_high': ['The upper target must be above the lower one.']})
        organization = self.context['organization']
        if 'code' in attrs and LabTest.objects.filter(organization=organization, code=attrs['code']).exists():
            raise serializers.ValidationError({'code': ['A test with this code already exists.']})
        if 'aliases' in attrs:
            names = {normalize_test_name(a) for a in attrs['aliases']} - {''}
            taken = LabTestAlias.objects.filter(organization=organization, alias__in=names)
            if isinstance(self.instance, LabTest):
                taken = taken.exclude(lab_test=self.instance)
            clash = sorted(taken.values_list('alias', flat=True))
            if clash:
                raise serializers.ValidationError({'aliases': [f'Already used by another test: {", ".join(clash)}.']})
            attrs['aliases'] = sorted(names)
        return attrs


class LabTestBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabTest
        fields = ['id', 'code', 'name', 'kind']


class PreviousValueSerializer(serializers.ModelSerializer):
    class Meta:
        model = ResultValue
        fields = ['id', 'report', 'value_text', 'value_numeric', 'unit', 'ref_low', 'ref_high', 'ref_text',
                  'flag', 'result_date', 'lab_name']


class ComparisonSerializer(serializers.Serializer):
    change = serializers.ChoiceField(choices=['first', 'up', 'down', 'same', 'changed', 'not_comparable'])
    reasons = serializers.ListField(child=serializers.CharField())
    previous = PreviousValueSerializer(allow_null=True)


class ResultValueSerializer(serializers.ModelSerializer):
    test = LabTestBriefSerializer(source='lab_test', allow_null=True, read_only=True)
    abnormal = serializers.BooleanField(source='is_abnormal', read_only=True)
    comparison = serializers.SerializerMethodField()

    class Meta:
        model = ResultValue
        fields = [
            'id', 'report', 'test', 'raw_name', 'value_text', 'value_numeric', 'unit', 'ref_low', 'ref_high',
            'ref_text', 'flag', 'abnormal', 'result_date', 'lab_name', 'unreadable', 'source', 'comparison',
        ]

    @extend_schema_field(ComparisonSerializer)
    def get_comparison(self, obj):
        result = compare(obj)
        return {
            'change': result.change,
            'reasons': result.reasons,
            'previous': PreviousValueSerializer(result.previous).data if result.previous else None,
        }


class ReportIdentifiersSerializer(serializers.Serializer):
    name = serializers.CharField(required=False)
    date_of_birth = serializers.DateField(required=False)
    file_number = serializers.CharField(required=False)


class InvestigationReportSerializer(serializers.ModelSerializer):
    identifiers = ReportIdentifiersSerializer(read_only=True)
    flag_reasons = serializers.ListField(child=serializers.CharField(), read_only=True)
    values = ResultValueSerializer(many=True, read_only=True)
    document_title = serializers.CharField(source='document.title', read_only=True)

    class Meta:
        model = InvestigationReport
        fields = [
            'id', 'document', 'document_title', 'patient', 'status', 'report_type', 'method', 'parser',
            'lab_name', 'collected_on', 'identifiers', 'match_status', 'flag_reasons', 'in_history',
            'processed_at', 'created_at', 'values',
        ]
        read_only_fields = fields


class DocumentRefSerializer(serializers.Serializer):
    document = serializers.PrimaryKeyRelatedField(queryset=Document.objects.none())

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        organization = self.context.get('organization')
        if organization is not None:
            self.fields['document'].queryset = Document.objects.filter(organization=organization)

    def validate_document(self, document):
        from .pipeline import should_read

        if not should_read(document):
            raise serializers.ValidationError('Only lab results and pathology reports are read.')
        return document


class ManualValueSerializer(serializers.Serializer):
    test = serializers.SlugField(help_text='Catalog code, e.g. ferritin.')
    value = serializers.CharField(allow_blank=True, max_length=255, help_text='Blank removes the typed value.')
    unit = serializers.CharField(allow_blank=True, required=False, max_length=32)


class ManualEntrySerializer(serializers.Serializer):
    document = serializers.PrimaryKeyRelatedField(queryset=Document.objects.none())
    result_date = serializers.DateField(required=False, allow_null=True)
    values = ManualValueSerializer(many=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        organization = self.context.get('organization')
        if organization is not None:
            self.fields['document'].queryset = Document.objects.filter(organization=organization)

    def validate(self, attrs):
        organization = self.context['organization']
        ensure_catalog(organization)
        codes = [entry['test'] for entry in attrs['values']]
        tests = {t.code: t for t in LabTest.objects.filter(organization=organization, code__in=codes)}
        unknown = sorted(set(codes) - set(tests))
        if unknown:
            raise serializers.ValidationError({'values': [f'Unknown test: {", ".join(unknown)}.']})
        errors = {}
        for index, entry in enumerate(attrs['values']):
            test = tests[entry['test']]
            value = entry['value'].strip()
            if value and test.kind == LabTest.Kind.NUMERIC:
                try:
                    float(value.lstrip('<>≤≥').replace(',', '.'))
                except ValueError:
                    errors[f'values.{index}.value'] = [f'{test.name} must be a number.']
            entry['lab_test'] = test
        if errors:
            raise serializers.ValidationError(errors)
        return attrs
