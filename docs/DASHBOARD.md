# The dashboard (server)

The dashboard is the Cloudflare Worker in `server/` with its D1 database `fhb`. It shows how the app is used and what the
disease watch has received, lets the owner and editors change the book, and keeps a record of who did what. It is written
to be easy for a health officer to read, easy for an auditor to check, and easy for a researcher to take data from.

## Pages

Everyone signs in at `/signin` first. The language links at the top (English, دری, پښتو) change the page language and are
remembered on that device.

| Page | What it shows | Who |
|---|---|---|
| `/dashboard` | Overview: phones a day, installs, minutes listened, disease-watch alerts this week and last, reports in the last 4 weeks, new feedback; a schematic map of Samangan's districts and a ranked list; weekly charts; most-read sections; when data last arrived | everyone signed in |
| `/usage` | App use in detail: pages, sections, languages, phone types, app builds (the old dashboard) | everyone |
| `/watch`, `/watch/methods` | Disease watch: weekly counts by illness, district and age group, alerts, corrections, exports; how it works | everyone; corrections owner only |
| `/inbox` | Feedback and voice notes, the "Summarise feedback" button | everyone |
| `/data` | Data for research: exports, the codebook, data versions, place codes, export history | everyone; full exports owner only |
| `/admin` | The book editor | everyone can look; editors and the owner change and publish |
| `/audit` | The audit log | owner |
| `/people` | Who has access, their role, their open sign-ins | owner |
| `/about` | What the app is, for visitors | everyone |

Every number on the overview built from 1 to 4 reports or phone-days is shown as `<5`, so a screenshot of it can be shared.
Each chart has a "Show as a table" button under it.

## Sign-in

- The owner signs in with the secret word `DASH_KEY`. Other people sign in with the key in their personal link from People.
- A sign-in makes a session cookie (`__Host-sehat`: HttpOnly, Secure, SameSite=Lax). The database keeps only a SHA-256 of
  the session token. A session lasts 12 hours, or 14 days with "Keep me signed in" (and when opened from a personal link).
- Old personal links (`/dashboard?key=...`) still work: they sign the person in and then remove the key from the address.
- Removing someone's access on People ends their sessions at once. Changing `DASH_KEY` ends the owner's sessions.
- After 30 wrong keys in 10 minutes, sign-in waits for the next 10 minutes (everyone; there is no address to block).
- Every change made from a page (save, publish, correction, role change, sign-out) must carry the session's CSRF token and
  come from the server's own page (Origin / Sec-Fetch-Site), or it is refused.
- Scripts can still call the API and the exports with `?key=...` or `Authorization: Bearer <key>`; those carry their own
  proof and need no cookie.
- Every page has a strict Content-Security-Policy with a fresh nonce for its one script, no inline event handlers,
  `X-Frame-Options: DENY` and `nosniff`. Voice notes are served only as audio, never as a page.

## The audit log (`/audit`)

Table `audit_log` is append-only: triggers in `schema.sql` refuse UPDATE and DELETE, so even the server cannot change a line.
Each line has: time (UTC), who (name, id, role), category, action, target, before and after (JSON; long values are kept as
their length and SHA-256), the query used (for views and exports), row count and SHA-256 (for exports) and a short id of the
sign-in session.

Categories: `sign-in` (sign in, failed sign-in, sign out), `view` (who looked at the overview, disease watch, data, people,
the audit log, or listened to a voice note; the same view by the same person within 10 minutes is written once), `export`
(every download, with its filters, rows and SHA-256), `edit` (book saves with before/after timestamps and a fingerprint of
the text, recordings with their hash and size, revert, start again), `publish` (the new version, its size and SHA-256, and
the version before), `correction` (disease-watch corrections, with the state before and after), `people` (add, role change,
remove access) and `system` (the nightly clean-up and what it deleted).

The log can be filtered by category, person, date and text, and downloaded as CSV or JSON (the download is logged too).
The older `audit` table (book edits before 8 October 2026) is kept and shown at the bottom of the page.

Disease-watch corrections never change a report: a correction is a new row in `surv_corrections`, and the original report
stays in `surv_reports` (see `/watch/methods`).

## Exports and the codebook (`/data`)

- **Usage** (by day or ISO epi week, by district, language, phone type, app build and consent version, per page or for the
  whole app) and **installs** (by day or week, language, phone type, build).
- **Disease watch** (`/watch/export.*`): weekly counts, alerts, symptom-finder searches, a DHIS2 file; for the owner also
  every report as received and every correction.
- Every file has ISO dates (`YYYY-MM-DD`), ISO weeks (`YYYY-Www`, Monday start), stable place ids, the official district
  code where confirmed, and a header (CSV `#` lines, JSON `meta`) with the query, row count, suppression rule, consent
  version, place and code versions and a SHA-256 of the rows. Check a CSV with `grep -v '^#' file.csv | sha256sum`.
- **Shareable** files (everyone signed in) hide small numbers: in usage files, a row where no day had 5 or more phones has
  its numbers left empty and `suppressed=1`; in disease-watch files, counts from 1 to 4 are written `<5`; in DHIS2 files,
  values under 5 are left out. **Full** files (every number) are for the owner only and not for sharing.
- The **codebook** (on `/data`, and as `/data/codebook.csv` / `.json`) describes every table and column in the database and
  every export column, with a privacy level. A test (`tools/test_dashboard.mjs`) checks it against the real tables.
- **Data versions** shows, for each app build, which consent wording its phones agreed to and which case definitions its
  reports used, so any row can be tied to the app build and consent version it came from.
- No export has GPS or any address: the smallest place is the district.

### DHIS2

Afghanistan's HMIS runs on DHIS2. `/watch/export.csv?kind=dhis2` (and `.json`) gives a dataValueSet: weekly periods
(`2026W41`), one data element per illness (`SEHAT_MEASLES_SUSP`, ...), org units by official code (`AF2001` for Aybak) or
`SEHAT_<PLACE>` where no code is confirmed, and age groups as category option combos (`SEHAT_AGE_U5`, `SEHAT_AGE_5_14`,
`SEHAT_AGE_15P`). Import with "ID scheme: Code". The file has no comment lines, so DHIS2 reads it as it is; its SHA-256 and
row count are in the response headers and the audit log.

When the HMIS team gives their own UIDs, set `DHIS2_MAP` in `server/wrangler.toml` `[vars]` (not a secret), for example
`DHIS2_MAP = '{"dataElements":{"measles":"uid"},"orgUnits":{"aybak":"uid"},"ages":{"u5":"uid"}}'`.
Anything not in the map keeps its code.

### Place codes

`server/codes.js`. Confirmed: Samangan province `AF20`, Aybak district `AF2001` (Aybak city and the Aybak villages both
belong to it). The other districts have no confirmed code yet and are left blank in `district_pcode`; their stable Sehat id
is always there. Add a code in `PCODES` once it is checked against the official list, and raise `CODES_VERSION`.

## Database changes

`server.yml` runs `wrangler d1 execute fhb --remote --file=schema.sql` before every deploy, so `schema.sql` only ever adds:
`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE TRIGGER IF NOT EXISTS`. Old data stays. Never put a
`DROP`, a `DELETE` or an `ALTER TABLE ... ADD COLUMN` in it (ADD COLUMN fails the second time it runs); make a new table
instead.

New tables on 8 October 2026: `sessions` (sign-ins; ended and expired ones are deleted after 90 days by the nightly job,
the audit log keeps the sign-in itself) and `audit_log`.

## Tests

`node tools/test_dashboard.mjs` runs the whole worker on an in-memory SQLite copy of the schema with fake data: sign-in,
cookies, CSRF, roles, every page in three languages, exports, suppression, epi weeks, DHIS2, the codebook against the real
tables, and the audit log. `node tools/test_editor.mjs` tests the editor.
