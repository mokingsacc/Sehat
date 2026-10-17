"""The production guard (P24): what .github/workflows/tutor-production.yml checks before it builds or deploys anything.

    python3 guard.py wrangler.toml                  the file's shape (after the workflow copied the production file)
    python3 guard.py wrangler.toml --deploy         and a real database id, from main only

Production is the Worker and D1 database named `qalam` and nothing else: never `qalam-staging`, never Sehat's
Worker or database (`sehat`, `fhb`), no routes, KV, R2, queues, Durable Objects or service bindings; the database is
made once by Mo and only referred to here, without migrations_dir (D1Store.open() applies tutor/migrations). The
settings are the pilot's: release mode, the online consent text, no printer and no PIN, the Android app's origin,
the daily retention cron, no staging spike, and learner AI either off or OpenAI through the gateway (never the fake
or a local model). The staging guard stays where it was, inline in tutor-worker.yml, unchanged.
"""
import os
import re
import sys
import tomllib
from pathlib import Path

NAME = "qalam"
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
ZERO = "00000000-0000-0000-0000-000000000000"
ALLOWED = {"name", "main", "compatibility_date", "compatibility_flags", "workers_dev", "preview_urls", "vars",
           "assets", "d1_databases", "rules", "triggers"}
VARS = {"TUTOR_COHORT", "TUTOR_AI_PROVIDER", "TUTOR_LACKS", "TUTOR_HOME", "TUTOR_RELEASE", "TUTOR_ORIGINS",
        "TUTOR_APK_LATEST", "TUTOR_APK_MIN", "TUTOR_KEEP_DAYS"}
FORBIDDEN_WORDS = ("qalam-staging", "sehat", "fhb")


def problems(w: dict, text: str = "", *, deploy: bool = False, ref: str | None = None) -> list[str]:
    out = []
    if w.get("name") != NAME:
        out.append(f'name must be "{NAME}", not {w.get("name")!r}')
    extra = set(w) - ALLOWED
    if extra:
        out.append(f"not allowed here: {', '.join(sorted(extra))}")
    dbs = w.get("d1_databases", [])
    if len(dbs) != 1 or dbs[0].get("database_name") != NAME or dbs[0].get("binding") != "DB":
        out.append(f'exactly one D1 database, binding "DB", database_name "{NAME}"')
    if any("migrations_dir" in d or "preview_database_id" in d for d in dbs):
        out.append("no migrations_dir or preview database: D1Store.open() applies the migrations")
    low = text.lower()
    for word in FORBIDDEN_WORDS:
        if word in low:
            out.append(f"the file names {word!r}")
    if w.get("preview_urls") is not False:
        out.append("preview_urls = false")
    if "python_workers" not in w.get("compatibility_flags", []):
        out.append("compatibility_flags needs python_workers")
    # only the API and the certificate check page (/v/<id>, P25b) reach Python; the app is static
    if "binding" in w.get("assets", {}) or w.get("assets", {}).get("run_worker_first") != ["/api/*", "/v/*"]:
        out.append('assets: no binding, run_worker_first = ["/api/*", "/v/*"]')
    if w.get("triggers") != {"crons": ["17 22 * * *"]}:
        out.append('triggers: the daily retention cron only, crons = ["17 22 * * *"]')
    v = w.get("vars", {})
    if set(v) - VARS:
        out.append(f"vars not known to production: {', '.join(sorted(set(v) - VARS))}")
    want = {"TUTOR_HOME": "online", "TUTOR_LACKS": "printer,pin", "TUTOR_RELEASE": "1",
            "TUTOR_ORIGINS": "https://appassets.androidplatform.net"}
    for k, val in want.items():
        if v.get(k) != val:
            out.append(f'{k} = "{val}"')
    if v.get("TUTOR_AI_PROVIDER") not in ("off", "openai"):
        out.append('TUTOR_AI_PROVIDER is "off" or "openai" (never fake or local)')
    if not re.fullmatch(r"[a-z0-9]{10}", str(v.get("TUTOR_COHORT", ""))):
        out.append("TUTOR_COHORT is a cohort id")
    if deploy:
        did = dbs[0].get("database_id", "") if len(dbs) == 1 else ""
        if not UUID.match(did) or did == ZERO:
            out.append("database_id is not set: the variable QALAM_PROD_D1_ID holds the qalam database's id")
        if ref != "refs/heads/main":
            out.append(f"production deploys from main only, not {ref!r}")
    return out


def main(argv: list[str]) -> int:
    path = Path(argv[0]) if argv and not argv[0].startswith("-") else Path("wrangler.toml")
    text = path.read_text(encoding="utf-8")
    found = problems(tomllib.loads(text), text, deploy="--deploy" in argv, ref=os.environ.get("GITHUB_REF"))
    if found:
        print(f"::error::{path.name}: " + "; ".join(found))
        return 1
    print(f"{path.name} names {NAME} only and holds the pilot's settings")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
