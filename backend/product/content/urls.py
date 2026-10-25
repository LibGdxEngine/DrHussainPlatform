from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AlertRuleViewSet, ClinicProfileView, EmailTemplateViewSet, LeafletViewSet, PlaceholderListView,
    PrescriptionViewSet, ScoreBandViewSet,
)

app_name = 'content'

router = DefaultRouter()
router.register(r'templates', EmailTemplateViewSet, basename='template')
router.register(r'prescriptions', PrescriptionViewSet, basename='prescription')
router.register(r'alert-rules', AlertRuleViewSet, basename='alert-rule')
router.register(r'score-bands', ScoreBandViewSet, basename='score-band')
router.register(r'leaflets', LeafletViewSet, basename='leaflet')

urlpatterns = [
    path('placeholders/', PlaceholderListView.as_view(), name='placeholders'),
    path('profile/', ClinicProfileView.as_view(), name='profile'),
    path('', include(router.urls)),
]
