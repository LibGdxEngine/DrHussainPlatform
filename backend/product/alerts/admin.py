from django.contrib import admin

from .models import PatientAlert


@admin.register(PatientAlert)
class PatientAlertAdmin(admin.ModelAdmin):
    list_display = ('patient', 'rule', 'level', 'status', 'created_at')
    list_filter = ('status', 'level', 'organization')
    readonly_fields = [f.name for f in PatientAlert._meta.fields]
