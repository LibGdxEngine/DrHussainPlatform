from .base import *
import os

from django.core.exceptions import ImproperlyConfigured


def _required_secret(name: str, *, minimum_length: int = 32) -> str:
    value = os.environ.get(name, '').strip()
    if len(value) < minimum_length or value.startswith(('dev-', 'django-insecure-', 'changeme', 'generate-')):
        raise ImproperlyConfigured(
            f'{name} must be set to a real secret of at least {minimum_length} characters in production.'
        )
    return value


# Enforce secret key configuration in production
SECRET_KEY = _required_secret('SECRET_KEY')
SIMPLE_JWT = {**SIMPLE_JWT, 'SIGNING_KEY': SECRET_KEY}
OTP_SECRET = _required_secret('OTP_SECRET')

# Patient files and mailbox passwords are encrypted with these keys. Without them the code would fall
# back to keys derived from SECRET_KEY, and rotating SECRET_KEY would make every file unreadable.
MEDIA_ENCRYPTION_KEYS = _required_secret('MEDIA_ENCRYPTION_KEYS', minimum_length=44)
MAIL_CREDENTIALS_KEY = _required_secret('MAIL_CREDENTIALS_KEY', minimum_length=44)

# A WhatsApp connection that is switched on must authenticate its webhooks.
for _name, _connection in HIREAGENTS_CONNECTIONS.items():
    if _connection['channel_id'] and not (_connection['webhook_api_key'] and _connection['webhook_signing_secret']):
        raise ImproperlyConfigured(
            f'HIREAGENTS_{_name.upper()}_WEBHOOK_API_KEY and _WEBHOOK_SIGNING_SECRET are required '
            f'when HIREAGENTS_{_name.upper()}_CHANNEL_ID is set.'
        )

DEBUG = False

# Platform email goes out over SMTP unless the deployment says otherwise (the test site discards it).
EMAIL_BACKEND = os.environ.get('EMAIL_BACKEND', 'django.core.mail.backends.smtp.EmailBackend')

# API credentials must pass account, session-revocation, and onboarding checks.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'apps.accounts.authentication.VersionedJWTAuthentication',
    ],
}

ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '').split(',')

# Enforce PostgreSQL database configuration in production
DB_NAME = os.environ['DB_NAME']
DB_USER = os.environ['DB_USER']
DB_PASSWORD = os.environ['DB_PASSWORD']
DB_HOST = os.environ['DB_HOST']
DB_PORT = os.environ['DB_PORT']

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': DB_NAME,
        'USER': DB_USER,
        'PASSWORD': DB_PASSWORD,
        'HOST': DB_HOST,
        'PORT': DB_PORT,
    }
}

# CORS settings
CORS_ALLOWED_ORIGINS = os.environ.get('CORS_ALLOWED_ORIGINS', '').split(',')
CORS_ALLOWED_ORIGINS = [origin for origin in CORS_ALLOWED_ORIGINS if origin]

# CSRF settings (essential when running behind Caddy/Nginx)
CSRF_TRUSTED_ORIGINS = os.environ.get('CSRF_TRUSTED_ORIGINS', '').split(',')
CSRF_TRUSTED_ORIGINS = [origin for origin in CSRF_TRUSTED_ORIGINS if origin]

# Production Security Best Practices
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = os.environ.get('SECURE_SSL_REDIRECT', 'True') == 'True'
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_CONTENT_TYPE_NOSNIFF = True

# HSTS settings (only apply if SSL redirect is active)
if SECURE_SSL_REDIRECT:
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
