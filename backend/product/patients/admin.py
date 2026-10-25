from django.contrib import admin

from .models import Patient


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ('file_number', 'full_name', 'date_of_birth', 'organization', 'created_at')
    list_filter = ('organization', 'preferred_language')
    search_fields = ('file_number', 'full_name', 'mobile', 'email')
    readonly_fields = ('file_number', 'normalized_name')
