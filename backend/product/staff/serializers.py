from rest_framework import serializers

from apps.organizations.models import Invitation, OrganizationMember

LEAD_ROLES = (OrganizationMember.Role.OWNER, OrganizationMember.Role.ADMIN)


def display_name(user) -> str:
    return user.get_full_name() or user.email or user.phone or ''


class MeSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    email = serializers.EmailField(allow_blank=True)
    clinic_id = serializers.UUIDField()
    clinic_name = serializers.CharField()
    role = serializers.ChoiceField(choices=OrganizationMember.Role.choices)
    is_lead = serializers.BooleanField(help_text='Owner or admin: medical notes, alerts, orders and settings.')


class MemberSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(source='user.id', read_only=True)
    name = serializers.SerializerMethodField()
    email = serializers.EmailField(source='user.email', read_only=True)
    phone = serializers.CharField(source='user.phone', read_only=True)
    last_login = serializers.DateTimeField(source='user.last_login', read_only=True, allow_null=True)
    is_me = serializers.SerializerMethodField()

    class Meta:
        model = OrganizationMember
        fields = ['id', 'user_id', 'name', 'email', 'phone', 'role', 'last_login', 'is_me', 'created_at']
        read_only_fields = ['id', 'user_id', 'name', 'email', 'phone', 'last_login', 'is_me', 'created_at']

    def get_name(self, obj) -> str:
        return display_name(obj.user)

    def get_is_me(self, obj) -> bool:
        request = self.context.get('request')
        return bool(request and request.user.pk == obj.user_id)


class InvitationSerializer(serializers.ModelSerializer):
    invited_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Invitation
        fields = ['id', 'email', 'role', 'status', 'expires_at', 'invited_by_name', 'created_at']
        read_only_fields = ['id', 'status', 'expires_at', 'invited_by_name', 'created_at']

    def get_invited_by_name(self, obj) -> str:
        return display_name(obj.invited_by) if obj.invited_by else ''

    def validate_email(self, value):
        return value.strip().lower()


class InvitationSentSerializer(serializers.Serializer):
    invitation = InvitationSerializer()
    link = serializers.CharField()
    emailed = serializers.BooleanField()
    notice = serializers.CharField(allow_blank=True)


class JoinTokenSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=128)


class JoinPreviewSerializer(serializers.Serializer):
    clinic_name = serializers.CharField()
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=OrganizationMember.Role.choices)
    status = serializers.ChoiceField(choices=Invitation.Status.choices)
