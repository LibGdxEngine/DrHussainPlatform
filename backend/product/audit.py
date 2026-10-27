"""Audit helpers for product views: every record created, opened or changed is logged."""
from apps.audit.services import client_ip, record_audit_log


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
        ip_address=client_ip(request),
    )


def audit_access(request, action: str, *, patient_id=None, **metadata):
    """Log a look at patient data that is not one record: a search, a list, a history view."""
    from product.tenancy import get_request_organization

    metadata['organization_id'] = str(get_request_organization(request).pk)
    if patient_id:
        metadata['patient_id'] = str(patient_id)
    return record_audit_log(
        action=action,
        resource_type='patients.patient',
        actor=request.user,
        resource_id=patient_id,
        metadata=metadata,
        ip_address=client_ip(request),
    )
