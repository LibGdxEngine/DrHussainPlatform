from django.contrib import admin

from .models import InvestigationReport, LabTest, LabTestAlias, ResultValue


class LabTestAliasInline(admin.TabularInline):
    model = LabTestAlias
    extra = 1
    fields = ('alias', 'organization')


@admin.register(LabTest)
class LabTestAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'kind', 'default_unit', 'tracked', 'organization')
    list_filter = ('organization', 'kind', 'tracked')
    search_fields = ('name', 'code', 'aliases__alias')
    inlines = [LabTestAliasInline]


class ResultValueInline(admin.TabularInline):
    model = ResultValue
    extra = 0
    fields = ('raw_name', 'lab_test', 'value_text', 'unit', 'ref_low', 'ref_high', 'flag', 'unreadable', 'source')
    readonly_fields = fields
    can_delete = False


@admin.register(InvestigationReport)
class InvestigationReportAdmin(admin.ModelAdmin):
    list_display = ('document', 'patient', 'report_type', 'status', 'method', 'collected_on', 'created_at')
    list_filter = ('status', 'report_type', 'method', 'organization')
    search_fields = ('patient__file_number', 'patient__full_name', 'lab_name')
    readonly_fields = ('raw_text', 'identifiers', 'flag_reasons', 'processed_at')
    inlines = [ResultValueInline]
