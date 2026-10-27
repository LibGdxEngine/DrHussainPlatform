from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import IntakeFormView, IntakeFormViewSet, IntakeOpenView, IntakeVerifyView

app_name = 'intake'

router = DefaultRouter()
router.register(r'forms', IntakeFormViewSet, basename='intake-form')

urlpatterns = [
    path('public/open/', IntakeOpenView.as_view(), name='public-open'),
    path('public/verify/', IntakeVerifyView.as_view(), name='public-verify'),
    path('public/form/', IntakeFormView.as_view(), name='public-form'),
    path('', include(router.urls)),
]
