from django.contrib import admin

from .models import Document


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ('title', 'patient', 'slot', 'document_date', 'content_type', 'created_at')
    list_filter = ('slot', 'source', 'organization')
    search_fields = ('title', 'original_filename', 'patient__file_number', 'patient__full_name')
    readonly_fields = ('file', 'original_filename', 'content_type', 'size', 'sha256', 'uploaded_by')
