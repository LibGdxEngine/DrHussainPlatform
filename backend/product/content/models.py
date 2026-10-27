"""
Clinic-editable content: email templates, prescriptions, leaflets and alert rules.

Every item keeps a dated, immutable history: an edit adds a new version and never changes an old
one, so the clinic can always see what wording or cut-off was in force when something was sent.
"""
from django.conf import settings
from django.db import models

from apps.common.models import BaseModel
from apps.organizations.models import Organization
from product.patients.models import Language
from product.records.models import private_storage


class Version(BaseModel):
    """Fields every version row carries. `number` counts up from 1 per item."""
    number = models.PositiveIntegerField()
    note = models.CharField(max_length=255, blank=True, default='', help_text='Why it changed.')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='+')

    class Meta:
        abstract = True
        ordering = ['-number']


class ClinicProfile(BaseModel):
    """Details the email templates quote, such as the phone number patients call to book."""
    organization = models.OneToOneField(Organization, on_delete=models.CASCADE, related_name='clinic_profile')
    display_name = models.CharField(max_length=255, blank=True, default='')
    phone = models.CharField(max_length=64, blank=True, default='')
    doctor_name = models.CharField(max_length=255, blank=True, default='')
    signature = models.TextField(blank=True, default='', help_text='Closing lines added under every email.')

    def __str__(self):
        return self.display_name or self.organization.name


class TemplateKind(models.TextChoices):
    """Which results email a template belongs to, from the spec's routing table."""
    RESULTS = 'results', 'Normal results'
    MENOPAUSE = 'menopause', 'Menopause / perimenopause results'
    FOLLOW_UP = 'follow_up', 'Follow-up comparison'
    INFECTION = 'infection', 'Infections and STIs'
    PATHOLOGY = 'pathology', 'Pathology results'
    SMEAR = 'smear', 'Cervical smear'
    REPLY = 'reply', 'Reply about a prescription'


class TemplatePart(models.TextChoices):
    FULL = 'full', 'Whole email'
    OPENING = 'opening', 'Opening'
    SECTION = 'section', 'Section'
    CLOSING = 'closing', 'Closing'


class Leaflet(BaseModel):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='leaflets')
    title = models.CharField(max_length=255)
    archived = models.BooleanField(default=False)

    class Meta:
        ordering = ['title']

    def __str__(self):
        return self.title

    @property
    def current(self):
        return self.versions.order_by('-number').first()


def leaflet_upload_to(instance, filename):
    return f'leaflets/{instance.leaflet.organization_id}/{instance.leaflet_id}/v{instance.number}.pdf'


class LeafletVersion(Version):
    leaflet = models.ForeignKey(Leaflet, on_delete=models.CASCADE, related_name='versions')
    file = models.FileField(storage=private_storage, upload_to=leaflet_upload_to, max_length=255)
    original_filename = models.CharField(max_length=255)
    size = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64)

    class Meta(Version.Meta):
        constraints = [models.UniqueConstraint(fields=['leaflet', 'number'], name='content_leaflet_version_number')]


class EmailTemplate(BaseModel):
    """
    One piece of a results email. The STI email, for example, is an opening, one section per
    positive result (section_key = the test code) and a closing, assembled when drafting.
    """
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='email_templates')
    key = models.SlugField(max_length=80)
    language = models.CharField(max_length=2, choices=Language.choices, default=Language.ENGLISH)
    name = models.CharField(max_length=255)
    kind = models.CharField(max_length=20, choices=TemplateKind.choices)
    part = models.CharField(max_length=10, choices=TemplatePart.choices, default=TemplatePart.FULL)
    section_key = models.CharField(max_length=64, blank=True, default='', help_text='e.g. chlamydia or smear_5.')
    sort_order = models.PositiveIntegerField(default=100)
    default_leaflets = models.ManyToManyField(Leaflet, blank=True, related_name='templates')
    archived = models.BooleanField(default=False)
    # Shown on the doctor's home page for quick editing.
    pinned = models.BooleanField(default=False, db_index=True)

    class Meta:
        ordering = ['kind', 'sort_order', 'key']
        constraints = [
            models.UniqueConstraint(fields=['organization', 'key', 'language'], name='content_template_key_language'),
        ]

    def __str__(self):
        return f'{self.name} ({self.language})'

    @property
    def latest(self):
        return self.versions.order_by('-number').first()

    @property
    def approved(self):
        """The version drafts are built from: the newest approved one."""
        return self.versions.filter(approved_at__isnull=False).order_by('-number').first()


class EmailTemplateVersion(Version):
    template = models.ForeignKey(EmailTemplate, on_delete=models.CASCADE, related_name='versions')
    subject = models.CharField(max_length=255, blank=True, default='')
    body = models.TextField()
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name='+')
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta(Version.Meta):
        constraints = [models.UniqueConstraint(fields=['template', 'number'], name='content_template_version_number')]


class PrescriptionItem(BaseModel):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='prescription_items')
    sort_order = models.PositiveIntegerField(default=100)
    archived = models.BooleanField(default=False)

    class Meta:
        ordering = ['sort_order', 'created_at']

    @property
    def current(self):
        return self.versions.order_by('-number').first()


class PrescriptionVersion(Version):
    item = models.ForeignKey(PrescriptionItem, on_delete=models.CASCADE, related_name='versions')
    drug = models.CharField(max_length=255)
    dose = models.CharField(max_length=255, blank=True, default='')
    directions = models.TextField(blank=True, default='')

    class Meta(Version.Meta):
        constraints = [models.UniqueConstraint(fields=['item', 'number'], name='content_prescription_version_number')]


class AlertLevel(models.TextChoices):
    RED = 'red', 'Red'
    AMBER = 'amber', 'Amber'
    REMINDER = 'reminder', 'Reminder'


class AlertRule(BaseModel):
    """One alert rule (R1, R2, ...). Its sentence renders as: pre [threshold_a] mid [threshold_b] post."""
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='alert_rules')
    code = models.CharField(max_length=10)
    sort_order = models.PositiveIntegerField(default=100)

    class Meta:
        ordering = ['sort_order', 'code']
        constraints = [models.UniqueConstraint(fields=['organization', 'code'], name='content_alert_rule_code')]

    def __str__(self):
        return self.code

    @property
    def current(self):
        return self.versions.order_by('-number').first()


class LabCheck(models.TextChoices):
    """How a rule is checked against lab results. Rules about forms and history are not checked here."""
    NONE = '', 'Not checked against results'
    ABOVE = 'gt', 'Above the cut-off'
    AT_OR_ABOVE = 'gte', 'At or above the cut-off'
    BELOW = 'lt', 'Below the cut-off'
    AT_OR_BELOW = 'lte', 'At or below the cut-off'
    NEVER_MEASURED = 'never_measured', 'Never measured'


class VitalSign(models.TextChoices):
    """A measurement from the examination screen that a rule can be checked against."""
    NONE = '', 'Not checked against vitals'
    BLOOD_PRESSURE = 'blood_pressure', 'Blood pressure (average)'
    BMI = 'bmi', 'BMI'
    WAIST = 'waist', 'Waist'


class AlertRuleVersion(Version):
    rule = models.ForeignKey(AlertRule, on_delete=models.CASCADE, related_name='versions')
    field = models.CharField(max_length=255)
    pre = models.CharField(max_length=255, blank=True, default='')
    # Cut-offs are text: some are numbers, some are "[set]" until the clinic picks a value.
    threshold_a = models.CharField(max_length=32, null=True, blank=True)
    mid = models.CharField(max_length=255, blank=True, default='')
    threshold_b = models.CharField(max_length=32, null=True, blank=True)
    post = models.CharField(max_length=255, blank=True, default='')
    level = models.CharField(max_length=10, choices=AlertLevel.choices)
    message = models.CharField(max_length=255)
    enabled = models.BooleanField(default=True)
    # When set, the rule is checked against the patient's results: the latest value of this catalog
    # test compared with threshold_a, or "never measured".
    lab_test_code = models.SlugField(max_length=64, blank=True, default='')
    lab_check = models.CharField(max_length=16, choices=LabCheck.choices, blank=True, default='')
    # When set (instead of lab_test_code), the rule is checked against the patient's latest
    # examination with lab_check as the comparison. For blood pressure, threshold_a is the systolic
    # cut-off and threshold_b the diastolic one; crossing either fires the rule.
    vital = models.CharField(max_length=20, choices=VitalSign.choices, blank=True, default='')

    class Meta(Version.Meta):
        constraints = [models.UniqueConstraint(fields=['rule', 'number'], name='content_alert_rule_version_number')]


class ScoreBandSet(BaseModel):
    """Score bands shown as labels next to a score (e.g. MRS mild / moderate / severe), not alerts."""
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='score_band_sets')
    code = models.SlugField(max_length=32)
    name = models.CharField(max_length=128)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['organization', 'code'], name='content_score_band_code')]

    @property
    def current(self):
        return self.versions.order_by('-number').first()


class ScoreBandVersion(Version):
    band_set = models.ForeignKey(ScoreBandSet, on_delete=models.CASCADE, related_name='versions')
    # [{"label": "Mild", "min": 5}, ...] in ascending order.
    bands = models.JSONField()

    class Meta(Version.Meta):
        constraints = [models.UniqueConstraint(fields=['band_set', 'number'], name='content_score_band_version_number')]
