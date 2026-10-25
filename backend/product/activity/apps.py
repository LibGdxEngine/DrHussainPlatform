from django.apps import AppConfig


class ActivityConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'product.activity'
    label = 'activity'
    verbose_name = 'Clinic activity log'
