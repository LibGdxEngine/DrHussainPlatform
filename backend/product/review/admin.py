from django.contrib import admin

from .models import ResultsCase, ReviewAction, SentEmail


class ReviewActionInline(admin.TabularInline):
    model = ReviewAction
    extra = 0
    can_delete = False
    readonly_fields = ('action', 'actor', 'details', 'created_at')

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(ResultsCase)
class ResultsCaseAdmin(admin.ModelAdmin):
    list_display = ('patient', 'status', 'route', 'created_at')
    list_filter = ('status', 'route', 'organization')
    search_fields = ('patient__file_number', 'patient__full_name')
    readonly_fields = ('report', 'patient', 'organization', 'flag_reasons')
    inlines = [ReviewActionInline]


@admin.register(SentEmail)
class SentEmailAdmin(admin.ModelAdmin):
    list_display = ('to_address', 'subject', 'status', 'sent_at')
    list_filter = ('status',)
    readonly_fields = [f.name for f in SentEmail._meta.fields]

    def has_add_permission(self, request):
        return False
