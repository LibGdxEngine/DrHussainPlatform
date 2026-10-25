"""Resolve the clinic (organization) a product request acts on."""
from rest_framework import exceptions, permissions

from apps.organizations.models import Organization, OrganizationMember

ORGANIZATION_HEADER = 'HTTP_X_ORGANIZATION_ID'


class OrganizationRequired(exceptions.PermissionDenied):
    default_code = 'ORGANIZATION_REQUIRED'
    default_detail = 'Choose the clinic this request belongs to.'


def get_request_organization(request) -> Organization:
    """
    Return the caller's clinic: the one named by X-Organization-ID, or the only one
    they belong to. Memberships are checked on every request, never trusted from the client.
    """
    cached = getattr(request, '_product_organization', None)
    if cached is not None:
        return cached
    memberships = Organization.objects.filter(memberships__user=request.user, is_active=True)
    requested = request.META.get(ORGANIZATION_HEADER)
    if requested:
        organization = memberships.filter(pk=requested).first()
    else:
        candidates = list(memberships[:2])
        organization = candidates[0] if len(candidates) == 1 else None
    if organization is None:
        raise OrganizationRequired()
    request._product_organization = organization
    return organization


class IsOrganizationMember(permissions.IsAuthenticated):
    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        get_request_organization(request)
        return True


class IsClinicLead(IsOrganizationMember):
    """
    Doctor-level actions, such as confirming whose report a flagged upload is. Until clinical roles
    exist, the clinic's owners and admins hold them.
    """
    message = 'Only the doctor can do this.'

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        return OrganizationMember.objects.filter(
            organization=get_request_organization(request),
            user=request.user,
            role__in=[OrganizationMember.Role.OWNER, OrganizationMember.Role.ADMIN],
        ).exists()


class OrganizationScopedMixin:
    """Scope a viewset's queryset to the caller's clinic and stamp it on create."""
    permission_classes = [IsOrganizationMember]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return self.queryset.none()
        return self.queryset.filter(organization=get_request_organization(self.request))

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if not getattr(self, 'swagger_fake_view', False) and self.request.user.is_authenticated:
            context['organization'] = get_request_organization(self.request)
        return context
