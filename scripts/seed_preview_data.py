#!/usr/bin/env python
"""
Preview seed script for V-Clinic.
Runs the base development seed, turns its organization into the demo clinic, adds
login-ready (phone-verified) staff and pending invitations, then fills the clinic with
the EMR demo data (`manage.py seed_demo_data`). A preview can then be explored without
WhatsApp OTP delivery. Safe to run repeatedly.
"""
import os
import sys
from datetime import datetime, time, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from seed_dev_data import seed as seed_base  # noqa: E402  (configures Django)

from django.contrib.auth import get_user_model  # noqa: E402
from django.core.management import call_command  # noqa: E402
from django.utils import timezone  # noqa: E402
from apps.accounts.models import UserStatus  # noqa: E402
from apps.organizations.models import Invitation, Organization, OrganizationMember  # noqa: E402

User = get_user_model()

ADMIN_EMAIL = os.environ.get("DEV_SUPERUSER_EMAIL", "admin@vclinic.local")
PASSWORD = os.environ.get("PREVIEW_PASSWORD", "Preview@12345")
CLINIC_NAME = "V-Clinic — Dr Hussain Gohar"

# Each user belongs to this one clinic only: EMR requests without X-Organization-ID
# are refused for members of several organizations.
STAFF = [
    {"email": "dr.karim@vclinic.local", "phone": "+201000000001", "first_name": "Karim", "last_name": "Mansour",
     "role": OrganizationMember.Role.ADMIN, "bio": "Associate doctor"},
    {"email": "nurse.nour@vclinic.local", "phone": "+201000000002", "first_name": "Nour", "last_name": "Kamal",
     "role": OrganizationMember.Role.MEMBER, "bio": "Clinic nurse"},
    {"email": "reception@vclinic.local", "phone": "+201000000003", "first_name": "Omar", "last_name": "Fathy",
     "role": OrganizationMember.Role.MEMBER, "bio": "Reception and appointments"},
]

INVITES = [("lab@vclinic.local", OrganizationMember.Role.MEMBER),
           ("pharmacy@vclinic.local", OrganizationMember.Role.MEMBER)]


def verified(user, **fields):
    now = timezone.now()
    for key, value in fields.items():
        setattr(user, key, value)
    user.status = UserStatus.ACTIVE
    user.phone_verified_at = user.phone_verified_at or now
    user.email_verified_at = user.email_verified_at or now
    user.save()
    return user


def seed_appointments(clinic, doctor):
    """The demo seed has no schedule; give Today and Appointments a believable week."""
    from product.appointments.models import Appointment, VisitKind
    from product.patients.models import Patient

    if Appointment.objects.filter(organization=clinic).exists():
        print("  • Appointments already exist.")
        return
    patients = list(Patient.objects.filter(organization=clinic).order_by("created_at"))
    if not patients:
        return
    today = timezone.localdate()
    status = Appointment.Status
    # (days from today, hour, minute, visit kind, status, reason)
    plan = [
        (0, 9, 0, VisitKind.FOLLOW_UP_3M, status.SEEN, "HRT review"),
        (0, 9, 45, VisitKind.VISIT_2, status.SEEN, "Bringing blood results"),
        (0, 10, 30, VisitKind.ANNUAL_REVIEW, status.CHECKED_IN, "Annual HRT review"),
        (0, 11, 15, VisitKind.VISIT_1, status.BOOKED, "Hot flushes, poor sleep"),
        (0, 12, 0, VisitKind.ROUTINE, status.BOOKED, "Routine smear"),
        (0, 13, 0, VisitKind.FOLLOW_UP_6M, status.BOOKED, "Six-month follow-up"),
        (0, 13, 45, VisitKind.VISIT_3, status.BOOKED, "Colposcopy results"),
        (-1, 10, 0, VisitKind.VISIT_1, status.SEEN, "New patient consultation"),
        (-1, 11, 0, VisitKind.FOLLOW_UP_3M, status.NO_SHOW, "Follow-up"),
        (-2, 9, 30, VisitKind.ROUTINE, status.SEEN, "Routine check-up"),
        (-3, 12, 0, VisitKind.VISIT_2, status.CANCELLED, "Patient rescheduled"),
        (1, 9, 0, VisitKind.VISIT_1, status.BOOKED, "Irregular cycles"),
        (1, 10, 30, VisitKind.FOLLOW_UP_3M, status.BOOKED, "Iron levels review"),
        (2, 11, 0, VisitKind.VISIT_2, status.BOOKED, "Hormone panel results"),
        (3, 9, 45, VisitKind.ANNUAL_REVIEW, status.BOOKED, "Annual review"),
        (6, 12, 15, VisitKind.ROUTINE, status.BOOKED, "Routine smear"),
    ]
    tz = timezone.get_current_timezone()
    for index, (days, hour, minute, kind, state, reason) in enumerate(plan):
        starts_at = timezone.make_aware(datetime.combine(today + timedelta(days=days), time(hour, minute)), tz)
        Appointment.objects.create(
            organization=clinic, patient=patients[index % len(patients)], starts_at=starts_at, kind=kind,
            reason=reason, status=state, created_by=doctor,
            checked_in_at=starts_at if state in (status.CHECKED_IN, status.SEEN) else None,
            checked_in_by=doctor if state in (status.CHECKED_IN, status.SEEN) else None,
        )
    print(f"  ✓ Created {len(plan)} appointments around {today}")


def seed():
    seed_base()
    print("🩺 Seeding V-Clinic preview data...")

    # The base admin is created unverified; login requires a verified phone.
    admin = verified(User.objects.get(email=ADMIN_EMAIL), first_name="Hussain", last_name="Gohar")
    print(f"  ✓ Verified {admin.email} (Dr Hussain Gohar, clinic owner)")

    clinic = Organization.objects.get(memberships__user=admin, memberships__role=OrganizationMember.Role.OWNER)
    if clinic.name != CLINIC_NAME:
        clinic.name = CLINIC_NAME
        clinic.save(update_fields=["name"])
        print(f"  ✓ Clinic renamed to {CLINIC_NAME}")

    for staff in STAFF:
        fields = {key: value for key, value in staff.items() if key != "role"}
        user = User.objects.filter(email=fields["email"]).first()
        if user is None:
            user = User.objects.create_user(password=PASSWORD, **fields)
            print(f"  ✓ Created {user.email} ({staff['role']})")
        verified(user)
        OrganizationMember.objects.get_or_create(organization=clinic, user=user, defaults={"role": staff["role"]})

    for email, role in INVITES:
        Invitation.objects.get_or_create(
            organization=clinic, email=email, status=Invitation.Status.PENDING,
            defaults={"role": role, "invited_by": admin},
        )

    call_command("seed_demo_data", org=clinic.slug, user=admin.email)
    seed_appointments(clinic, admin)

    print("🎉 Preview data ready.")
    print(f"   Doctor: {admin.email} — password from DEV_SUPERUSER_PASSWORD (default admin12345)")
    print(f"   Staff:  {', '.join(s['email'] for s in STAFF)} — password {PASSWORD}")


if __name__ == "__main__":
    seed()
