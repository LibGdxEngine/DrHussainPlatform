from django.apps import AppConfig


class IntakeConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'product.intake'
    label = 'intake'
    verbose_name = 'Patient forms'
