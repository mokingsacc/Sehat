# Hosting Qalam online

How the online Qalam runs, what it measured on Cloudflare in October 2026, what it costs, and what is still open.
The village hub needs none of this: it is the same app under uvicorn on a small Linux box (`HUB-SETUP.md`).

## What runs where

| Part | Online (staging) | Village hub |
|---|---|---|
| The app (phone pages, scripts, lesson pictures) | Workers static assets, served before the Worker | the hub's `StaticFiles` |
| `/api/*` | Cloudflare Python Worker `qalam-staging` (the hub's own FastAPI app) | uvicorn |
| Store | D1 `qalam-staging`, `eu` jurisdiction (`D1Store`) | SQLite file (`SqliteStore`) |
| Migrations | applied by `D1Store.open()` on an isolate's first request, from the SQL in the bundle | applied by `SqliteStore.open()` |
| AI | `fake` provider; the Worker has no secrets | the gateway, as configured |
| Print, teacher | off: the host lacks a printer and the teacher's PIN (`TUTOR_LACKS=printer,pin`) | on |
| Address | `https://qalam-staging.<account>.workers.dev` only: no route, no custom domain | the hub's own address |

How it is built and deployed is in `ARCHITECTURE.md` ("Online: the Worker"). In short: `worker/build.py` copies the
hub, migrations, manifests, cohorts and packs into a bundle; `.github/workflows/tutor-worker.yml` deploys it on every
push of `tutor/` to the working branch, opens the store with `/api/hello`, runs `hub/tests/smoke_http.py` against the
Worker and then `worker/measure.py`. The job only ever touches the Worker and the D1 database named `qalam-staging`,
uses only `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, sets no Worker secrets and deletes nothing.

## Where the spike ran

On Cloudflare, on the account's **Free plan**: the secrets were present and nothing blocked the deploy, so the
`pywrangler dev` fallback (D6) was not needed. That fallback stays in the workflow for a missing secret or a block.

## Measurements

Three deploys on 16 October 2026, measured by `worker/measure.py` from the GitHub runner (in the United States)
against `qalam-staging`, D1 `qalam-staging` in the `eu` jurisdiction (created by the first run; Cloudflare reports
`"jurisdiction": "eu"`). Run 1 built the app on each isolate's first request; runs 2 and 3 build it at import, so
the deploy-time snapshot holds it (`ARCHITECTURE.md`). Run 3 is the current code. Times are wall clock as the
runner saw them, network included.

| What | Run 1 (app built per isolate) | Run 3 (app in the snapshot) |
|---|---|---|
| Cold start: the first request after the deploy (`/api/hello`, which opens the store and runs the migrations) | 3,674 ms | 759 ms (run 2: 3,090 ms; run 4: 3,258 ms) |
| Startup time Cloudflare reports at deploy (the import, snapshotted) | 2,835 ms | 3,615 ms (run 2: 3,272 ms) |
| Bundle (Python, packages, data) | 9,910 KiB in 519 modules | 9,910 KiB in 520 modules, of which 9,689 KiB vendored packages |
| Upload | 9,914 KiB, gzip 2,477 KiB | 9,915 KiB, gzip 2,477 KiB |
| Static assets (the app and pictures) | the same | 53 files |
| WebAssembly memory (the isolate's linear memory; the Python heap is in it) | 51.9 MiB | 51.9 MiB |
| Warm `GET /api/hello` (n=20) | median 354, p90 3,701, max 4,202 ms | median 372, p90 466, max 2,913 ms |
| Warm `GET /api/lessons/{id}` (n=10) | median 339 ms | median 376, p90 453, max 476 ms |
| Warm `POST /api/ask`, a sum (n=10) | median 586 ms | median 738, p90 874, max 888 ms |
| Warm `GET /`, a static asset (n=10) | median 79 ms | median 121, p90 170, max 197 ms |
| CPU per request, all routes (`wrangler tail`) | median 21 to 34, p90 808 to 1,063, max 1,813 ms (n=96) | median 14, p90 99, max 184 ms (n=55) |
| Outcomes | 95 ok, 1 `exceededCpu` | 55 ok |
| CPU `/api/hello` | | median 10, p90 18, max 175 ms (n=21) |
| CPU `/api/lessons/{id}` | | median 12, p90 17, max 99 ms (n=12) |
| CPU `/api/ask` | | median 16, p90 105, max 184 ms (n=13) |
| CPU `/api/events` | | median 23, max 36 ms (n=3) |
| D1 round trip from the Worker | | 134 to 142 ms per query |

The slow tail in run 1 was new isolates building the app (1 to 2 s of CPU each); building it at import removed it.
The first request after a deploy still varies from 0.8 to 3.3 s over three samples, and a warm series still shows one
request near 3 s, likely a new isolate restoring the snapshot. Run 4 (the docs commit) measured CPU median 8 ms,
p90 56 ms, max 312 ms (n=54, all ok) and 120 queries at 132 ms each.
What remains of a request's wall time is mostly D1: the Worker runs near the caller, D1 answers from the EU, and each
query is one round trip (134 to 142 ms from the US runner). `/api/hello` makes 2 queries, an Ask 4 to 6.

Under `pywrangler dev` on a laptop (local D1, no network): first request 115 to 466 ms, warm `/api/hello` about
11 ms, WebAssembly memory 43 to 52 MiB, and 1,001 queries in one request passed (the local runtime has no query
limit).

Two ways to cut the D1 wait, neither enabled (both change where things run, so they are for Mo with D6):
Smart Placement runs the Worker next to its database instead of next to the caller, and D1 read replication
answers reads from a copy nearer the Worker. Either would turn the 2 to 6 round trips of a request into short
ones; the static app is unaffected.

## What could not be measured

- **Latency from Afghanistan.** Every number above is from a GitHub runner in the United States to a Worker that
  talks to D1 in the EU, so each request that reads D1 pays transatlantic round trips. A phone in Mazar-i-Sharif
  reaches a nearby Cloudflare location, but the D1 round trips to the EU remain. Measuring from a phone there is a
  pilot task.
- **Cold start, properly.** Each deploy gives one sample: the first request after it. Cloudflare decides when to
  start new isolates; the job cannot force one, so cold starts later in a run are only visible as the slow tail of
  the CPU and latency figures.
- **Memory as Cloudflare counts it.** The Worker reports its WebAssembly linear memory (the Python heap lives
  there); Cloudflare's own figure for the isolate is not exposed to it, and the JavaScript side adds a little.
- **CPU time inside the Worker.** A Worker's clock does not move while it computes, so CPU time comes only from
  `wrangler tail` (live, for the length of the job; Workers Logs stay off). The job keeps the numbers, not the
  events.
- **D1's own time per query, rows read and written.** Not looked at; the D1 dashboard has them per day.
- **Load.** One client, one request at a time. Many phones at once, and how many isolates Cloudflare runs for them,
  were not tested.

## What the spike checked

- `pyodide.ffi.jsnull` exists in the Workers runtime, so `D1Store` binds SQL NULL as it does in the fake.
- A list made with `to_js` works with `DB.batch()`.
- **D1 queries per request.** The Free plan's documentation gives 50 D1 queries per Worker invocation (Paid: 1,000).
  On staging (Free plan), 60 and then 120 single queries after one batch all passed in one request, so the 50 is not enforced as documented there; the account's limit on calls to Cloudflare services (1,000 per request) may be what applies. 1,001 was tried once and outlasted the client's 60 s (about 140 ms a query from the US), so the 1,000 itself was not reached. The hub stays well inside 50 anyway: in the tests (`tests/test_worker.py`, counted on the D1 fake)
  an isolate's first request, which opens the store and runs the migrations, makes 16 D1 calls; `/api/hello` 2;
  an Ask 4 to 6; a batch of 100 events 2. Keep new routes inside 50, so nothing depends on the probe's result.
- `/api/_spike` exists only while `QALAM_SPIKE=on` (staging). It writes nothing: its queries read `sqlite_master`.

## Free plan or Paid plan (D6, open)

The Free plan served the spike, but its limits do not fit Qalam:

- **CPU: 10 ms per request on Free.** Measured CPU per request is a median of 14 ms, 10 ms for `/api/hello`, with a tail to about 100 to 180 ms (an isolate's first requests), which leaves no room under the 10 ms. One request in run 1 was stopped with `exceededCpu`; run 3 had none. Cloudflare lets a Free Worker run over its CPU limit now and then
  but stops it when it does so often (`exceededCpu`), and a stopped request is an error the learner sees.
- **Requests: 100,000 a day on Free**, shared by the whole account, including Mo's Sehat Worker. Static assets do
  not count; every `/api/*` call does. Sixty learners syncing, asking and reading lessons would use a part of it;
  more would not fit.
- **D1 on Free:** 5 million rows read and 100,000 rows written a day, 5 GB stored, for the account.

The **Workers Paid plan** is US$5 a month for the account. It includes 10 million requests and 30 million CPU
milliseconds a month (then US$0.30 per further million requests and US$0.02 per further million CPU milliseconds),
up to 30 s of CPU per request (5 minutes if set), 1,000 D1 queries per request, and for D1 25 billion rows read,
50 million rows written and 5 GB stored a month (then US$0.001 per million rows read, US$1.00 per million rows
written, US$0.75 per GB-month). A pilot of 30 to 60 learners would stay inside the included amounts.

Nothing was bought or enabled. **This is decision D6 for Mo, after 22 December** (the build plan lists it from
20 January, needed by 31 January): take the Workers Paid plan for the account, or keep the Free plan and accept
failed requests, or the default in the build plan, Render in Frankfurt, if the Workers port fails its gate. The
builder's view from these numbers: the port works; the Free plan's CPU limit is what does not.

## The fallback kit (P12, not deployed)

The third answer to D6 is ready in `tutor/deploy`, so choosing it costs an account and an hour rather than a build:

- `Dockerfile` (built from `tutor/`) runs the hub's own app in online mode, as the Worker does: `TUTOR_HOME=online`,
  `TUTOR_LACKS=printer,pin`, the fake AI provider, no WeasyPrint (`deploy/requirements.txt`, the hub's versions), a
  non-root user, SQLite on the disk at `/data`. `FORWARDED_ALLOW_IPS=*` lets uvicorn take the phone's address from
  the host's proxy, which the join limit counts.
- `render.yaml` is a Render Blueprint for one web service in Frankfurt with a 1 GB disk, deploys by hand only.
  Render's free instances have no disk, so it needs a paid one (its price list decides the cost). `TUTOR_COHORT`
  and `TUTOR_ORIGINS` are typed in Render's dashboard; no secret is written in the repository. A real AI key would
  go the same way, once BUILD-PLAN 3.7's gateway has one.
- CI builds the image and runs `hub/tests/smoke_http.py` against it on every Tutor run (`tutor.yml`, job
  `fallback-kit`); `hub/tests/test_fallback_kit.py` keeps its packages and settings equal to the hub's and the
  Worker's.
- What it does not have: Cloudflare's static asset serving (uvicorn serves the app and pictures itself, as on the
  hub), D1 (SQLite instead, one instance), and Cloudflare Access for the staff pages: it sets `TUTOR_STAFF_GATE=off`, so it serves none. It was built only because D6 is still open; once Mo chooses Workers, it can be deleted with its CI job.

## Staff pages behind Cloudflare Access (P17; a step for Mo, not done)

The review screens (`/review/`, P17) are the first staff pages; the teacher's (`/teacher/`, P20) and the admin's
(`/admin/`, P21) will sit behind the same gate. Online, Cloudflare Access is the only place staff emails live
(C3.2). Until the steps below are done, every staff route answers 404 online, which is the safe default; the page
`/review/` itself holds no data and simply says that review is not open. On the village hub the teacher's PIN opens
it instead, and the fallback container sets `TUTOR_STAFF_GATE=off` because nothing stands in front of it.

1. In Cloudflare Zero Trust, pick the team name (the team domain is `<team>.cloudflareaccess.com`).
2. Give the staff paths a hostname Access can cover path by path. Access's one-click switch for `workers.dev`
   protects the whole Worker, which would lock learners out, so this most likely needs a custom domain on the
   account routed to `qalam-staging` (to be confirmed when it is set up).
3. Add a self-hosted Access application for `<host>/review/*` and `<host>/api/m/review/*` (later also
   `/teacher/*`, `/api/m/teacher/*`, `/admin/*`, `/api/m/admin/*`). Its policy allows the reviewers' and teachers'
   emails, with a second factor for admins. Copy the application's audience tag (AUD).
4. Set three Worker secrets (the deploy job never touches secrets, so they stay across deploys):
   `wrangler secret put TUTOR_ACCESS_TEAM` (the team name), `TUTOR_ACCESS_AUD` (the AUD tag) and
   `TUTOR_STAFF_PEPPER` (a long random string, for example from
   `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`; keep a copy in the password manager, since every
   staff row depends on it). With all three set, the Worker checks each request's Access token itself (signature,
   audience, issuer, expiry) and looks up the hashed email in `staff`.
5. Add each staff member without writing the email anywhere: `TUTOR_STAFF_PEPPER=... python -m tutor_hub staff-add
   --label "Dari reviewer 1" --role "Dari reader" --initials AB --cohorts qg1j2918yx` asks for the email, prints SQL
   holding only its peppered hash, and `wrangler d1 execute qalam-staging --remote --command "<that SQL>"` adds the
   row. `staff-remove` prints the SQL that removes one. Roles are the ones lessons name in `review.needs`
   ("Dari reader", "Pashto reader", "maths teacher", ...), or `teacher` and `admin` for later pages.
6. Before a release, open `/api/m/review/signoffs` while signed in, save it as `signoffs.json`, run
   `python3 tools/pull_signoffs.py --json signoffs.json`, check with `python3 tools/validate_pack.py --release`, and
   commit the packs.

## Reading the next runs

Each run of `tutor-worker.yml` writes the same table to its job summary, so later changes can be compared. A run
without the secrets, or one the Free plan blocks, says so in the summary, runs the smoke test under
`pywrangler dev` on the runner and stays green with a warning.
