"""Audit helpers for product views: every record created, opened or changed is logged."""
from apps.audit.services import record_audit_log


def audit(request, action: str, instance, **metadata):
    organization = getattr(request, '_product_organization', None)
    if organization is not None:
        metadata.setdefault('organization_id', str(organization.pk))
    return record_audit_log(
        action=action,
        resource_type=instance._meta.label_lower,
        actor=request.user,
        resource_id=instance.pk,
        metadata=metadata,
        ip_address=request.META.get('REMOTE_ADDR') or None,
    )
