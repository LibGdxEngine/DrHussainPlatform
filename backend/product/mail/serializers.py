from django.conf import settings
from django.core.validators import RegexValidator
from rest_framework import serializers

from product.patients.models import Patient
from product.records.models import Document, DocumentSlot

from .models import MailAttachment, MailMessage, MailThread, Mailbox, Security


class MailboxSerializer(serializers.ModelSerializer):
    """Passwords are write-only: the API says whether one is saved, never what it is."""
    smtp_password = serializers.CharField(write_only=True, required=False, allow_blank=True, trim_whitespace=False)
    imap_password = serializers.CharField(write_only=True, required=False, allow_blank=True, trim_whitespace=False)
    has_smtp_password = serializers.SerializerMethodField()
    has_imap_password = serializers.SerializerMethodField()
    smtp_security = serializers.ChoiceField(choices=Security.choices, required=False)
    imap_security = serializers.ChoiceField(choices=Security.choices, required=False)
    # Folder names are sent to the IMAP server inside a quoted string; keep them to characters that
    # need no escaping (no quotes, backslashes, wildcards or line breaks).
    imap_folder = serializers.CharField(max_length=255, required=False, validators=[RegexValidator(
        r'^[\w .&+/#@\[\]-]+$', 'Use letters, digits, spaces and . _ - / & + # @ [ ] only.',
    )])

    class Meta:
        model = Mailbox
        fields = [
            'address', 'display_name', 'enabled',
            'smtp_host', 'smtp_port', 'smtp_security', 'smtp_username', 'smtp_password', 'has_smtp_password',
            'imap_host', 'imap_port', 'imap_security', 'imap_username', 'imap_password', 'has_imap_password',
            'imap_folder', 'last_synced_at', 'last_error',
        ]
        read_only_fields = ['last_synced_at', 'last_error']

    def get_has_smtp_password(self, obj) -> bool:
        return bool(obj.smtp_password_encrypted)

    def get_has_imap_password(self, obj) -> bool:
        return bool(obj.imap_password_encrypted)

    def _no_plain_text(self, value):
        if value == Security.NONE and not settings.DEBUG:
            raise serializers.ValidationError('Unencrypted connections are only allowed on development servers.')
        return value

    def validate_smtp_security(self, value):
        return self._no_plain_text(value)

    def validate_imap_security(self, value):
        return self._no_plain_text(value)

    def update(self, instance, validated_data):
        for name in ('smtp_password', 'imap_password'):
            if name in validated_data:
                value = validated_data.pop(name)
                if value:
                    setattr(instance, name, value)
        return super().update(instance, validated_data)


class ConnectionCheckSerializer(serializers.Serializer):
    smtp = serializers.CharField(help_text='"ok" or what went wrong.')
    imap = serializers.CharField(help_text='"ok" or what went wrong.')


class ThreadPatientSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    file_number = serializers.CharField()
    full_name = serializers.CharField()


class MailThreadSerializer(serializers.ModelSerializer):
    patient = ThreadPatientSerializer(read_only=True, allow_null=True)
    suggested_patient = ThreadPatientSerializer(read_only=True, allow_null=True)
    preview = serializers.SerializerMethodField()
    has_attachments = serializers.SerializerMethodField()

    class Meta:
        model = MailThread
        fields = ['id', 'subject', 'contact_email', 'contact_name', 'patient', 'suggested_patient', 'last_message_at',
                  'has_inbound', 'has_outbound', 'unread', 'archived', 'preview', 'has_attachments']
        read_only_fields = fields

    @staticmethod
    def _prefetched_messages(obj):
        if 'messages' in getattr(obj, '_prefetched_objects_cache', {}):
            return list(obj.messages.all())
        return None

    def get_preview(self, obj) -> str:
        """The latest message's first words. Annotated by the list view; otherwise from the messages."""
        text = getattr(obj, 'preview_text', None)
        if text is None:
            messages = self._prefetched_messages(obj)
            if messages is not None:
                last = max(messages, key=lambda m: (m.sent_at, m.created_at), default=None)
            else:
                last = obj.messages.order_by('-sent_at', '-created_at').first()
            text = last.body_text if last else ''
        return ' '.join(text.split())[:160]

    def get_has_attachments(self, obj) -> bool:
        if hasattr(obj, 'has_files'):
            return bool(obj.has_files or obj.has_named_files)
        messages = self._prefetched_messages(obj)
        if messages is not None:
            return any(m.attachment_names or m.attachments.all() for m in messages)
        return MailAttachment.objects.filter(message__thread=obj).exists() or obj.messages.exclude(
            attachment_names=[]).exists()


class MailAttachmentSerializer(serializers.ModelSerializer):
    saved_document = serializers.UUIDField(source='saved_document_id', read_only=True, allow_null=True)

    class Meta:
        model = MailAttachment
        fields = ['id', 'filename', 'content_type', 'size', 'saved_document']


class MailMessageSerializer(serializers.ModelSerializer):
    attachments = MailAttachmentSerializer(many=True, read_only=True)
    sent_by_name = serializers.SerializerMethodField()
    to_addresses = serializers.ListField(child=serializers.CharField(), read_only=True)
    attachment_names = serializers.ListField(child=serializers.CharField(), read_only=True)

    class Meta:
        model = MailMessage
        fields = ['id', 'direction', 'status', 'from_address', 'from_name', 'to_addresses', 'subject', 'body_text',
                  'sent_at', 'attachments', 'attachment_names', 'sent_by_name', 'error']

    def get_sent_by_name(self, obj) -> str:
        user = obj.sent_by
        return (user.get_full_name() or user.email) if user else ''


class MailThreadDetailSerializer(MailThreadSerializer):
    messages = MailMessageSerializer(many=True, read_only=True)

    class Meta(MailThreadSerializer.Meta):
        fields = MailThreadSerializer.Meta.fields + ['messages']
        read_only_fields = fields


class _ClinicScoped(serializers.Serializer):
    scoped = {}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        organization = self.context.get('organization')
        if organization is not None:
            for name, model in self.scoped.items():
                field = self.fields[name]
                target = field.child_relation if hasattr(field, 'child_relation') else field
                target.queryset = model.objects.filter(organization=organization)


class LinkPatientSerializer(_ClinicScoped):
    scoped = {'patient': Patient}
    patient = serializers.PrimaryKeyRelatedField(queryset=Patient.objects.none(), allow_null=True)


class ThreadUpdateSerializer(serializers.Serializer):
    unread = serializers.BooleanField(required=False)
    archived = serializers.BooleanField(required=False)


class ReplySerializer(_ClinicScoped):
    scoped = {'documents': Document}
    body = serializers.CharField()
    documents = serializers.PrimaryKeyRelatedField(many=True, queryset=Document.objects.none(), required=False,
                                                   help_text="Documents from the patient's file to attach.")


class SaveAttachmentSerializer(serializers.Serializer):
    slot = serializers.ChoiceField(choices=DocumentSlot.choices)
    title = serializers.CharField(max_length=255, required=False, allow_blank=True)


class InboxCountsSerializer(serializers.Serializer):
    unread = serializers.IntegerField()
    unmatched = serializers.IntegerField()
