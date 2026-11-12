# Product Modules Directory (`backend/product/`)

This directory is reserved for **domain-specific product modules and business logic** of V-Clinic, keeping them cleanly decoupled from the reusable platform foundations located in `backend/apps/`.

## Architectural Guidelines

* **Platform Modules (`backend/apps/`)**:
  * Horizontal, cross-cutting SaaS capabilities: `accounts`, `organizations`, `billing`, `notifications`, `audit`, and `common`.
  * Can be reused across multiple products or platforms.
* **Product Modules (`backend/product/`)**:
  * Vertical, domain-specific features unique to V-Clinic (e.g. computer vision pipelines, inspection workflows, edge sync, or custom product models).
  * Product models should inherit from `apps.common.models.BaseModel` and reference `apps.organizations.models.Organization` for tenant scoping.

## Creating a new product app

Initialize a fresh clone with `make init` before adding product modules. The
initializer updates the package paths below to the selected Python package while
retaining the shared `apps` and product module namespaces.

1. Create your app folder: `backend/product/<feature_name>/`
2. Define `apps.py` with `name = 'product.<feature_name>'` and `label = '<feature_name>'`.
3. Register `'product.<feature_name>.apps.<FeatureName>Config'` in `INSTALLED_APPS` inside `backend/core/settings/base.py`.
4. Include its URLs in `backend/core/urls.py` under `path('api/product/<feature_name>/', include('product.<feature_name>.urls'))`.

## Importing clinic content

The clinic's own email wording, system phrases, prescription list and leaflets are loaded from a
JSON file. Nothing in the file is clinical content written by the platform: it is the clinic's
master copy, converted to this format.

```
python manage.py import_clinic_content <org-slug> <file.json> [--approve-as <doctor-email>]
```

- Each item is added as a **new version only when it changed**, with the note
  `Imported from <file name> <date>`. Running the same file twice adds nothing.
- **Nothing is approved** unless `--approve-as` names an owner or admin of the clinic; then every
  imported version (new, or unchanged but not yet approved) is approved as that doctor. Drafts are
  only ever built from approved versions.
- The whole file is imported in one transaction: any error (unknown placeholder, missing field, a
  translation with nothing to translate from, a missing PDF) stops the import and changes nothing.
- An example with obviously placeholder wording is in `content/import_example/`.

The file is an object with up to three lists:

```json
{
  "templates": [
    {"key": "results", "language": "en", "name": "Results email",
     "subject": "...", "body": "... {{results.table}} ... [[a blank the doctor fills]]"},
    {"key": "smear_section_5", "language": "en", "name": "<the clinic's name for this plan>",
     "subject": "...", "body": "..."},
    {"key": "phrase.reference", "language": "en", "body": "... {{range}}"},
    {"key": "results", "language": "ar", "translated_from_key": "results",
     "subject": "<the clinic's Arabic>", "body": "<the clinic's Arabic> {{results.table}}"}
  ],
  "prescriptions": [
    {"drug": "...", "dose": "...", "directions": "..."}
  ],
  "leaflets": [
    {"title": "...", "pdf_path": "leaflets/file.pdf", "default_for": ["results"]}
  ]
}
```

**templates**
- `key` (required): an existing template key (`results`, `menopause_results`, `follow_up_comparison`,
  `pathology_results`, `sti_opening`, `sti_section_<test>`, `sti_closing`, `smear_section_1`…`14`,
  `prescription_reply`) or a system phrase key `phrase.<name>` (the list and each phrase's allowed
  placeholders are in `content/starter.py: STARTER_PHRASES`).
- `language`: `en` (default) or `ar`.
- `body` (required) and `subject` (optional). Templates may use the placeholders listed by
  `GET /api/product/content/placeholders/`; a phrase may use only its own slots (e.g. `{{range}}`).
- `name`: the template's name in the clinic's screens. It is set per key, so each smear plan
  (`smear_section_2`…`14`) gets its own name.
- A key the clinic does not have yet also needs `kind` (`results`, `menopause`, `follow_up`,
  `infection`, `pathology`, `smear`, `reply`), `part` (`full`, `opening`, `section`, `closing`; default
  `full`), `section_key` for a section, and optionally `sort_order`. Phrase keys are always kind `phrase`.
- A translation (`language` other than `en`) must give `translated_from_key`: the English key it
  translates. It is linked to the English version imported from the same file, or else to the
  current approved English version. A translation is treated as out of date (and asked for again
  in review) once a newer English version is approved.

**prescriptions**: `drug` (required), `dose`, `directions`. An item is matched to an existing one by
its drug name (ignoring case); otherwise a new item is added.

**leaflets**: `title` (required, matched ignoring case), `pdf_path` (required, a PDF, relative to the
JSON file), and `default_for`: template keys the leaflet is attached to by default.
