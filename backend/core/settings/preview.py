"""Preview server: the development settings (private mail host, SQLite/Postgres by environment) with DEBUG off."""
from .dev import *

DEBUG = False

# Without `collectstatic` the manifest storage would fail on the admin pages; serve straight from the apps.
STORAGES = {**STORAGES, 'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedStaticFilesStorage'}}
WHITENOISE_USE_FINDERS = True

# Lets `manage.py seed_demo_data` run here although DEBUG is off (it still refuses core.settings.prod).
ALLOW_DEMO_SEED = os.environ.get('ALLOW_DEMO_SEED') == '1'
