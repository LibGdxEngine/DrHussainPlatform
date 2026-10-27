from django.contrib import admin

from .models import AlertRule, ClinicProfile, EmailTemplate, Leaflet, PrescriptionItem


class ReadOnlyVersionsInline(admin.TabularInline):
    extra = 0
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False

    def get_readonly_fields(self, request, obj=None):
        return [f.name for f in self.model._meta.fields]


def versions_inline(version_model):
    return type(f'{version_model.__name__}Inline', (ReadOnlyVersionsInline,), {'model': version_model})


@admin.register(EmailTemplate)
class EmailTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'key', 'language', 'kind', 'part', 'archived', 'organization')
    list_filter = ('organization', 'kind', 'language', 'archived')
    search_fields = ('name', 'key')
    inlines = [versions_inline(EmailTemplate.versions.rel.related_model)]


@admin.register(PrescriptionItem)
class PrescriptionItemAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'archived', 'organization')
    inlines = [versions_inline(PrescriptionItem.versions.rel.related_model)]


@admin.register(AlertRule)
class AlertRuleAdmin(admin.ModelAdmin):
    list_display = ('code', 'organization')
    inlines = [versions_inline(AlertRule.versions.rel.related_model)]


@admin.register(Leaflet)
class LeafletAdmin(admin.ModelAdmin):
    list_display = ('title', 'archived', 'organization')
    inlines = [versions_inline(Leaflet.versions.rel.related_model)]


admin.site.register(ClinicProfile)
