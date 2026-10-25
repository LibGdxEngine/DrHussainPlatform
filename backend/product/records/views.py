from django.http import FileResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from core.api_errors import error_response
from product.audit import audit
from product.results.pipeline import schedule_reading
from product.tenancy import OrganizationScopedMixin

from .models import Document
from .serializers import DocumentSerializer, DocumentUploadSerializer
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
