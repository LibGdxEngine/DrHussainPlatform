from datetime import date

from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.common.pagination import StandardResultsSetPagination
from core.api_errors import error_response
from product.audit import audit, audit_access
from product.tenancy import OrganizationScopedMixin

from .models import Patient
from .serializers import PatientCreateSerializer, PatientSerializer, SimilarPatientSerializer
from .services import create_patient, find_similar, normalize_file_number, search_patients


@extend_schema_view(
    list=extend_schema(parameters=[
        OpenApiParameter('q', str, description='Search by name (English or Arabic), file number, mobile or email.'),
        OpenApiParameter(
            'date_of_birth', date,
            description='Only patients born on or within a year of this day, nearest first (YYYY-MM-DD).',
        ),
        OpenApiParameter('file_number', str, description='Exact file number, e.g. VC-000142.'),
    ]),
    create=extend_schema(
        request=PatientCreateSerializer,
        responses={201: PatientSerializer, 409: OpenApiResponse(description='DUPLICATE_PATIENT')},
    ),
)
class PatientViewSet(
    OrganizationScopedMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Patient files of the caller's clinic. Files are never deleted from the API."""
    queryset = Patient.objects.all()
    serializer_class = PatientSerializer
    pagination_class = StandardResultsSetPagination
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_serializer_class(self):
        return PatientCreateSerializer if self.action == 'create' else PatientSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action != 'list':
            return queryset
        params = self.request.query_params
        if params.get('file_number'):
            queryset = queryset.filter(file_number=normalize_file_number(params['file_number']))
        query = params.get('q', '').strip()
        date_of_birth = self._date_param('date_of_birth')
        if query or date_of_birth:
            self._searched = ' '.join(filter(None, [query, date_of_birth and date_of_birth.isoformat()]))
        return search_patients(queryset, query=query, date_of_birth=date_of_birth)

    def _date_param(self, name: str) -> date | None:
        value = self.request.query_params.get(name, '').strip()
        if not value:
            return None
        try:
            return date.fromisoformat(value)
        except ValueError:
            raise ValidationError({name: ['Enter a date as YYYY-MM-DD.']})

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        if getattr(self, '_searched', ''):
            # Who looked up which patients is part of the record of access.
            audit_access(request, 'patient.searched', query=self._searched[:100], results=response.data.get('count'))
        return response

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        fields = dict(serializer.validated_data)
        confirm_duplicate = fields.pop('confirm_duplicate')
        organization = serializer.context['organization']
        similar = find_similar(organization, fields['full_name'], fields['date_of_birth'], fields.get('full_name_ar', ''))
        if not confirm_duplicate and similar.exists():
            return error_response(
                'DUPLICATE_PATIENT',
                'A patient with the same name and date of birth is already registered.',
                status=status.HTTP_409_CONFLICT,
                context={'similar': SimilarPatientSerializer(similar, many=True).data},
            )
        patient = create_patient(organization, **fields)
        audit(request, 'patient.created', patient, duplicate_confirmed=confirm_duplicate and similar.exists())
        return Response(PatientSerializer(patient, context=self.get_serializer_context()).data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, *args, **kwargs):
        patient = self.get_object()
        audit(request, 'patient.opened', patient)
        return Response(self.get_serializer(patient).data)

    def perform_update(self, serializer):
        patient = serializer.save()
        audit(self.request, 'patient.updated', patient, fields=sorted(serializer.validated_data))
