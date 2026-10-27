from django.contrib import admin

from .models import MailMessage, MailThread, Mailbox


@admin.register(Mailbox)
class MailboxAdmin(admin.ModelAdmin):
    list_display = ('address', 'organization', 'enabled', 'last_synced_at', 'last_error')
    exclude = ('smtp_password_encrypted', 'imap_password_encrypted')
    readonly_fields = ('last_uid', 'uid_validity', 'last_synced_at', 'last_error')


class MailMessageInline(admin.TabularInline):
    model = MailMessage
    extra = 0
    can_delete = False
    fields = ('direction', 'status', 'from_address', 'subject', 'sent_at')
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(MailThread)
class MailThreadAdmin(admin.ModelAdmin):
    list_display = ('subject', 'contact_email', 'patient', 'last_message_at', 'unread', 'archived')
    list_filter = ('organization', 'unread', 'archived')
    search_fields = ('subject', 'contact_email', 'patient__file_number')
    inlines = [MailMessageInline]
