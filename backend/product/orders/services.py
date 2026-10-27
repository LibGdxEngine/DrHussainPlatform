from django.db import transaction

from .models import Order, PrescribedMedicine, RequestedTest


def _email_body(order: Order) -> tuple[str, str]:
    from product.intake.services import clinic_name

    clinic = clinic_name(order.organization)
    patient = order.patient
    lines = [f'Patient: {patient.full_name} · {patient.file_number} · born {patient.date_of_birth:%d %b %Y}', '']
    if order.kind == Order.Kind.TESTS:
        lines += ['Tests requested:'] + [f'- {t.name}' for t in order.tests.all()]
    else:
        lines += ['Prescription:']
        for m in order.medicines.all():
            lines.append(f'- {m.drug}{f" {m.dose}" if m.dose else ""}')
            if m.directions:
                lines.append(f'  {m.directions}')
    if order.notes:
        lines += ['', order.notes]
    lines += ['', clinic]
    return f'{clinic}: {order.title}', '\n'.join(lines)


def issue_order(organization, *, issued_by, tests=(), medicines=(), **fields) -> Order:
    """Save the order; email it from the clinic mailbox when that is the delivery. Raises MailboxNotReady."""
    from product.mail.outbox import queue_email
    from product.mail.transport import outgoing

    if fields['delivery'] == Order.Delivery.EMAIL:
        outgoing(organization)  # no mailbox: refuse before anything is saved
    with transaction.atomic():
        order = Order.objects.create(organization=organization, issued_by=issued_by, **fields)
        RequestedTest.objects.bulk_create([
            RequestedTest(organization=organization, order=order, patient=order.patient, code=t['code'], name=t['name'])
            for t in tests
        ])
        PrescribedMedicine.objects.bulk_create([PrescribedMedicine(order=order, **m) for m in medicines])
        if order.delivery == Order.Delivery.EMAIL:
            to_address = order.sent_to or order.patient.email
            subject, body = _email_body(order)
            order.mail_message = queue_email(organization, to_address=to_address, subject=subject, body=body,
                                             patient=order.patient, sent_by=issued_by)
            order.sent_to = to_address
            order.save(update_fields=['mail_message', 'sent_to', 'updated_at'])
    return order


def current_medicines(patient) -> list[PrescribedMedicine]:
    """The medicines on the patient's latest prescription."""
    latest = Order.objects.filter(patient=patient, kind=Order.Kind.PRESCRIPTION).order_by('-created_at').first()
    return list(latest.medicines.all()) if latest else []
