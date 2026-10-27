from datetime import date

from django.conf import settings
from django.db import transaction
from django.http import FileResponse
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import generics, mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from core.api_errors import error_response
from product.audit import audit
from product.records.services import UploadRejected, sha256_of, sniff_content_type
from product.tenancy import IsClinicLead, IsOrganizationMember, OrganizationScopedMixin, get_request_organization

from . import placeholders
from .models import (
    AlertRule, AlertRuleVersion, ClinicProfile, EmailTemplate, EmailTemplateVersion, Leaflet, LeafletVersion,
    PrescriptionItem, PrescriptionVersion, ScoreBandSet, ScoreBandVersion,
)
from .serializers import (
    AlertRuleBulkSerializer, AlertRuleSerializer, AlertRuleVersionSerializer, ClinicProfileSerializer,
    EmailTemplateCreateSerializer, EmailTemplateSerializer, EmailTemplateVersionSerializer, LeafletReplaceSerializer,
    LeafletSerializer, LeafletUploadSerializer, LeafletVersionSerializer, PlaceholderSerializer,
    PrescriptionSerializer, PrescriptionVersionSerializer, ScoreBandSetSerializer, ScoreBandUpdateSerializer,
    ScoreBandVersionSerializer, TemplateApproveSerializer, TemplatePreviewRequestSerializer,
    TemplatePreviewSerializer, TemplateWordingSerializer,
)
from .starter import ensure_starter_content
from .versioning import add_version


class ContentViewMixin(OrganizationScopedMixin):
    """Everyone in the clinic can read its content; only the doctor changes it."""

    # Actions anyone in the clinic may call even though they are POSTs.
    member_actions = {'preview'}

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS or self.action in self.member_actions:
            return [IsOrganizationMember()]
        return [IsClinicLead()]

    def get_queryset(self):
        if not getattr(self, 'swagger_fake_view', False):
            ensure_starter_content(get_request_organization(self.request))
        return super().get_queryset()


def _include_archived(request) -> bool:
    return request.query_params.get('archived') in {'1', 'true'}


ARCHIVED_PARAM = OpenApiParameter('archived', OpenApiTypes.BOOL, description='Include archived items.')


# --- Templates ------------------------------------------------------------------------------------

@extend_schema_view(list=extend_schema(parameters=[
    ARCHIVED_PARAM,
    OpenApiParameter('kind', str, description='results, menopause, follow_up, infection, pathology, smear or reply.'),
    OpenApiParameter('language', str, description='en or ar.'),
    OpenApiParameter('pinned', OpenApiTypes.BOOL, description='Only templates pinned to the home page.'),
]))
class EmailTemplateViewSet(
    ContentViewMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
    mixins.UpdateModelMixin, viewsets.GenericViewSet,
):
    queryset = EmailTemplate.objects.prefetch_related('default_leaflets', 'versions__created_by',
                                                      'versions__approved_by')
    serializer_class = EmailTemplateSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == 'list':
            params = self.request.query_params
            if not _include_archived(self.request):
                queryset = queryset.filter(archived=False)
            for name in ('kind', 'language'):
                if params.get(name):
                    queryset = queryset.filter(**{name: params[name]})
            if params.get('pinned') in {'1', 'true'}:
                queryset = queryset.filter(pinned=True)
        return queryset

    @extend_schema(request=EmailTemplateCreateSerializer, responses={201: EmailTemplateSerializer})
    def create(self, request, *args, **kwargs):
        serializer = EmailTemplateCreateSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        subject, body = data.pop('subject'), data.pop('body')
        with transaction.atomic():
            template = EmailTemplate.objects.create(organization=serializer.context['organization'], **data)
            add_version(template, EmailTemplateVersion, {'subject': subject, 'body': body}, user=request.user,
                        note='Created')
        audit(request, 'template.created', template, key=template.key, language=template.language)
        return Response(self.get_serializer(template).data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        template = serializer.save()
        audit(self.request, 'template.updated', template, fields=sorted(serializer.validated_data))

    @extend_schema(methods=['get'], responses={200: EmailTemplateVersionSerializer(many=True)})
    @extend_schema(methods=['post'], request=TemplateWordingSerializer, responses={201: EmailTemplateSerializer})
    @action(detail=True, methods=['get', 'post'])
    def versions(self, request, pk=None):
        """The template's dated history, or save new wording as its next version."""
        template = self.get_object()
        if request.method == 'GET':
            history = template.versions.select_related('created_by', 'approved_by').order_by('-number')
            return Response(EmailTemplateVersionSerializer(history, many=True).data)
        serializer = TemplateWordingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        version, created = add_version(template, EmailTemplateVersion, {'subject': data['subject'], 'body': data['body']},
                                       user=request.user, note=data['note'])
        if data['approve'] and version.approved_at is None:
            version.approved_by, version.approved_at = request.user, timezone.now()
            version.save(update_fields=['approved_by', 'approved_at', 'updated_at'])
        if created or data['approve']:
            audit(request, 'template.version_saved', template, number=version.number, approved=data['approve'])
        return Response(self.get_serializer(template).data, status=status.HTTP_201_CREATED if created else 200)

    @extend_schema(request=TemplateApproveSerializer, responses={200: EmailTemplateSerializer})
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a saved version: drafts are built from the newest approved version."""
        template = self.get_object()
        serializer = TemplateApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        version = template.versions.filter(number=serializer.validated_data['number']).first()
        if version is None:
            return error_response('VERSION_NOT_FOUND', 'That version does not exist.', status=404)
        if version.approved_at is None:
            version.approved_by, version.approved_at = request.user, timezone.now()
            version.save(update_fields=['approved_by', 'approved_at', 'updated_at'])
            audit(request, 'template.approved', template, number=version.number)
        return Response(self.get_serializer(template).data)

    @extend_schema(request=TemplatePreviewRequestSerializer, responses={200: TemplatePreviewSerializer})
    @action(detail=False, methods=['post'])
    def preview(self, request):
        """Fill the wording with a fictitious sample patient, and list what the doctor would still fill."""
        serializer = TemplatePreviewRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        organization = get_request_organization(request)
        profile = ClinicProfile.objects.filter(organization=organization).first()
        values = {
            **placeholders.SAMPLE_VALUES,
            'today': f'{date.today():%d %b %Y}'.lstrip('0'),
            'clinic.name': (profile and profile.display_name) or organization.name,
            'clinic.phone': profile.phone if profile else '',
            'doctor.name': profile.doctor_name if profile else '',
        }
        subject = placeholders.render(serializer.validated_data['subject'], values)
        body = placeholders.render(serializer.validated_data['body'], values)
        errors = placeholders.validate_text(serializer.validated_data['subject'] + '\n' + serializer.validated_data['body'])
        return Response({
            'subject': subject.text, 'body': body.text,
            'open_slots': list(dict.fromkeys(subject.open_slots + body.open_slots)), 'errors': errors,
        })


class PlaceholderListView(generics.GenericAPIView):
    permission_classes = [IsOrganizationMember]
    serializer_class = PlaceholderSerializer

    @extend_schema(responses={200: PlaceholderSerializer(many=True)})
    def get(self, request):
        items = [{'name': n, 'description': d, 'filled': 'automatic'} for n, d in placeholders.AUTOMATIC.items()]
        items += [{'name': n, 'description': d, 'filled': 'review'} for n, d in placeholders.CHOSEN_IN_REVIEW.items()]
        return Response(items)


# --- Prescriptions --------------------------------------------------------------------------------

PRESCRIPTION_FIELDS = ('drug', 'dose', 'directions')


@extend_schema_view(list=extend_schema(parameters=[ARCHIVED_PARAM]))
class PrescriptionViewSet(
    ContentViewMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
    mixins.UpdateModelMixin, viewsets.GenericViewSet,
):
    """The clinic's prescription list. Items are archived, never deleted, so past emails stay explainable."""
    queryset = PrescriptionItem.objects.prefetch_related('versions__created_by')
    serializer_class = PrescriptionSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == 'list' and not _include_archived(self.request):
            queryset = queryset.filter(archived=False)
        return queryset

    def perform_create(self, serializer):
        data = serializer.validated_data
        with transaction.atomic():
            item = PrescriptionItem.objects.create(
                organization=serializer.context['organization'], sort_order=data.get('sort_order', 100),
            )
            add_version(item, PrescriptionVersion, {f: data.get(f, '') for f in PRESCRIPTION_FIELDS},
                        user=self.request.user, note=data.get('note') or 'Added')
        serializer.instance = item
        audit(self.request, 'prescription.created', item)

    def perform_update(self, serializer):
        item, data = serializer.instance, serializer.validated_data
        with transaction.atomic():
            for name in ('sort_order', 'archived'):
                if name in data:
                    setattr(item, name, data[name])
            item.save()
            wording = {f: data[f] for f in PRESCRIPTION_FIELDS if f in data}
            version, created = add_version(item, PrescriptionVersion, wording, user=self.request.user,
                                           note=data.get('note', ''))
        audit(self.request, 'prescription.updated', item, fields=sorted(data), version=version.number)

    @extend_schema(responses={200: PrescriptionVersionSerializer(many=True)})
    @action(detail=True, methods=['get'])
    def versions(self, request, pk=None):
        item = self.get_object()
        return Response(PrescriptionVersionSerializer(item.versions.select_related('created_by'), many=True).data)


# --- Alert rules ----------------------------------------------------------------------------------

RULE_FIELDS = ('field', 'pre', 'threshold_a', 'mid', 'threshold_b', 'post', 'level', 'message', 'enabled',
              'lab_test_code', 'lab_check', 'vital')


class AlertRuleViewSet(
    ContentViewMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
    mixins.UpdateModelMixin, viewsets.GenericViewSet,
):
    """Alert rules R1, R2, ... with editable cut-offs. The list grows: new rules get the next code."""
    queryset = AlertRule.objects.prefetch_related('versions__created_by')
    serializer_class = AlertRuleSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def perform_create(self, serializer):
        organization, data = serializer.context['organization'], serializer.validated_data
        with transaction.atomic():
            codes = AlertRule.objects.select_for_update().filter(organization=organization).values_list('code', flat=True)
            numbers = [int(c[1:]) for c in codes if c[1:].isdigit()]
            rule = AlertRule.objects.create(
                organization=organization, code=f'R{max(numbers, default=0) + 1}',
                sort_order=data.get('sort_order', len(numbers)),
            )
            add_version(rule, AlertRuleVersion, {f: data[f] for f in RULE_FIELDS if f in data},
                        user=self.request.user, note=data.get('note') or 'Added')
        serializer.instance = rule
        audit(self.request, 'alert_rule.created', rule, code=rule.code)

    def perform_update(self, serializer):
        rule, data = serializer.instance, serializer.validated_data
        version, _ = add_version(rule, AlertRuleVersion, {f: data[f] for f in RULE_FIELDS if f in data},
                                 user=self.request.user, note=data.get('note', ''))
        audit(self.request, 'alert_rule.updated', rule, code=rule.code, version=version.number)

    @extend_schema(responses={200: AlertRuleVersionSerializer(many=True)})
    @action(detail=True, methods=['get'])
    def versions(self, request, pk=None):
        rule = self.get_object()
        return Response(AlertRuleVersionSerializer(rule.versions.select_related('created_by'), many=True).data)

    @extend_schema(request=AlertRuleBulkSerializer, responses={200: AlertRuleSerializer(many=True)})
    @action(detail=False, methods=['post'])
    def bulk(self, request):
        """Save several cut-off and on/off changes at once; all or none are saved."""
        serializer = AlertRuleBulkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        changes = serializer.validated_data['rules']
        rules = {r.code: r for r in self.get_queryset().filter(code__in=[c['code'] for c in changes])}
        missing = sorted({c['code'] for c in changes} - set(rules))
        if missing:
            return error_response('validation_error', 'Please correct the highlighted fields.',
                                  fields={'rules': [f'Unknown rule: {", ".join(missing)}.']})
        saved = []
        with transaction.atomic():
            for index, change in enumerate(changes):
                rule = rules[change['code']]
                fields = {k: v for k, v in change.items() if k != 'code'}
                check = AlertRuleSerializer(rule, data=fields, partial=True, context=self.get_serializer_context())
                if not check.is_valid():
                    transaction.set_rollback(True)
                    return error_response(
                        'validation_error', 'Please correct the highlighted fields.',
                        fields={f'rules.{index}.{name}': messages for name, messages in check.errors.items()},
                    )
                version, created = add_version(rule, AlertRuleVersion, fields, user=request.user,
                                               note=serializer.validated_data['note'])
                if created:
                    saved.append(rule)
                    audit(request, 'alert_rule.updated', rule, code=rule.code, version=version.number)
        return Response(AlertRuleSerializer(saved, many=True).data)


# --- Score bands ----------------------------------------------------------------------------------

class ScoreBandViewSet(ContentViewMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = ScoreBandSet.objects.prefetch_related('versions__created_by')
    serializer_class = ScoreBandSetSerializer
    lookup_field = 'code'

    @extend_schema(request=ScoreBandUpdateSerializer, responses={200: ScoreBandSetSerializer})
    @action(detail=True, methods=['post'])
    def bands(self, request, code=None):
        band_set = self.get_object()
        serializer = ScoreBandUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        version, created = add_version(band_set, ScoreBandVersion, {'bands': serializer.validated_data['bands']},
                                       user=request.user, note=serializer.validated_data['note'])
        if created:
            audit(request, 'score_bands.updated', band_set, version=version.number)
        return Response(self.get_serializer(band_set).data)

    @extend_schema(responses={200: ScoreBandVersionSerializer(many=True)})
    @action(detail=True, methods=['get'])
    def versions(self, request, code=None):
        band_set = self.get_object()
        return Response(ScoreBandVersionSerializer(band_set.versions.select_related('created_by'), many=True).data)


# --- Leaflets -------------------------------------------------------------------------------------

def _store_leaflet_version(leaflet, upload, user, note):
    """Call inside a transaction: the leaflet row is locked while its next number is taken."""
    if upload.size > settings.DOCUMENT_MAX_UPLOAD_BYTES:
        raise UploadRejected('DOCUMENT_TOO_LARGE', 'Leaflets must be 25 MB or smaller.')
    if sniff_content_type(upload) != 'application/pdf':
        raise UploadRejected('UNSUPPORTED_DOCUMENT_TYPE', 'Leaflets must be PDF files.')
    Leaflet.objects.select_for_update().get(pk=leaflet.pk)
    latest = leaflet.versions.order_by('-number').first()
    version = LeafletVersion(
        leaflet=leaflet, number=(latest.number + 1) if latest else 1, original_filename=upload.name[:255],
        size=upload.size, sha256=sha256_of(upload), note=note[:255], created_by=user,
    )
    version.file.save(upload.name, upload, save=False)
    version.save()
    return version


def _upload_error(rejected):
    code_status = {'DOCUMENT_TOO_LARGE': 413, 'UNSUPPORTED_DOCUMENT_TYPE': 415}
    return error_response(rejected.code, rejected.message, status=code_status[rejected.code],
                          fields={'file': [rejected.message]})


@extend_schema_view(list=extend_schema(parameters=[ARCHIVED_PARAM]))
class LeafletViewSet(
    ContentViewMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
    mixins.UpdateModelMixin, viewsets.GenericViewSet,
):
    """Leaflets the doctor can attach to an email, e.g. the HPV information PDF."""
    queryset = Leaflet.objects.prefetch_related('versions__created_by')
    serializer_class = LeafletSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == 'list' and not _include_archived(self.request):
            queryset = queryset.filter(archived=False)
        return queryset

    @extend_schema(request={'multipart/form-data': LeafletUploadSerializer}, responses={201: LeafletSerializer})
    def create(self, request, *args, **kwargs):
        serializer = LeafletUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                leaflet = Leaflet.objects.create(organization=get_request_organization(request),
                                                 title=serializer.validated_data['title'])
                _store_leaflet_version(leaflet, serializer.validated_data['file'], request.user, 'Added')
        except UploadRejected as rejected:
            return _upload_error(rejected)
        audit(request, 'leaflet.created', leaflet)
        return Response(LeafletSerializer(leaflet).data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        leaflet = serializer.save()
        audit(self.request, 'leaflet.updated', leaflet, fields=sorted(serializer.validated_data))

    @extend_schema(request={'multipart/form-data': LeafletReplaceSerializer}, responses={201: LeafletSerializer})
    @action(detail=True, methods=['post'])
    def replace(self, request, pk=None):
        """Upload a newer file. Earlier files are kept so it is known which one a patient was sent."""
        leaflet = self.get_object()
        serializer = LeafletReplaceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                version = _store_leaflet_version(leaflet, serializer.validated_data['file'], request.user,
                                                 serializer.validated_data['note'])
        except UploadRejected as rejected:
            return _upload_error(rejected)
        audit(request, 'leaflet.replaced', leaflet, version=version.number)
        return Response(LeafletSerializer(leaflet).data, status=status.HTTP_201_CREATED)

    @extend_schema(responses={200: LeafletVersionSerializer(many=True)})
    @action(detail=True, methods=['get'])
    def versions(self, request, pk=None):
        leaflet = self.get_object()
        return Response(LeafletVersionSerializer(leaflet.versions.select_related('created_by'), many=True).data)

    @extend_schema(
        parameters=[OpenApiParameter('version', OpenApiTypes.INT, description='An earlier version; default latest.')],
        responses={(200, 'application/pdf'): OpenApiTypes.BINARY},
    )
    @action(detail=True, methods=['get'])
    def file(self, request, pk=None):
        leaflet = self.get_object()
        versions = leaflet.versions.order_by('-number')
        number = request.query_params.get('version')
        version = versions.filter(number=number).first() if number and number.isdigit() else versions.first()
        if version is None:
            return error_response('not_found', 'The requested resource was not found.', status=404)
        response = FileResponse(version.file.open('rb'), content_type='application/pdf',
                                filename=version.original_filename)
        response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response


# --- Clinic profile -------------------------------------------------------------------------------

class ClinicProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = ClinicProfileSerializer
    http_method_names = ['get', 'patch', 'head', 'options']

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [IsOrganizationMember()]
        return [IsClinicLead()]

    def get_object(self):
        organization = get_request_organization(self.request)
        profile, _ = ClinicProfile.objects.get_or_create(
            organization=organization, defaults={'display_name': organization.name},
        )
        return profile

    def perform_update(self, serializer):
        profile = serializer.save()
        audit(self.request, 'clinic_profile.updated', profile, fields=sorted(serializer.validated_data))
