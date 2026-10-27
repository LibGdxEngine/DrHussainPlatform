from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import InvestigationReportViewSet, LabTestViewSet, ManualEntryView, ResultHistoryViewSet

app_name = 'results'

router = DefaultRouter()
router.register(r'tests', LabTestViewSet, basename='lab-test')
router.register(r'reports', InvestigationReportViewSet, basename='report')
router.register(r'history', ResultHistoryViewSet, basename='history')

urlpatterns = [
    path('manual-values/', ManualEntryView.as_view(), name='manual-values'),
    path('', include(router.urls)),
]
