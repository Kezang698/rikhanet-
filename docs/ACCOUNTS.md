# Accounts and ranger workflows — 29 October 2026

Database mode now uses real server accounts. Open `/login` and create the first
administrator with your chosen email and a password of at least 12 characters.
Setup closes as soon as one account exists. Existing sightings, images and
predictions are preserved; browser demo accounts are not imported or granted
database access. Demo sign-in still applies only in explicit demo mode.

## Using the pages

- **Rangers:** administrators create login accounts, assign gewogs, edit contact
  details and suspend accounts. A password is required on creation; leave it
  blank on edit to keep it. Updates revoke that ranger's sessions and old reset
  links. An unassigned ranger sees no sightings. Permissions are enforced in the
  API for lists, individual records, images, observations, enrichment and forecasts.
- **Alerts:** an existing or new HIGH forecast creates one alert per trigger.
  Administrators and rangers assigned to affected gewogs receive persistent
  in-app notifications. Administrators assign a responsible ranger; accessible
  rangers can acknowledge and record responses. Resolving requires an acknowledged
  alert and a non-empty response. Actions are audited. Source image access still
  requires assignment to its source gewog.
- **Reports:** the Field Reports section accepts a timestamp, species, coordinates
  and narrative. GPS must resolve inside a permitted GMC gewog. Administrators
  review or close reports and add a note. Rangers see their own reports within
  their current assignments. Reports have their own table and do not fabricate
  YOLO detections or confidence values. Existing analytical charts remain available.
- **Sightings / Data Review:** review notes and flags persist with actor and time.
  Rangers can flag accessible records; administrators approve or reject them.
  Data Review lists loaded records needing review; Sightings shows their history.
- **My Account:** profile name, phone and email-notification preference persist.
  Password changes verify the current password and 2FA when enabled, revoke other
  sessions and rotate the current session. Login email is the account identity;
  administrators manage ranger login emails in Rangers.
- **2FA:** enter the current password, add the displayed setup key to an
  authenticator application, and confirm its six-digit code. Setup expires after
  ten minutes. Eight one-use recovery codes are displayed once for download.
  Login accepts a fresh TOTP or unused recovery code. Disabling requires password
  and authenticator/recovery verification. Password reset also retains 2FA.
- **Settings:** application settings, delivery queue and audit activity come from
  PostgreSQL. The detection endpoint applies the saved confidence threshold for
  signed-in accounts, and both roles load the shared app configuration.
  Stored advisory/planning settings do not change the model's fixed risk tiers or
  schedule predictions. Camera configuration remains local, as requested.

## Email and webhook configuration

The user deferred supplying delivery settings. In-app alerts work immediately.
External alerts and reset emails queue durably and are never marked sent just
because they were queued. The API worker checks every 20 seconds, retries failed
deliveries up to eight attempts, and exposes queue status to administrators.
Expired reset links and out-of-window alerts are not sent after a later setup.

Set these in the Python server's environment (Python does not read `.env.local`):

```powershell
$env:APP_ORIGIN = 'http://127.0.0.1:3000'
$env:SMTP_HOST = 'smtp.example.com'
$env:SMTP_PORT = '587'
$env:SMTP_USER = 'your-smtp-user'
$env:SMTP_PASSWORD = 'your-smtp-password'
$env:SMTP_FROM = 'alerts@example.com'
$env:RIKHANET_ALERT_WEBHOOK_URL = 'https://your-service.example/ranger-alert'
$env:RIKHANET_WEBHOOK_SECRET = 'your-random-secret-at-least-32-characters'
backend\.venv\Scripts\python.exe -m backend
```

SMTP uses STARTTLS by default. For implicit TLS set `SMTP_SSL=1` and the appropriate
port (usually 465). Compose accepts the same variables from its environment or
root `.env`; do not expose credentials with `NEXT_PUBLIC_` variables. External
webhooks require HTTPS and a secret of at least 32 characters. Verify
`X-RiKhaNET-Signature` as an HMAC-SHA256 hex digest of the exact request body using
the shared secret. Receivers should deduplicate the `Idempotency-Key` header.
Delivery uses a transactional outbox and is at least once: a crash after a remote
send but before the database commit can produce a retry.

Forgot password always responds generically. The reset link is emailed to the
login address, expires after 15 minutes and is single use; resetting revokes all
sessions. Until SMTP is configured, password recovery cannot deliver a usable
email. Request a fresh link after configuring it.

## Storage and sessions

`workflows.sql` adds `app_*` tables without changing the original three core
tables. Passwords use salted scrypt (N=32768, r=8, p=3). Session tokens and reset
tokens are hashed; sessions expire after eight hours. Cookies are HttpOnly for
the session, SameSite=Strict, with a separate CSRF cookie verified against the
session. Mutations require a CSRF token and expected origin. The Next.js proxy
forwards credentials and Set-Cookie; the image inference route also requires an
authenticated session. Authentication endpoints have PostgreSQL-backed throttles.

TOTP secrets and queued message bodies are encrypted with Fernet. The local key
defaults to `uploads/app-secrets/master.key`, excluded from Git and Docker builds.
Compose persists the same host upload folder. **Back up this key with the database**;
losing it prevents decryption of enrolled authenticators and pending deliveries.
`RIKHANET_SECRET_KEY` or `RIKHANET_SECRET_FILE` can supply a managed key instead.
For HTTPS deployments set `COOKIE_SECURE=1` and set `APP_ORIGIN` to the actual
frontend origin. Keep the current development services bound to localhost.

Security references: [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html),
[session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html),
[password resets](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html),
and [multifactor authentication](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).
