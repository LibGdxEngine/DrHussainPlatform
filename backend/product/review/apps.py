from django.apps import AppConfig


class ReviewConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'product.review'
    label = 'review'
    verbose_name = 'Results review queue'
