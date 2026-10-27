from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import InvitationViewSet, JoinAcceptView, JoinPreviewView, MemberViewSet, MeView

app_name = 'staff'

router = DefaultRouter()
router.register(r'members', MemberViewSet, basename='member')
router.register(r'invitations', InvitationViewSet, basename='invitation')

urlpatterns = [
    path('me/', MeView.as_view(), name='me'),
    path('join/preview/', JoinPreviewView.as_view(), name='join-preview'),
    path('join/accept/', JoinAcceptView.as_view(), name='join-accept'),
    path('', include(router.urls)),
]
