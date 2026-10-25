import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load the root development environment before base settings read its values.
# Explicit process/container environment values remain authoritative.
load_dotenv(Path(__file__).resolve().parents[3] / '.env', override=False)

from .base import *

SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-dev-secret-key-template-project-1234')
SIMPLE_JWT = {**SIMPLE_JWT, 'SIGNING_KEY': SECRET_KEY}
OTP_SECRET = OTP_SECRET or 'dev-otp-secret-key-32-chars-minimum-mobser'
for _connection in HIREAGENTS_CONNECTIONS.values():
    _connection['webhook_api_key'] = _connection['webhook_api_key'] or 'dev-hireagents-webhook-key'

DEBUG = True

# The test suite shares one client address, so real rates would throttle unrelated tests; the
# throttling tests set their own rates explicitly.
if 'test' in sys.argv:
    REST_FRAMEWORK = {
        **REST_FRAMEWORK,
        'DEFAULT_THROTTLE_RATES': {scope: '100000/min' for scope in REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']},
    }

# Without a clinic mailbox, development email prints to the console instead of being refused.
MAIL_ALLOW_PLATFORM_FALLBACK = os.environ.get('MAIL_ALLOW_PLATFORM_FALLBACK', 'true').lower() == 'true'

ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '*').split(',')

# Default to SQLite for easy non-docker runs, but swap to Postgres when available in environment
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

DB_NAME = os.environ.get('DB_NAME')
DB_USER = os.environ.get('DB_USER')
DB_PASSWORD = os.environ.get('DB_PASSWORD')
DB_HOST = os.environ.get('DB_HOST')
DB_PORT = os.environ.get('DB_PORT')

if all([DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT]):
    DATABASES['default'] = {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': DB_NAME,
        'USER': DB_USER,
        'PASSWORD': DB_PASSWORD,
        'HOST': DB_HOST,
        'PORT': DB_PORT,
    }

# CORS settings for dev
CORS_ALLOW_ALL_ORIGINS = True

# Mirrors the database fallback above: use Redis when it is pointed at, otherwise stay
# in-process so tests and non-docker runs need no broker. Note that the idempotency lock
# is only distributed when a real Redis is configured.
if not os.environ.get('CACHE_URL') and not os.environ.get('REDIS_URL'):
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'mobser-dev',
        }
    }
