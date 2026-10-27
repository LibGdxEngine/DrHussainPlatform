import logging
from .models import AuditLog

logger = logging.getLogger(__name__)

def client_ip(request):
    """
    The caller's address. Behind Caddy, REMOTE_ADDR is the proxy; Caddy appends the address it
    saw to X-Forwarded-For, so the last entry is the one a client cannot forge.
    """
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if forwarded:
        return forwarded.split(',')[-1].strip() or None
    return request.META.get('REMOTE_ADDR') or None


def record_audit_log(
    action: str,
    resource_type: str,
    actor=None,
    resource_id=None,
    metadata=None,
    ip_address=None
):
    """
    Utility helper to safely record an audit log event without raising exceptions.
    """
    try:
        log = AuditLog.objects.create(
            actor=actor if (actor and actor.is_authenticated) else None,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else "",
            metadata=metadata or {},
            ip_address=ip_address
        )
        return log
    except Exception as e:
        logger.error("Failed to record audit log (%s)", type(e).__name__)
        return None
