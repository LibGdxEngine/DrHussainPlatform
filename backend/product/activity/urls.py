from django.urls import path

from .views import ActivityMembersView, ActivityView

app_name = 'activity'

urlpatterns = [
    path('', ActivityView.as_view(), name='activity'),
    path('members/', ActivityMembersView.as_view(), name='activity-members'),
]
