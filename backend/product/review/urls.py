from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ResultsCaseViewSet

app_name = 'review'

router = DefaultRouter()
router.register(r'cases', ResultsCaseViewSet, basename='case')

urlpatterns = [
    path('', include(router.urls)),
]
