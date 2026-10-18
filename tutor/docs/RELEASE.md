# Releasing Qalam

The checklist for the pilot gate and for each production release (BUILD-PLAN 8, "Release approval"). Copy it into the
release's pull request or its comment, and tick each line there. Production is the Worker and D1 database `qalam`,
deployed only by `.github/workflows/tutor-production.yml` from `main`, after Mo or the second admin approves the
GitHub environment `production`. How to set production up the first time is in [HOSTING.md](HOSTING.md), "Going
live".

## Every release

During the pilot: one release a week on a fixed day, after a day on staging. A safety fix may go the same day.

1. **CI is green with the batch test** on the commit being released: Tutor (`[batch]` in the commit message, or run
   by hand), Tutor Worker (staging deployed and its smoke test passed), and Tutor Android when the app changed.
2. **Each phase's "done when"** is ticked in the commit or the PR comment; design changes carry their committee note.
3. **The packs are signed.** Pull the sign-offs from staging (HOSTING.md, staff pages, step 6), then
   `python3 tools/validate_pack.py --release` passes and the packs are committed. Production runs `TUTOR_RELEASE=1`
   and serves only signed lessons.
3b. **The voice gate (C5.6), the chair's flag.** For each language whose clips are to ship, a native listener has
   heard its 30-clip sample (`python3 tools/voice.py --sample --estimate` lists what is voiced; the clips are in
   `app/audio/<lang>/` and the packs' `audio/<lang>/`) and Mo has written `"passed": true`, their initials and the
   date under `native_check` in `content/voice.json`. A production build (`TUTOR_RELEASE=1`) leaves out the clips of
   every language not passed, and the hub in release mode does not serve them; staging and the hub play them
   without it. The Chinese teacher reviewer listens for the tones before `chinese-1` leaves draft.
3c. **The C6 gate files (live classes and contests).** Under `TUTOR_RELEASE` the admin cannot switch `live` or
   `contest` on until its gate file is in `cohorts/gates/` (it travels with the seed cohorts, as `photo-open.json`
   does): `live.json` `{"d9": "<D9's decision, in words>", "opinion": "YYYY-MM-DD"}` (the date of the legal opinion
   on live classes) and `contest.json` `{"opinion": "YYYY-MM-DD"}` (D15). Every field must be filled; the admin's row
   says "waits for D9 and the legal opinion" or "waits for the legal opinion" until then. `live` also needs the four
   Realtime secrets on `qalam` and a consent version whose files say `"live": true` (HOSTING.md, "Live classes: the
   Realtime set-up"). The floor (P30b, an adult speaking to her class) is the `live` setting `floor`, off by default.
   The admin can turn it on only for a class whose every band is `ad`, under that consent version. Mixed classes
   never get it: that is a question for Mo (DESIGN-C6-SPECS.md C6.4).
4. **The privacy suite passes:** `hub/tests/test_privacy.py` (a retention rule for every table, the retention job,
   the wishlist and reset codes) with the schema scan and event shapes (`test_events.py`), photo writes
   (`test_photo.py`, `test_worker.py`), names in logs (`test_api.py`) and the gateway's recorder scans
   (`test_gateway.py`). They are all in `pytest`; the batch run covers them.
5. **The hint-leak set passes:** `hub/tests/test_hints.py`, every Pack 1 sheet item (row 4 of 1.3).
6. **The load test passes:** `python3 tools/load_test.py` (60 learners at once, on SQLite and on the D1 fake, no
   request failed; `hub/tests/test_load.py` runs it in every CI run). Note its D1 queries a learner.
7. **Kill switches work on staging:** in the admin panel, AI off for the staging cohort, then a phone's next hello
   shows Ask without AI within a minute; turn it back on. The same for the school day.
8. **Budget caps are set** for each production cohort (admin panel, AI spend), below what Mo agreed for the month.
9. **Backups are current:** the last weekly export run of Tutor production is green and under a week old, and D1
   Time Travel is on (it is, for every D1 database).
10. **The approval:** Mo or the second admin approves the `production` environment for the deploy run (Actions >
    Tutor production > Run workflow > `deploy`, from `main`). The run's summary gives the address; open `/api/hello`.
11. **After the deploy:** open the app on a phone, join a test class with the code from the admin panel, open a
    lesson, then remove that learner (Settings > "Remove this learner from this phone"), which deletes her record on
    the server too.

## Rollback

- **The Worker:** `npx wrangler rollback --name qalam` (the previous version, from Mo's machine with the production
  token), or redeploy the previous commit with the workflow.
- **The data:** D1 Time Travel restores `qalam` to any minute of the last 30 days (7 on the Workers Free plan):
  `npx wrangler d1 time-travel info qalam` and then `npx wrangler d1 time-travel restore qalam --timestamp=<UTC time>`.
  Everything written after that minute is lost: say so in the release notes.
- **A module:** switch it off for the cohort in the admin panel (phones follow within a minute); no deploy needed.

## The restore drill (once before the pilot, then each term)

1. Download the newest `qalam-d1-export` artifact from a Tutor production run and decrypt it on Mo's machine:
   `gpg --decrypt qalam-<day>.sql.gpg > qalam-<day>.sql`.
2. Load it into a scratch folder and open it with the hub: `sqlite3 <folder>/hub.db < qalam-<day>.sql`, then
   `TUTOR_DATA=<folder> python -m tutor_hub` from `tutor/hub`; check the cohorts and the learner count in the admin
   panel. `hub/tests/test_production.py` runs the same steps on the D1 fake in CI.
3. Try Time Travel on staging, not production: `npx wrangler d1 time-travel restore qalam-staging --timestamp=<an
   hour ago>`, then open staging's `/api/hello`.
4. Delete the scratch file and the decrypted export (`shred -u`). Note the date in the decision log.

## The pilot gate (BUILD-PLAN 1.3)

| # | Done when | Where it stands (October 2026) |
|---|---|---|
| 1 | Sign-up under 3 minutes on a $60 phone, every screen read aloud | browser check built (`tools/signup_check.mjs`); the timed run with a reviewer waits for phones |
| 2 | Pack 1 signed; `validate_pack.py --release` passes | waits for the reviewers (Mo's sign-off sessions) |
| 3 | A photographed sheet marked in under 20 seconds on throttled 3G | browser check built (`tools/photo_check.mjs`); real reading waits for the OpenAI key (P18) |
| 4 | No hint contains the answer, every Pack 1 item | `test_hints.py` |
| 5 | Held answers on for the pilot cohort, cleared from the dashboard | built (P20); the dress rehearsal |
| 6 | Bells by default, off in one tap; the APK's alarm after "this phone is mine" | built (P19, P23); two real phones |
| 7 | A module off for the cohort reaches phones within a minute | built (P21); the dress rehearsal |
| 8 | No name, sex or free text in events; no photo written | the privacy suite (above) |
| 9 | AI spend capped per cohort per day; nothing identifying to OpenAI | gateway tests; P18 for the real provider |
| 10 | Production on the Worker; a restore rehearsed | production ready, not deployed (HOSTING.md, Going live); the restore drill above |
| 11 | DPIA, safeguarding policy, partner data agreement signed | Mo's |
