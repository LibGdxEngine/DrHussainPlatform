from django.apps import AppConfig


class RecordsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'product.records'
    label = 'records'
    verbose_name = 'Patient records'
