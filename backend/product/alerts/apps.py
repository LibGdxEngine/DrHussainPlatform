from django.apps import AppConfig


class AlertsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'product.alerts'
    label = 'alerts'
    verbose_name = 'Patient alerts'

    def ready(self):
        from . import signals

        signals.connect()
