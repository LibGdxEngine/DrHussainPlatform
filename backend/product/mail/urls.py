from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import MailAttachmentViewSet, MailboxCheckView, MailboxSyncView, MailboxView, MailThreadViewSet

app_name = 'mail'

router = DefaultRouter()
router.register(r'threads', MailThreadViewSet, basename='thread')
router.register(r'attachments', MailAttachmentViewSet, basename='attachment')

urlpatterns = [
    path('mailbox/', MailboxView.as_view(), name='mailbox'),
    path('mailbox/check/', MailboxCheckView.as_view(), name='mailbox-check'),
    path('mailbox/sync/', MailboxSyncView.as_view(), name='mailbox-sync'),
    path('', include(router.urls)),
]
