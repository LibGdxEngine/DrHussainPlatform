from django.http import FileResponse
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from core.api_errors import error_response
from product.audit import audit, audit_access
from product.results.pipeline import schedule_reading
from product.tenancy import IsClinicLead, OrganizationScopedMixin

from .models import Diagnosis, DiagnosisRevision, Document, Examination, ExaminationRevision
from .serializers import DiagnosisSerializer, DocumentSerializer, DocumentUploadSerializer, ExaminationSerializer
from .services import UploadRejected, store_document

UPLOAD_ERROR_STATUS = {
    'DOCUMENT_TOO_LARGE': status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
    'UNSUPPORTED_DOCUMENT_TYPE': status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
    'DUPLICATE_DOCUMENT': status.HTTP_409_CONFLICT,
}


@extend_schema_view(
    list=extend_schema(parameters=[
        OpenApiParameter('patient', OpenApiTypes.UUID, description='Only this patient\'s documents.'),
        OpenApiParameter('slot', str, description='Only this category, e.g. lab.'),
    ]),
    create=extend_schema(
        request={'multipart/form-data': DocumentUploadSerializer},
        responses={
            201: DocumentSerializer,
            409: OpenApiResponse(description='DUPLICATE_DOCUMENT'),
            413: OpenApiResponse(description='DOCUMENT_TOO_LARGE'),
            415: OpenApiResponse(description='UNSUPPORTED_DOCUMENT_TYPE'),
        },
    ),
)
class DocumentViewSet(
    OrganizationScopedMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Scanned and uploaded files in a patient's record. Medical records are never deleted from the API."""
    queryset = Document.objects.select_related('patient', 'uploaded_by')
    serializer_class = DocumentSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_serializer_class(self):
        return DocumentUploadSerializer if self.action == 'create' else DocumentSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == 'list':
            params = self.request.query_params
            if params.get('patient'):
                queryset = queryset.filter(patient_id=params['patient'])
            if params.get('slot'):
                queryset = queryset.filter(slot=params['slot'])
        return queryset

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        if request.query_params.get('patient'):
            audit_access(request, 'document.listed', patient_id=request.query_params['patient'],
                         count=response.data['count'])
        return response

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        fields = dict(serializer.validated_data)
        try:
            document = store_document(
                organization=serializer.context['organization'],
                patient=fields.pop('patient'),
                upload=fields.pop('file'),
                uploaded_by=request.user,
                **fields,
            )
        except UploadRejected as rejected:
            return error_response(
                rejected.code, rejected.message, status=UPLOAD_ERROR_STATUS[rejected.code], fields={'file': [rejected.message]},
            )
        audit(request, 'document.uploaded', document, patient_id=str(document.patient_id), slot=document.slot)
        schedule_reading(document)
        return Response(DocumentSerializer(document).data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        document = serializer.save()
        audit(self.request, 'document.updated', document, fields=sorted(serializer.validated_data))
        # A file moved into lab results or pathology is read like a new upload.
        if 'slot' in serializer.validated_data and not hasattr(document, 'report'):
            schedule_reading(document)

    @extend_schema(
        parameters=[OpenApiParameter('download', OpenApiTypes.BOOL, description='Save the file instead of showing it.')],
        responses={(200, 'application/octet-stream'): OpenApiTypes.BINARY},
    )
    @action(detail=True, methods=['get'])
    def file(self, request, pk=None):
        """Stream the original file to a signed-in member of the clinic."""
        document = self.get_object()
        audit(request, 'document.opened', document, patient_id=str(document.patient_id))
        response = FileResponse(
            document.file.open('rb'),
            content_type=document.content_type,
            as_attachment=request.query_params.get('download') in {'1', 'true'},
            filename=document.original_filename,
        )
        response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response


@extend_schema_view(
    list=extend_schema(parameters=[
        OpenApiParameter('patient', OpenApiTypes.UUID, required=True, description='Patient whose diagnoses are requested.'),
    ]),
)
class DiagnosisViewSet(OrganizationScopedMixin, mixins.ListModelMixin, mixins.CreateModelMixin,
                       mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Doctor-only diagnoses with versioned clinical content and no delete endpoint."""
    queryset = Diagnosis.objects.select_related('patient').prefetch_related('revisions__author')
    serializer_class = DiagnosisSerializer
    permission_classes = [IsClinicLead]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == 'list' and not getattr(self, 'swagger_fake_view', False):
            try:
                patient_id = serializers.UUIDField().run_validation(self.request.query_params.get('patient'))
            except serializers.ValidationError:
                raise serializers.ValidationError({'patient': 'A valid patient ID is required.'})
            queryset = queryset.filter(patient_id=patient_id)
        return queryset

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        audit_access(request, 'diagnosis.listed', patient_id=request.query_params['patient'],
                     count=response.data['count'])
        return response

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        audit(request, 'diagnosis.opened', instance, patient_id=str(instance.patient_id))
        return Response(self.get_serializer(instance).data)

    @staticmethod
    def _save_revision(instance, author):
        DiagnosisRevision.objects.create(diagnosis=instance, number=instance.version, author=author,
                                         name=instance.name, status=instance.status,
                                         noted_on=instance.noted_on, notes=instance.notes)

    @transaction.atomic
    def perform_create(self, serializer):
        instance = serializer.save(organization=serializer.context['organization'], created_by=self.request.user)
        self._save_revision(instance, self.request.user)
        audit(self.request, 'diagnosis.created', instance, patient_id=str(instance.patient_id))

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        changes = dict(serializer.validated_data)
        expected = changes.pop('expected_version')
        if not changes:
            raise serializers.ValidationError({'non_field_errors': 'Provide at least one field to update.'})
        updated = Diagnosis.objects.filter(pk=instance.pk, version=expected).update(
            **changes, version=F('version') + 1, updated_at=timezone.now(),
        )
        if not updated:
            return error_response('DIAGNOSIS_CONFLICT',
                                  'This diagnosis has changed. Reload it before editing.', status=409)
        instance = self.get_queryset().get(pk=instance.pk)
        self._save_revision(instance, request.user)
        audit(request, 'diagnosis.updated', instance, patient_id=str(instance.patient_id), fields=sorted(changes))
        # A fresh queryset avoids returning a prefetched, stale revision list.
        instance = self.get_queryset().get(pk=instance.pk)
        return Response(self.get_serializer(instance).data)


def _evaluate_alerts(patient):
    """Vitals rules (blood pressure, BMI, waist) read the latest examination; run them once it is saved."""
    from product.alerts.services import evaluate_patient

    transaction.on_commit(lambda: evaluate_patient(patient))


@extend_schema_view(
    list=extend_schema(parameters=[
        OpenApiParameter('patient', OpenApiTypes.UUID, required=True, description='Patient whose examinations are requested.'),
    ]),
)
class ExaminationViewSet(OrganizationScopedMixin, mixins.ListModelMixin, mixins.CreateModelMixin,
                         mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Doctor-only examinations (vitals, findings, screening, plan), versioned, with no delete endpoint."""
    queryset = Examination.objects.select_related('patient').prefetch_related('revisions__author')
    serializer_class = ExaminationSerializer
    permission_classes = [IsClinicLead]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == 'list' and not getattr(self, 'swagger_fake_view', False):
            try:
                patient_id = serializers.UUIDField().run_validation(self.request.query_params.get('patient'))
            except serializers.ValidationError:
                raise serializers.ValidationError({'patient': 'A valid patient ID is required.'})
            queryset = queryset.filter(patient_id=patient_id)
        return queryset

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        audit_access(request, 'examination.listed', patient_id=request.query_params['patient'],
                     count=response.data['count'])
        return response

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        audit(request, 'examination.opened', instance, patient_id=str(instance.patient_id))
        return Response(self.get_serializer(instance).data)

    @staticmethod
    def _save_revision(instance, author):
        ExaminationRevision.objects.create(examination=instance, number=instance.version, author=author,
                                           data=instance.snapshot())

    @transaction.atomic
    def perform_create(self, serializer):
        instance = serializer.save(organization=serializer.context['organization'], created_by=self.request.user)
        self._save_revision(instance, self.request.user)
        audit(self.request, 'examination.created', instance, patient_id=str(instance.patient_id))
        _evaluate_alerts(instance.patient)

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        changes = dict(serializer.validated_data)
        expected = changes.pop('expected_version')
        if not changes:
            raise serializers.ValidationError({'non_field_errors': 'Provide at least one field to update.'})
        # The screen sends the whole form; the audit names only what the doctor changed.
        changed = sorted(name for name, value in changes.items() if getattr(instance, name) != value)
        updated = Examination.objects.filter(pk=instance.pk, version=expected).update(
            **changes, version=F('version') + 1, updated_at=timezone.now(),
        )
        if not updated:
            return error_response('EXAMINATION_CONFLICT',
                                  'This examination has changed. Reload it before editing.', status=409)
        instance = self.get_queryset().get(pk=instance.pk)
        self._save_revision(instance, request.user)
        audit(request, 'examination.updated', instance, patient_id=str(instance.patient_id), fields=changed)
        _evaluate_alerts(instance.patient)
        # A fresh queryset avoids returning a prefetched, stale revision list.
        instance = self.get_queryset().get(pk=instance.pk)
        return Response(self.get_serializer(instance).data)
