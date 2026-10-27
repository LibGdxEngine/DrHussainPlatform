from django.apps import AppConfig


class OrdersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'product.orders'
    label = 'orders'
    verbose_name = 'Orders and prescriptions'
