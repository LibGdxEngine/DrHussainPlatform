import os
from pathlib import Path

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third party apps
    'rest_framework',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'drf_spectacular',
    'django_celery_beat',
    
    # Platform apps
    'apps.common.apps.CommonConfig',
    'apps.accounts.apps.AccountsConfig',
    'apps.messaging.apps.MessagingConfig',
    'apps.integrations.apps.IntegrationsConfig',
    'apps.organizations.apps.OrganizationsConfig',
    'apps.billing.apps.BillingConfig',
    'apps.notifications.apps.NotificationsConfig',
    'apps.audit.apps.AuditConfig',

    # Product apps
    'product.patients.apps.PatientsConfig',
    'product.records.apps.RecordsConfig',
    'product.results.apps.ResultsConfig',
    'product.content.apps.ContentConfig',
    'product.review.apps.ReviewConfig',
    'product.mail.apps.MailConfig',
    'product.alerts.apps.AlertsConfig',
    'product.activity.apps.ActivityConfig',
]

MIDDLEWARE = [
    'core.middleware.api_errors.ApiErrorMiddleware',
    'corsheaders.middleware.CorsMiddleware',  # Needs to be at the top
    'django.middleware.security.SecurityMiddleware',
    'core.middleware.request_id.RequestIdMiddleware',  # Trace requests with X-Request-ID
    'whitenoise.middleware.WhiteNoiseMiddleware',  # WhiteNoise static serving
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]


ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'
ASGI_APPLICATION = 'core.asgi.application'

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Authentication Backends
AUTHENTICATION_BACKENDS = [
    'apps.accounts.backends.EmailOrPhoneBackend',
    'django.contrib.auth.backends.ModelBackend',
]

SILENCED_SYSTEM_CHECKS = ['auth.W004']

# Custom User Model
AUTH_USER_MODEL = 'accounts.User'

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
    # Patient documents: outside MEDIA_ROOT, encrypted at rest, and only served through authenticated views.
    "private": {
        "BACKEND": "product.storage.EncryptedFileSystemStorage",
        "OPTIONS": {"location": BASE_DIR / 'private_media'},
    },
}

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# DRF settings
REST_FRAMEWORK = {
    'EXCEPTION_HANDLER': 'core.api_errors.exception_handler',
    # Deny by default: a view opens itself up explicitly (AllowAny) when it is meant to be public.
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    # A ceiling against abuse; the sign-in, OTP and password-reset views carry much tighter scoped rates.
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': os.environ.get('THROTTLE_ANON', '120/min'),
        'user': os.environ.get('THROTTLE_USER', '1000/min'),
        'auth_login': os.environ.get('THROTTLE_LOGIN', '10/min'),
        'auth_otp': os.environ.get('THROTTLE_OTP', '10/min'),
        'auth_password': os.environ.get('THROTTLE_PASSWORD', '5/min'),
        'auth_signup': os.environ.get('THROTTLE_SIGNUP', '10/min'),
    },
    # Reverse proxies in front of Django (the gateway Caddy, plus the host's), so throttling keys on
    # the real client address. Unset, the whole X-Forwarded-For chain is the identity.
    'NUM_PROXIES': int(os.environ['REST_NUM_PROXIES']) if os.environ.get('REST_NUM_PROXIES') else None,
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'apps.accounts.authentication.VersionedJWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
        'rest_framework.authentication.BasicAuthentication',
    ],
    'DEFAULT_SCHEMA_CLASS': 'core.schema.ContractAutoSchema',
}

# OpenAPI / Swagger configuration
SPECTACULAR_SETTINGS = {
    'TITLE': 'Dockerized Full-Stack Template API',
    'DESCRIPTION': 'API documentation for our Next.js + Django starter project.',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'COMPONENT_SPLIT_REQUEST': True,
    'POSTPROCESSING_HOOKS': [
        'drf_spectacular.hooks.postprocess_schema_enums',
        'core.schema.add_error_responses',
    ],
    'ENUM_NAME_OVERRIDES': {
        'UserStatusEnum': 'apps.accounts.models.UserStatus.choices',
        'VerificationPurposeEnum': 'apps.accounts.models.VerificationPurpose.choices',
        'SubscriptionStatusEnum': 'apps.billing.models.Subscription.Status',
        'DocumentSourceEnum': 'product.records.models.DocumentSource',
        'ResultSourceEnum': 'product.results.models.ResultValue.Source',
        'LabTestKindEnum': 'product.results.models.LabTest.Kind',
        'TemplateKindEnum': 'product.content.models.TemplateKind',
        'LanguageEnum': 'product.patients.models.Language',
        'ResultsCaseStatusEnum': 'product.review.models.ResultsCase.Status',
        'ResultsCaseKindEnum': 'product.review.models.ResultsCase.Kind',
        'MailSecurityEnum': 'product.mail.models.Security',
    },
}

# SimpleJWT configuration
from datetime import timedelta
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    # Each settings module sets this to its SECRET_KEY; there is deliberately no built-in default.
    'SIGNING_KEY': os.environ.get('SECRET_KEY', ''),
    'AUTH_HEADER_TYPES': ('Bearer',),
    'TOKEN_OBTAIN_SERIALIZER': 'apps.accounts.api.serializers.auth.CustomTokenObtainPairSerializer',
}

# ------------------------------------------------------------------------------
# Messaging & WhatsApp Integration Settings (HireAgents)
# ------------------------------------------------------------------------------
# Keys OTP code digests. Development fills a fixed value in dev.py; production refuses to start without it.
OTP_SECRET = os.environ.get('OTP_SECRET', '')
WHATSAPP_AUTH_TEMPLATE = os.environ.get('WHATSAPP_AUTH_TEMPLATE', 'auth_verification_otp')
HIREAGENTS_BASE_URL = os.environ.get('HIREAGENTS_BASE_URL', 'https://hireagents.blinksolutions.tech')

HIREAGENTS_CONNECTIONS = {
    'auth': {
        'channel_id': os.environ.get('HIREAGENTS_AUTH_CHANNEL_ID', ''),
        'api_key': os.environ.get('HIREAGENTS_AUTH_API_KEY', ''),
        'webhook_api_key': os.environ.get('HIREAGENTS_AUTH_WEBHOOK_API_KEY', ''),
        'webhook_signing_secret': os.environ.get('HIREAGENTS_AUTH_WEBHOOK_SIGNING_SECRET', ''),
    },
    'support': {
        'channel_id': os.environ.get('HIREAGENTS_SUPPORT_CHANNEL_ID', ''),
        'api_key': os.environ.get('HIREAGENTS_SUPPORT_API_KEY', ''),
        'webhook_api_key': os.environ.get('HIREAGENTS_SUPPORT_WEBHOOK_API_KEY', ''),
        'webhook_signing_secret': os.environ.get('HIREAGENTS_SUPPORT_WEBHOOK_SIGNING_SECRET', ''),
    },
}

# ------------------------------------------------------------------------------
# Social Sign-In Providers
# ------------------------------------------------------------------------------
# A provider is enabled only when its client_id is set, so dropping the credentials
# into the environment is all that is needed to turn the flow on.
SOCIAL_AUTH_PROVIDERS = {
    'google': {
        'client_id': os.environ.get('GOOGLE_CLIENT_ID', ''),
    },
}

# Celery configurations
from celery.schedules import crontab

REDIS_URL = os.environ.get('REDIS_URL', 'redis://redis:6379/0')

CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', REDIS_URL)
CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND', REDIS_URL)
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE
CELERY_RESULT_EXPIRES = 3600
CELERY_RESULT_EXTENDED = True
CELERY_TASK_TRACK_STARTED = True

# Redeliver a task if the worker dies mid-execution rather than losing it.
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1

# The soft limit raises SoftTimeLimitExceeded inside the task so it can unwind; the hard
# limit kills the worker child process.
CELERY_TASK_SOFT_TIME_LIMIT = int(os.environ.get('CELERY_TASK_SOFT_TIME_LIMIT', 240))
CELERY_TASK_TIME_LIMIT = int(os.environ.get('CELERY_TASK_TIME_LIMIT', 300))

# Redis has no broker-side ack: it redelivers anything unacknowledged after visibility_timeout,
# so this must stay above the hard time limit plus the longest retry countdown.
CELERY_BROKER_TRANSPORT_OPTIONS = {
    'visibility_timeout': int(os.environ.get('CELERY_VISIBILITY_TIMEOUT', 3600)),
    'max_retries': 3,
}
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_TASK_DEFAULT_RETRY_DELAY = 5

CELERY_WORKER_MAX_TASKS_PER_CHILD = 200
CELERY_WORKER_MAX_MEMORY_PER_CHILD = 250_000  # KB
CELERY_WORKER_SEND_TASK_EVENTS = True
CELERY_WORKER_HIJACK_ROOT_LOGGER = False

CELERY_TASK_DEFAULT_QUEUE = 'celery'

# Maintenance sweeps are isolated onto their own queue so a long-running cleanup
# never delays latency-sensitive work such as OTP delivery.
CELERY_TASK_ROUTES = {
    'apps.accounts.tasks.*': {'queue': 'maintenance'},
    'apps.billing.tasks.*': {'queue': 'maintenance'},
    'apps.organizations.tasks.*': {'queue': 'maintenance'},
    'apps.common.tasks.cleanup_expired_sessions': {'queue': 'maintenance'},
    'apps.common.tasks.cleanup_temp_uploads': {'queue': 'maintenance'},
    'apps.common.tasks.cleanup_task_records': {'queue': 'maintenance'},
    'apps.notifications.tasks.send_scheduled_reports': {'queue': 'maintenance'},
}

# Defaults for the shared task base class in apps.common.tasks.
TASK_MAX_RETRIES = int(os.environ.get('TASK_MAX_RETRIES', 5))
TASK_RETRY_BACKOFF = int(os.environ.get('TASK_RETRY_BACKOFF', 5))
TASK_RETRY_BACKOFF_MAX = int(os.environ.get('TASK_RETRY_BACKOFF_MAX', 600))
# How long a successful idempotency record suppresses a repeat execution.
TASK_IDEMPOTENCY_TTL = int(os.environ.get('TASK_IDEMPOTENCY_TTL', 60 * 60 * 24 * 7))
# Must outlive the hard time limit so a crashed worker's lock is not held forever.
TASK_LOCK_TIMEOUT = int(os.environ.get('TASK_LOCK_TIMEOUT', 900))
TASK_RECORD_RETENTION_DAYS = int(os.environ.get('TASK_RECORD_RETENTION_DAYS', 30))

# DatabaseScheduler syncs these defaults into the django_celery_beat tables on
# startup, after which they can be retimed from the Django admin without a deploy.
# The clinic's own mailbox (product.mail). Patient email goes only through the clinic's server; the
# platform address is a development fallback and is off unless explicitly enabled.
MAIL_CREDENTIALS_KEY = os.environ.get('MAIL_CREDENTIALS_KEY', '')
MAIL_ALLOW_PLATFORM_FALLBACK = os.environ.get('MAIL_ALLOW_PLATFORM_FALLBACK', 'false').lower() == 'true'
MAIL_SMTP_BACKEND = os.environ.get('MAIL_SMTP_BACKEND', 'django.core.mail.backends.smtp.EmailBackend')
MAIL_TIMEOUT_SECONDS = int(os.environ.get('MAIL_TIMEOUT_SECONDS', 30))
MAIL_POLL_SECONDS = int(os.environ.get('MAIL_POLL_SECONDS', 120))

CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'
CELERY_BEAT_SCHEDULE = {
    'poll-clinic-mailboxes': {
        'task': 'product.mail.tasks.poll_mailboxes',
        'schedule': float(MAIL_POLL_SECONDS),
    },
    'beat-heartbeat': {
        'task': 'apps.common.tasks.beat_heartbeat',
        'schedule': 60.0,
    },
    'purge-expired-jwt-tokens': {
        'task': 'apps.accounts.tasks.purge_expired_jwt_tokens',
        'schedule': crontab(hour='3', minute='0'),
    },
    'purge-expired-verification-challenges': {
        'task': 'apps.accounts.tasks.purge_expired_verification_challenges',
        'schedule': crontab(hour='3', minute='15'),
    },
    'cleanup-expired-sessions': {
        'task': 'apps.common.tasks.cleanup_expired_sessions',
        'schedule': crontab(hour='3', minute='30'),
    },
    'cleanup-temp-uploads': {
        'task': 'apps.common.tasks.cleanup_temp_uploads',
        'schedule': crontab(hour='3', minute='45'),
    },
    'cleanup-task-records': {
        'task': 'apps.common.tasks.cleanup_task_records',
        'schedule': crontab(hour='4', minute='0'),
    },
    'expire-pending-invitations': {
        'task': 'apps.organizations.tasks.expire_pending_invitations',
        'schedule': crontab(minute='0'),
    },
    'sync-subscriptions': {
        'task': 'apps.billing.tasks.sync_subscriptions',
        'schedule': crontab(hour='*/6', minute='10'),
    },
    'send-scheduled-reports': {
        'task': 'apps.notifications.tasks.send_scheduled_reports',
        'schedule': crontab(day_of_week='1', hour='7', minute='0'),
    },
}

# ------------------------------------------------------------------------------
# Scheduled Job Retention Windows
# ------------------------------------------------------------------------------
VERIFICATION_CHALLENGE_RETENTION_DAYS = int(os.environ.get('VERIFICATION_CHALLENGE_RETENTION_DAYS', 1))
EXPIRED_TOKEN_RETENTION_DAYS = int(os.environ.get('EXPIRED_TOKEN_RETENTION_DAYS', 1))
INVITATION_EXPIRY_DAYS = int(os.environ.get('INVITATION_EXPIRY_DAYS', 7))
TEMP_UPLOAD_RETENTION_HOURS = int(os.environ.get('TEMP_UPLOAD_RETENTION_HOURS', 24))
DOCUMENT_MAX_UPLOAD_BYTES = int(os.environ.get('DOCUMENT_MAX_UPLOAD_BYTES', 25 * 1024 * 1024))
# Fernet keys for patient files at rest, comma-separated: the first encrypts, all decrypt (rotation).
MEDIA_ENCRYPTION_KEYS = os.environ.get('MEDIA_ENCRYPTION_KEYS', '')
# Investigation reports are read on this server (PDF text layer, else Tesseract OCR). Adding 'ara'
# reads Arabic too but makes Tesseract misread Latin letters such as the H/L flags, so it is opt-in.
RESULTS_OCR_LANGUAGES = os.environ.get('RESULTS_OCR_LANGUAGES', 'eng')
RESULTS_OCR_DPI = int(os.environ.get('RESULTS_OCR_DPI', 300))
RESULTS_MAX_PAGES = int(os.environ.get('RESULTS_MAX_PAGES', 15))
SUBSCRIPTION_PAST_DUE_GRACE_HOURS = int(os.environ.get('SUBSCRIPTION_PAST_DUE_GRACE_HOURS', 24))
SCHEDULED_REPORT_PERIOD_DAYS = int(os.environ.get('SCHEDULED_REPORT_PERIOD_DAYS', 7))

# ------------------------------------------------------------------------------
# Cache (also backs the distributed locks that keep tasks idempotent)
# ------------------------------------------------------------------------------
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': os.environ.get('CACHE_URL', 'redis://redis:6379/1'),
        'KEY_PREFIX': 'mobser',
        'OPTIONS': {'socket_connect_timeout': 2, 'socket_timeout': 2},
    }
}

# ------------------------------------------------------------------------------
# Email
# ------------------------------------------------------------------------------
# Platform email: invitations, password resets, weekly reports. Development prints to the console;
# production defaults to SMTP with the EMAIL_* settings below (see prod.py).
EMAIL_BACKEND = os.environ.get('EMAIL_BACKEND', 'django.core.mail.backends.console.EmailBackend')
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'no-reply@mobser.local')
EMAIL_HOST = os.environ.get('EMAIL_HOST', '')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', 587))
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', 'true').lower() == 'true'
EMAIL_USE_SSL = os.environ.get('EMAIL_USE_SSL', 'false').lower() == 'true'
EMAIL_TIMEOUT = int(os.environ.get('EMAIL_TIMEOUT', 30))

# ------------------------------------------------------------------------------
# Logging
# ------------------------------------------------------------------------------
LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO')

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'json': {'()': 'core.logging.JsonFormatter'},
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'stream': 'ext://sys.stdout',
            'formatter': 'json',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': LOG_LEVEL,
    },
    'loggers': {
        'django': {'handlers': ['console'], 'level': LOG_LEVEL, 'propagate': False},
        'django.server': {'handlers': ['console'], 'level': LOG_LEVEL, 'propagate': False},
        'django.db.backends': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
        'celery': {
            'handlers': ['console'],
            'level': LOG_LEVEL,
            'propagate': False,
        },
        'apps': {
            'handlers': ['console'],
            'level': LOG_LEVEL,
            'propagate': False,
        },
    },
}
