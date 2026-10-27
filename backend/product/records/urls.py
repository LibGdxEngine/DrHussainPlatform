from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import DiagnosisViewSet, DocumentViewSet, ExaminationViewSet

app_name = 'records'

router = DefaultRouter()
router.register(r'documents', DocumentViewSet, basename='document')
router.register(r'diagnoses', DiagnosisViewSet, basename='diagnosis')
router.register(r'examinations', ExaminationViewSet, basename='examination')

urlpatterns = [
    path('', include(router.urls)),
]
