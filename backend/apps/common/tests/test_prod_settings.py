"""Production settings refuse to start on missing or development-grade secrets."""
import importlib
import os
import sys
from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

FERNET_KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='  # 32 bytes, urlsafe base64: a valid Fernet key shape
GOOD = {
    'SECRET_KEY': 'p' * 50, 'OTP_SECRET': 'q' * 40, 'DB_NAME': 'db', 'DB_USER': 'u', 'DB_PASSWORD': 'pw',
    'DB_HOST': 'db', 'DB_PORT': '5432', 'MEDIA_ENCRYPTION_KEYS': FERNET_KEY, 'MAIL_CREDENTIALS_KEY': FERNET_KEY,
    'HIREAGENTS_AUTH_CHANNEL_ID': '', 'HIREAGENTS_SUPPORT_CHANNEL_ID': '',
}


def load_prod(**overrides):
    env = {**GOOD, **overrides}
    env = {k: v for k, v in env.items() if v is not None}
    cleared = {name: None for name in GOOD if name not in env}
    with patch.dict(os.environ, env, clear=False):
        for name in cleared:
            os.environ.pop(name, None)
        # base reads the environment at import, so it is re-imported too (django.conf.settings is untouched).
        for module in ('core.settings.prod', 'core.settings.base'):
            sys.modules.pop(module, None)
        return importlib.import_module('core.settings.prod')


class ProdSettingsTests(SimpleTestCase):
    def tearDown(self):
        for module in ('core.settings.prod', 'core.settings.base'):
            sys.modules.pop(module, None)

    def test_complete_configuration_loads_and_signs_tokens_with_the_secret_key(self):
        prod = load_prod()
        self.assertEqual(prod.SIMPLE_JWT['SIGNING_KEY'], 'p' * 50)
        self.assertEqual(prod.MEDIA_ENCRYPTION_KEYS, FERNET_KEY)
        self.assertEqual(prod.REST_FRAMEWORK['DEFAULT_PERMISSION_CLASSES'], ['rest_framework.permissions.IsAuthenticated'])
        self.assertEqual(prod.EMAIL_BACKEND, 'django.core.mail.backends.smtp.EmailBackend')

    def test_missing_encryption_keys_refuse_to_start(self):
        for name in ('MEDIA_ENCRYPTION_KEYS', 'MAIL_CREDENTIALS_KEY', 'OTP_SECRET', 'SECRET_KEY'):
            with self.subTest(name=name), self.assertRaisesMessage(ImproperlyConfigured, name):
                load_prod(**{name: None})

    def test_development_placeholders_are_rejected(self):
        with self.assertRaises(ImproperlyConfigured):
            load_prod(OTP_SECRET='dev-otp-secret-key-32-chars-minimum-mobser')
        with self.assertRaises(ImproperlyConfigured):
            load_prod(SECRET_KEY='generate-a-secure-random-secret-key-for-production-here')

    def test_an_enabled_whatsapp_connection_needs_webhook_credentials(self):
        with self.assertRaisesMessage(ImproperlyConfigured, 'HIREAGENTS_AUTH_WEBHOOK_API_KEY'):
            load_prod(HIREAGENTS_AUTH_CHANNEL_ID='channel', HIREAGENTS_AUTH_WEBHOOK_API_KEY='',
                      HIREAGENTS_AUTH_WEBHOOK_SIGNING_SECRET='')
        prod = load_prod(HIREAGENTS_AUTH_CHANNEL_ID='channel', HIREAGENTS_AUTH_WEBHOOK_API_KEY='k' * 32,
                         HIREAGENTS_AUTH_WEBHOOK_SIGNING_SECRET='s' * 32)
        self.assertEqual(prod.HIREAGENTS_CONNECTIONS['auth']['webhook_api_key'], 'k' * 32)
