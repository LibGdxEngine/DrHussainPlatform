from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import PatientAlertViewSet

app_name = 'alerts'

router = DefaultRouter()
router.register(r'', PatientAlertViewSet, basename='alert')

urlpatterns = [
    path('', include(router.urls)),
]
