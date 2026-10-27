# Data-protection review: V-Clinic results email workflow

Reviewed 25 Oct 2026, at the end of the six build phases, against Dr Gohar's "Results Email Workflow: Spec for IT" (17 Oct 2026). The spec says the results emails carry health data, so the email service and any AI service used for reading or drafting must meet the clinic's data-protection requirements.

This review covers what the platform stores, where the data goes, how it is protected, and what is still open. The open items are for the clinic and IT to close before go-live.

## 1. Patient data the platform holds

| Data | Where it is kept | Protection |
|---|---|---|
| Patient files (name, date of birth, file number, mobile, email, preferred language) | PostgreSQL `patients_patient` | Clinic-scoped API, sign-in required, every open and change audited |
| Uploaded reports and scans (PDF, JPG, PNG) | `private_media/documents/` | **Encrypted at rest** (Fernet); never served as public files; download only through the authenticated API, audited |
| Text read from reports, and every result value | PostgreSQL `results_*` | Clinic-scoped API; held in the database (see 4.2) |
| Results emails as sent, and drafts | PostgreSQL `review_*` | Clinic-scoped; the doctor approves every send |
| The clinic mailbox: messages, threads | PostgreSQL `mail_*` | Clinic-scoped; the inbox is visible to clinic staff |
| Emailed attachments | `private_media/mail/` | **Encrypted at rest**, as documents |
| Leaflets | `private_media/leaflets/` | Encrypted at rest (not patient data, but kept the same way) |
| Mailbox passwords | PostgreSQL `mail_mailbox` | **Encrypted** with `MAIL_CREDENTIALS_KEY`; never returned by the API |
| Audit log | PostgreSQL `audit_auditlog` | Rows cannot be added, edited or deleted from the platform or the admin; no clinical values or note text are written to it |

Clinical values, email bodies and report text are never written to the audit log or to application logs.

## 2. Where patient data goes

- **Reading reports:** done entirely on the clinic's server. Text extraction uses pdfplumber, and scans are read with Tesseract OCR. **No AI or outside service is used**, so nothing leaves the server to read a report. This follows the spec's data-protection rule.
- **Sending email:** results emails, prescription replies and the doctor's inbox replies go out **only through the clinic's own mail server** (SMTP), as Dr Gohar decided. In production, if no clinic mailbox is set up, sending is refused rather than falling back to the platform's address (`MAIL_ALLOW_PLATFORM_FALLBACK` is off).
- **Receiving email:** the platform reads the clinic mailbox over IMAP every `MAIL_POLL_SECONDS`.
- **Nothing is sent automatically.** Every results email and prescription reply leaves only after the doctor approves it in the review queue. A test fails the build if any other code path can queue the send task.
- **Observability** (Grafana, Loki, Tempo) receives request routes, timings and error types. Caddy strips query strings and headers from its access log. Logs record the record ids and actions of patient-related events, never their content.

## 3. Access control

- **Sign-in:**
  - Email or mobile plus a password.
  - Sessions use 15-minute access tokens, and refresh tokens rotate and are blacklisted after use.
  - When a session expires on an open screen, the EMR sends the user back to sign-in.
- **Clinic scoping:**
  - Every product API resolves the caller's clinic from their membership and filters every query by it.
  - Tests confirm this for patients, documents, reports, clinic content and the audit log: another clinic's records come back as not found or are left out. Review cases, alerts and mail use the same shared clinic filter.
- **Doctor-only actions:**
  - Approving and sending email, confirming a report's patient, drafting a flagged report, acknowledging alerts.
  - Every clinic-settings change: templates, prescriptions, leaflets, alert rules, lab targets, mailbox, clinic details.
  - Reading the audit log.

  These are open to the clinic's **owners and admins** for now. Other staff can read the queue and the files, but these actions are refused for them, and each refusal is logged.

## 4. Encryption

### 4.1 In place

- **Files at rest:** `product.storage.EncryptedFileSystemStorage` encrypts every patient file before it reaches the disk. It uses Fernet, which is AES-128-CBC with an HMAC-SHA256 integrity check.
  - **Key:** `MEDIA_ENCRYPTION_KEYS`.
  - **Rotation:** add a new key in front of the list, run `python manage.py encrypt_private_media`, then remove the old key. The same command encrypts files written before this release; it was run on the development data, and all 4 files are now encrypted.
- **Mailbox passwords:** `MAIL_CREDENTIALS_KEY`.
- **In transit:**
  - Production redirects to HTTPS and sets HSTS (one year, with subdomains) and secure cookies.
  - The mailbox supports SSL/TLS and STARTTLS for SMTP and IMAP. "None" is offered only for the local test server.

### 4.2 Not encrypted by the platform

- **The database:** patient details, result values, report text, email bodies and drafts. They are protected by access control, not by field-level encryption. **IT must encrypt the PostgreSQL volume at the disk level** (an encrypted volume or host disk encryption) and protect it in backups (5.3).

## 5. Open items before go-live

1. **Set the production keys.** Generate `MEDIA_ENCRYPTION_KEYS` and `MAIL_CREDENTIALS_KEY` (`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`) and keep them outside the repository, with the other production secrets.
   - **If they are not set**, both fall back to keys derived from `SECRET_KEY`. Rotating `SECRET_KEY` would then make patient files unreadable until the old key is restored, and the mailbox passwords would have to be re-entered.
   - **Store a copy of the keys in a safe place.** Without them, encrypted files cannot be recovered.
2. **Encrypt the database volume and backups.** See 4.2. Encrypt backups of `postgres_prod_data` and `django_prod_records` too, keep them away from the server, and test restoring them.
3. **Mail server security.** IT's mail server should offer TLS on both SMTP (587 STARTTLS or 465) and IMAP (993). The mailbox account should be used only by the platform, with an app-specific password.
4. **Staff accounts.** The design brief asks for a passkey or authenticator code on sign-in, but the platform has passwords only today. Until a second factor is added, use strong unique passwords and remove leavers' accounts promptly.
5. **Roles.** Confirm with Dr Gohar who may approve and send. "Doctor" currently means the clinic owner or an admin.
6. **Retention.** The spec sets no retention period. Decide how long to keep:
   - report text and values;
   - mailbox copies;
   - the audit log.

   Nothing is deleted automatically today. Patient files, documents and sent emails cannot be deleted through the API, by design.
7. **Report text in the database.** The full text read from each report is kept so it can be re-read and checked. If the clinic prefers, it can be dropped after reading; the values themselves are stored separately.
8. **Test wording.** Before go-live, replace every template version marked "Test wording, not clinic approved" in the development data with the clinic's master copies, and approve them.

## 6. What is logged

The audit log (Audit log screen, doctor only) records, with time, user and client IP:

- **Sign-ins:** successful sign-ins, failed attempts (with the typed email or mobile, never the password) and blocked sign-ins.
- **Patient files:** opening, creating and editing a patient file, and patient searches (the search text and how many matched).
- **Documents and results:**
  - uploading, opening and editing documents;
  - viewing a patient's document list;
  - opening reports, entering key values, confirming a report's patient, and viewing results history.
- **Review:** every review action, including opening a case, choosing options, editing, drafting despite flags, approving and sending, and rejecting.
- **Alerts:** each acknowledgement, with the doctor's reason.
- **Email:** opening email threads, filing them with a patient, replying, and opening or saving attachments.
- **Settings:** every change to clinic settings and the mailbox.
- **Refusals:** every doctor-only action that was refused for another user.

The client IP comes from the last `X-Forwarded-For` entry, which Caddy appends.
