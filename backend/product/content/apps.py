from django.apps import AppConfig


class ContentConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'product.content'
    label = 'content'
    verbose_name = 'Clinic content'
