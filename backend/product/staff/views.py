from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.organizations.models import Invitation, OrganizationMember
from core.api_errors import error_response
from product.audit import audit
from product.tenancy import IsClinicLead, IsOrganizationMember, get_request_organization

from .serializers import (
    LEAD_ROLES, InvitationSentSerializer, InvitationSerializer, JoinPreviewSerializer, JoinTokenSerializer,
    MemberSerializer, MeSerializer, display_name,
)


def join_link(invitation) -> str:
    # In the fragment, so the token stays out of server logs.
    return f'{settings.EMR_PUBLIC_URL}/emr/join#t={invitation.token}'


class MeView(APIView):
    permission_classes = [IsOrganizationMember]

    @extend_schema(responses={200: MeSerializer})
    def get(self, request):
        """Who is signed in, for which clinic, and with what role."""
        organization = get_request_organization(request)
        role = OrganizationMember.objects.filter(organization=organization, user=request.user).values_list(
            'role', flat=True).first()
        return Response({
            'id': request.user.pk, 'name': display_name(request.user), 'email': request.user.email or '',
            'clinic_id': organization.pk, 'clinic_name': organization.name, 'role': role, 'is_lead': role in LEAD_ROLES,
        })


class MemberViewSet(mixins.ListModelMixin, mixins.UpdateModelMixin, mixins.DestroyModelMixin,
                    viewsets.GenericViewSet):
    """The clinic's users. Anyone can see the list; only the doctor (owner or admin) changes it."""
    serializer_class = MemberSerializer
    http_method_names = ['get', 'patch', 'delete', 'head', 'options']

    def get_permissions(self):
        return [IsOrganizationMember()] if self.action == 'list' else [IsClinicLead()]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return OrganizationMember.objects.none()
        return (OrganizationMember.objects.filter(organization=get_request_organization(self.request))
                .select_related('user').order_by('created_at'))

    def _my_role(self):
        return OrganizationMember.objects.filter(organization=get_request_organization(self.request),
                                                 user=self.request.user).values_list('role', flat=True).first()

    def _last_owner(self, member) -> bool:
        return (member.role == OrganizationMember.Role.OWNER and not OrganizationMember.objects.filter(
            organization=member.organization, role=OrganizationMember.Role.OWNER).exclude(pk=member.pk).exists())

    def partial_update(self, request, *args, **kwargs):
        member = self.get_object()
        serializer = self.get_serializer(member, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        role = serializer.validated_data.get('role', member.role)
        owner_change = OrganizationMember.Role.OWNER in (role, member.role) and role != member.role
        if owner_change and self._my_role() != OrganizationMember.Role.OWNER:
            return error_response('OWNER_ONLY', 'Only an owner can make or remove owners.', status=403)
        if role != member.role and self._last_owner(member):
            return error_response('LAST_OWNER', 'The clinic needs at least one owner.', status=409)
        serializer.save()
        audit(request, 'member.role_changed', member, role=role)
        return Response(self.get_serializer(member).data)

    def destroy(self, request, *args, **kwargs):
        member = self.get_object()
        if member.user_id == request.user.pk:
            return error_response('CANNOT_REMOVE_SELF', 'You cannot remove yourself.', status=409)
        if member.role == OrganizationMember.Role.OWNER and self._my_role() != OrganizationMember.Role.OWNER:
            return error_response('OWNER_ONLY', 'Only an owner can remove an owner.', status=403)
        if self._last_owner(member):
            return error_response('LAST_OWNER', 'The clinic needs at least one owner.', status=409)
        audit(request, 'member.removed', member, user_id=str(member.user_id))
        member.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InvitationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Invitations to join the clinic. Doctor only."""
    serializer_class = InvitationSerializer
    permission_classes = [IsClinicLead]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Invitation.objects.none()
        return (Invitation.objects.filter(organization=get_request_organization(self.request),
                                          status=Invitation.Status.PENDING, expires_at__gt=timezone.now())
                .select_related('invited_by'))

    @extend_schema(request=InvitationSerializer, responses={201: InvitationSentSerializer, 409: OpenApiResponse(
        description='ALREADY_MEMBER')})
    def create(self, request):
        """Invite by email. The join link is emailed from the clinic mailbox when it can be, and returned to copy."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        organization = get_request_organization(request)
        email = serializer.validated_data['email']
        if OrganizationMember.objects.filter(organization=organization, user__email__iexact=email).exists():
            return error_response('ALREADY_MEMBER', 'This person is already a member of the clinic.', status=409)
        role = serializer.validated_data['role']
        if role == OrganizationMember.Role.OWNER:
            return error_response('validation_error', 'Invite as admin or member; make owners from the user list.',
                                  fields={'role': ['Invite as admin or member.']})
        with transaction.atomic():
            # A new invitation replaces any live one for the same address.
            Invitation.objects.filter(organization=organization, email__iexact=email,
                                      status=Invitation.Status.PENDING).update(status=Invitation.Status.EXPIRED)
            invitation = Invitation.objects.create(organization=organization, email=email, role=role,
                                                   invited_by=request.user)
        audit(request, 'invitation.created', invitation, role=role)
        emailed, notice = self._email(invitation)
        return Response({'invitation': InvitationSerializer(invitation).data, 'link': join_link(invitation),
                         'emailed': emailed, 'notice': notice}, status=status.HTTP_201_CREATED)

    def _email(self, invitation):
        from product.intake.services import clinic_name
        from product.mail.outbox import queue_email
        from product.mail.transport import MailboxNotReady

        clinic = clinic_name(invitation.organization)
        body = (f'{display_name(invitation.invited_by)} invited you to the {clinic} EMR.\n\n'
                f'Open this link to create your account and join:\n{join_link(invitation)}\n\n'
                f'The link works for {settings.INVITATION_EXPIRY_DAYS} days.')
        try:
            queue_email(invitation.organization, to_address=invitation.email, subject=f'Join {clinic}', body=body,
                        sent_by=invitation.invited_by)
        except MailboxNotReady as exc:
            return False, str(exc)
        return True, f'The invitation was emailed to {invitation.email}.'

    @extend_schema(request=None, responses={204: None})
    @action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        invitation = self.get_object()
        invitation.status = Invitation.Status.DECLINED
        invitation.save(update_fields=['status', 'updated_at'])
        audit(request, 'invitation.revoked', invitation)
        return Response(status=status.HTTP_204_NO_CONTENT)


def _invitation(token):
    invitation = Invitation.objects.select_related('organization').filter(token=token or '').first()
    if invitation is not None and invitation.status == Invitation.Status.PENDING and invitation.is_expired():
        invitation.status = Invitation.Status.EXPIRED
        invitation.save(update_fields=['status', 'updated_at'])
    return invitation


class JoinPreviewView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'intake'

    @extend_schema(request=JoinTokenSerializer, responses={200: JoinPreviewSerializer, 404: OpenApiResponse(
        description='INVITATION_NOT_FOUND')}, auth=[])
    def post(self, request):
        """What an invitation is for, before the person signs up or signs in."""
        serializer = JoinTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invitation = _invitation(serializer.validated_data['token'])
        if invitation is None:
            return error_response('INVITATION_NOT_FOUND', 'This invitation link is not valid.', status=404)
        from product.intake.services import clinic_name

        return Response({'clinic_name': clinic_name(invitation.organization), 'email': invitation.email,
                         'role': invitation.role, 'status': invitation.status})


class JoinAcceptView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'intake'

    @extend_schema(request=JoinTokenSerializer, responses={200: MeSerializer, 409: OpenApiResponse(
        description='INVITATION_NOT_PENDING or EMAIL_MISMATCH')})
    def post(self, request):
        """Join the clinic as the signed-in user. The account's email must be the invited one."""
        serializer = JoinTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invitation = _invitation(serializer.validated_data['token'])
        if invitation is None:
            return error_response('INVITATION_NOT_FOUND', 'This invitation link is not valid.', status=404)
        if invitation.status != Invitation.Status.PENDING:
            return error_response('INVITATION_NOT_PENDING', 'This invitation was already used or has expired.',
                                  status=409)
        if (request.user.email or '').lower() != invitation.email.lower():
            return error_response('EMAIL_MISMATCH', f'Sign in with {invitation.email} to accept this invitation.',
                                  status=409)
        try:
            with transaction.atomic():
                member = OrganizationMember.objects.create(organization=invitation.organization, user=request.user,
                                                           role=invitation.role)
                invitation.status, invitation.accepted_at = Invitation.Status.ACCEPTED, timezone.now()
                invitation.save(update_fields=['status', 'accepted_at', 'updated_at'])
        except IntegrityError:
            member = OrganizationMember.objects.get(organization=invitation.organization, user=request.user)
        request._product_organization = invitation.organization
        audit(request, 'invitation.accepted', invitation, user_id=str(request.user.pk))
        return Response({
            'id': request.user.pk, 'name': display_name(request.user), 'email': request.user.email or '',
            'clinic_id': invitation.organization.pk, 'clinic_name': invitation.organization.name,
            'role': member.role, 'is_lead': member.role in LEAD_ROLES,
        })
