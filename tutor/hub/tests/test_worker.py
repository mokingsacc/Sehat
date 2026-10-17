"""The online Worker (tutor/worker, P7): its entry point driving the hub's own app on the D1 fake, the bundle
build.py makes, how many D1 calls a request costs, and the guards that keep the deploy off Sehat's own Worker."""
import importlib.util
import json
import re
import sys
import tomllib
from pathlib import Path
from types import ModuleType, SimpleNamespace

import httpx
import pytest

from tutor_hub.ai import make_provider
from fakes.d1 import FakeD1, Statement, ffi as fake_ffi
from tutor_hub.stores import D1Store

TUTOR = Path(__file__).resolve().parents[2]
WORKER = TUTOR / "worker"
WRANGLER = tomllib.loads((WORKER / "wrangler.toml").read_text(encoding="utf-8"))
FREE_PLAN_QUERIES = 50          # D1 queries per Worker invocation on the Workers Free plan

pytestmark = pytest.mark.anyio


# the deploy's guards

def test_wrangler_toml_names_only_qalam_staging():
    assert WRANGLER["name"] == "qalam-staging"
    [db] = WRANGLER["d1_databases"]
    assert db["database_name"] == "qalam-staging" and db["binding"] == "DB"
    assert "migrations_dir" not in db and not (WORKER / "migrations").exists()
    text = (WORKER / "wrangler.toml").read_text(encoding="utf-8")
    assert '"sehat"' not in text and "fhb" not in text


def test_wrangler_toml_creates_nothing_else():
    allowed = {"name", "main", "compatibility_date", "compatibility_flags", "workers_dev", "preview_urls", "vars",
               "assets", "d1_databases", "rules", "observability", "triggers"}
    assert set(WRANGLER) <= allowed, set(WRANGLER) - allowed            # no routes, KV, R2, queues, secrets
    assert set(WRANGLER["triggers"]) == {"crons"} and len(WRANGLER["triggers"]["crons"]) == 1   # a schedule only
    assert WRANGLER["workers_dev"] is True
    assert "python_workers" in WRANGLER["compatibility_flags"]
    assert "binding" not in WRANGLER["assets"]


def test_staging_runs_the_staging_cohort_on_claude_with_its_key_else_the_fake_without_printer_or_pin(cfg):
    v = WRANGLER["vars"]
    staging = json.loads((TUTOR / "cohorts" / "staging.json").read_text(encoding="utf-8"))
    assert v["TUTOR_COHORT"] == staging["id"]
    assert v["TUTOR_AI_PROVIDER"] == "anthropic,fake"            # the owner's choice, 17 Oct 2026
    cfg.ai_provider, cfg.anthropic_key = v["TUTOR_AI_PROVIDER"], None
    assert make_provider(cfg).name == "fake"
    cfg.anthropic_key = "sk-test-not-real"
    assert make_provider(cfg).name == "anthropic"
    assert v["TUTOR_HOME"] == "online"                                   # the online consent text
    assert set(v["TUTOR_LACKS"].split(",")) == {"printer", "pin"}
    assert not any(k for k in v if "KEY" in k or "TOKEN" in k or "SECRET" in k or "PIN" in k)


def test_the_worker_asks_only_for_packages_the_hub_already_uses():
    deps = tomllib.loads((WORKER / "pyproject.toml").read_text(encoding="utf-8"))["project"]["dependencies"]
    hub = {l.strip() for l in (TUTOR / "hub" / "requirements.txt").read_text().splitlines()
           if l.strip() and not l.startswith("#")}
    assert deps and set(deps) <= hub


def test_the_deploy_workflow_keeps_to_its_own_worker():
    wf = (TUTOR.parent / ".github" / "workflows" / "tutor-worker.yml").read_text(encoding="utf-8")
    assert set(re.findall(r"secrets\.([A-Z_]+)", wf)) == {"CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID",
                                                         "ANTHROPIC_API_KEY"}
    assert "NAME: qalam-staging" in wf and "branches: [claude/project-thread-sbgfoh]" in wf
    call = re.compile(r"(\$W|npx --no-install wrangler|pywrangler) [a-z]")
    commands = [l for l in wf.splitlines() if call.search(l) and not l.strip().startswith(("#", "msg=", "echo"))]
    assert any("d1 create" in l for l in commands) and any("pywrangler deploy" in l for l in commands)
    # one secret only: Claude's key, put on qalam-staging from the repository secret, piped and never printed
    puts = [l for l in commands if "secret" in l.lower()]
    assert len(puts) == 1 and 'printf \'%s\' "$ANTHROPIC_API_KEY" | npx --no-install wrangler secret put ' \
        'ANTHROPIC_API_KEY --name "$NAME" > secret.log' in puts[0], puts
    assert not any("echo" in l and "$ANTHROPIC_API_KEY" in l for l in wf.splitlines())     # never printed
    for l in commands:                  # every call to Cloudflare: never Sehat's, never a delete or a route
        for word in ("delete", "r2 ", "kv", "route", "domain", "migrations", "sehat", "fhb"):
            assert word not in l.lower(), (word, l)
        assert "secret" not in l.lower() or l in puts
        if re.search(r"(\$W|wrangler) d1 ", l):
            assert "$NAME" in l or "d1 list" in l, l


# the bundle

def load_build():
    spec = importlib.util.spec_from_file_location("worker_build", WORKER / "build.py")
    build = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(build)
    return build


def test_build_lays_out_the_hub_as_its_defaults_expect(tmp_path):
    out = tmp_path / "build"
    load_build().build(out)
    src, public = out / "src", out / "public"
    # config.TUTOR is two folders above tutor_hub, so src/ stands where tutor/ stands
    assert (src / "hub" / "tutor_hub" / "config.py").is_file() and (src / "entry.py").is_file()
    assert json.loads((src / "vars.json").read_text(encoding="utf-8")) == WRANGLER["vars"]
    assert sorted(f.name for f in (src / "migrations").glob("*.sql")) == sorted(
        f.name for f in (TUTOR / "migrations").glob("*.sql"))
    assert (src / "modules" / "teacher" / "module.json").is_file() and (src / "cohorts" / "staging.json").is_file()
    assert list((src / "content" / "packs").glob("*/lessons/*.json"))
    assert (src / "content" / "sources.json").is_file() and (src / "content" / "permissions" / "README.md").is_file()
    assert (src / "content" / "aliases.json").is_file() and list((src / "content" / "consent").glob("*/online-*.json"))
    # C5 M2: the static files' security headers; the staff pages may not be framed and run only this site's scripts
    headers = (public / "_headers").read_text(encoding="utf-8")
    for page in ("/admin/*", "/teacher/*", "/review/*"):
        rule = headers.split(page + "\n", 1)[1].split("\n/", 1)[0]
        assert "frame-ancestors 'none'" in rule and "default-src 'self'" in rule and "X-Frame-Options: DENY" in rule
    assert headers.startswith("/*\n  X-Content-Type-Options: nosniff\n  Content-Security-Policy: frame-ancestors 'self'\n")
    assert headers.count("nosniff") == 1                  # matching rules add up: one copy, never "nosniff, nosniff"
    assert not list((src / "content").rglob("*.opus"))        # clips are static assets; the hub reads manifests
    assert (public / "index.html").is_file() and not (public / "tests").exists()
    assert list((public / "packs").glob("*/pictures/*.svg"))
    assert not list(out.rglob("__pycache__")) and not (src / "app").exists()


# the entry point, with the hub's app on the D1 fake

class CountingD1(FakeD1):
    """The fake, counting the calls that each cost the Worker one D1 query (a batch is one)."""

    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.calls = 0

    async def batch(self, statements):
        self.calls += 1
        return await super().batch(statements)


def count_statements(monkeypatch):
    for name in ("all", "first", "run", "raw"):
        real = getattr(Statement, name)

        async def counted(self, *a, _real=real, **kw):
            self._db.calls = getattr(self._db, "calls", 0) + 1
            return await _real(self, *a, **kw)
        monkeypatch.setattr(Statement, name, counted)


def load_entry(monkeypatch, tmp_path, config=WORKER / "wrangler.toml"):
    """tutor/worker/entry.py loaded as the Worker loads it, with stand-ins for the runtime's modules: the
    `cloudflare:workers` env (D1 fake and the wrangler file's vars) and pyodide.ffi (the fake's)."""
    settings = tomllib.loads(Path(config).read_text(encoding="utf-8"))["vars"]
    count_statements(monkeypatch)
    db = CountingD1()
    env = SimpleNamespace(DB=db, **settings)
    workers = ModuleType("workers")
    workers.import_from_javascript = lambda name: SimpleNamespace(env=env)
    # the SDK's asgi.entrypoint(app) returns a WorkerEntrypoint class with `fetch` (python_modules/workers/asgi.py)
    workers.asgi = SimpleNamespace(entrypoint=lambda app: type("Default", (), {"app": app}))
    pyodide = ModuleType("pyodide")
    pyodide.ffi = fake_ffi
    for name, mod in {"workers": workers, "pyodide": pyodide, "pyodide.ffi": fake_ffi}.items():
        monkeypatch.setitem(sys.modules, name, mod)
    for k in {*WRANGLER["vars"], *settings}:            # entry.py sets them from the env, as on Cloudflare: so
        monkeypatch.setenv(k, "")                       # each is first recorded, and put back after the test
        monkeypatch.delenv(k)
    monkeypatch.setenv("TUTOR_DATA", str(tmp_path / "data"))
    load_build().build(tmp_path / "build", config)   # entry.py reads build/src/vars.json, made from the wrangler file
    spec = importlib.util.spec_from_file_location("qalam_worker_entry", tmp_path / "build" / "src" / "entry.py")
    entry = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(entry)
    assert entry.Default.app is entry.qalam and callable(entry.Default.scheduled)
    entry.db, entry.tmp = db, tmp_path
    return entry


@pytest.fixture
def worker(monkeypatch, tmp_path):
    return load_entry(monkeypatch, tmp_path)


def client(entry):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=entry.qalam), base_url="https://qalam-staging")


async def test_the_worker_serves_the_hub_with_print_off_and_sheets_and_teacher_on(worker):
    async with client(worker) as c:
        r = await c.get("/api/hello")
        assert r.status_code == 200
        h = r.json()
        assert [m["id"] for m in h["modules"]] == ["ask", "cert", "check", "homework", "lessons", "photo", "plan", "quran", "recall",
                                                  "review", "sheets", "teacher", "timetable", "university"]
        assert h["cohort"]["label"] == "Staging" and h["lessons"] > 0 and h["ai"]["on"] is True
        assert h["printer"]["state"] == "off"
        assert (await c.get("/api/print/1")).status_code == 404
        # the teacher module is on, but its staff gate is off until Access and its secrets are set up (staff.py)
        assert (await c.get("/api/m/teacher/me", headers={"X-Teacher-Pin": "123456"})).status_code == 404
        # online the sheet is HTML for the browser to print (no WeasyPrint here), and the answer page is not served
        sheet = await c.get("/api/sheets/maths-7-fractions-add.html?seed=4821")
        assert sheet.status_code == 200 and "M7-03-48217" in sheet.text and 'class="mk ring"' in sheet.text
        assert (await c.get("/api/sheets/maths-7-fractions-add.pdf")).status_code == 404
        assert (await c.get("/api/sheets/maths-7-fractions-add.html?kind=answers")).status_code == 404
        q = {"text": "Why does ice melt?", "lang": "en", "subject": "science"}
        assert (await c.post("/api/ask", json=q)).status_code == 401           # online: a learner who agreed
        j = await c.post("/api/join", json={"band": "s1", "lang": "en", "picture": "key",
                                            "consent": {"kind": "self", "version": h["consent"]}})
        a = await c.post("/api/ask", json=q, headers={"X-Learner-Token": j.json()["token"]})
        assert a.status_code == 200 and a.json()["source"] in ("ai", "bank", "lesson", "none")
        assert h["home"] == "online"
        assert (await c.get("/api/sheets/maths-7-fractions-add/key?seed=4821")).status_code == 200
    assert not (worker.tmp / "data").exists()          # no PIN file, no SQLite, no outbox: nothing on a disk
    tables = {r[0] for r in worker.db.sqlite.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"schema_migrations", "questions", "cohorts", "flags", "events", "ai_usage"} <= tables
    assert "d1_migrations" not in tables


async def test_the_app_is_built_at_import_and_the_hub_starts_once_per_isolate(worker):
    """Built at import, so Cloudflare's deploy-time snapshot holds it; the store opens on the first request."""
    assert worker.app.state.hub.library.lessons and worker.store.db is None and not worker._started
    async with client(worker) as c:
        await c.get("/api/hello")
        assert worker._started and worker.store.db is worker.db
        calls = worker.db.calls
        await c.get("/api/hello")
    assert worker.db.calls - calls == 2                  # no second start: the cohort and its flags only
    applied = [r[0] for r in worker.db.sqlite.execute("SELECT id FROM schema_migrations ORDER BY id")]
    assert applied == sorted(f.stem for f in (TUTOR / "migrations").glob("*.sql"))


async def test_every_request_stays_well_under_the_free_plans_query_limit(worker):
    """The first request starts the hub (migrations, seeds, prunes, the index) and is the costliest."""
    now = __import__("time").strftime("%Y-%m-%dT%H:%M", __import__("time").gmtime())
    events = [{"at": now, "verb": "lesson.start", "object": "maths-7-fractions-add"}] * 100
    costs = {}
    async with client(worker) as c:
        for name, method, path, body in [
                ("first request (hub starts)", "GET", "/api/hello", None),
                ("hello", "GET", "/api/hello", None),
                ("packs", "GET", "/api/packs", None),
                ("lesson", "GET", "/api/lessons/maths-7-fractions-add", None),
                ("sheet key", "GET", "/api/sheets/maths-7-fractions-add/key?seed=4821", None),
                ("join", "POST", "/api/join", {"band": "s1", "lang": "en", "picture": "key",
                                               "consent": {"kind": "guardian-on-phone", "version": "online-2026-10"}}),
                ("ask, a sum", "POST", "/api/ask", {"text": "1/2 + 1/4", "lang": "en"}),
                ("ask, the AI", "POST", "/api/ask", {"text": "Why does ice melt?", "lang": "en"}),
                ("learn this, a miss", "POST", "/api/m/plan", {"goal": "astronomy", "lang": "en", "band": "s1"}),
                ("100 events", "POST", "/api/events", {"events": events})]:
            before = worker.db.calls
            r = await c.request(method, path, json=body, headers=headers if path in ("/api/events", "/api/ask") else None)
            assert r.status_code == 200, (name, r.text)
            if path == "/api/join":
                headers = {"X-Learner-Token": r.json()["token"]}
            costs[name] = worker.db.calls - before
    # the start applies each migration once per database (one batch each), so on a fresh database it grows by one
    # with every migration file (an existing one applies only the new files); it stays near 60% of the plan's
    # limit (31 since 0018), everything but the migrations at 13, every other request at 20
    first = costs.pop("first request (hub starts)")
    assert first <= 31 < FREE_PLAN_QUERIES and first - len(list((TUTOR / "migrations").glob("*.sql"))) <= 13, first
    assert max(costs.values()) <= 20 < FREE_PLAN_QUERIES, costs
    assert costs["100 events"] <= 4, costs                    # her record (and her day seen), then one batch


async def test_the_spike_route_only_where_staging_asks_for_it(worker, monkeypatch):
    async with client(worker) as c:
        r = await c.get("/api/_spike")
        assert r.status_code == 200
        s = r.json()
        assert s["jsnull"] is True and s["batch_to_js"]["ok"] is True
        q = s["queries"]                                                                      # the fake has no limit
        assert (q["tried"], q["single_after_batch"], q["stopped_by"]) == (60, 60, None)
        assert q["wall_ms"] >= 0 and q["ms_per_query"] >= 0
        assert (await c.get("/api/_spike?n=5000")).json()["queries"]["tried"] == 1100
        monkeypatch.setenv("QALAM_SPIKE", "off")
        assert (await c.get("/api/_spike")).status_code == 404


async def test_a_photo_is_read_on_the_worker_and_nothing_of_it_reaches_d1(worker):
    """Staging has photo on; the strip goes to the gateway (the fake, which knows no picture here: every cell "?")
    and back, and D1 never sees it: the only row it adds is the AI call's count."""
    import base64
    strip = (Path(__file__).parent / "fixtures" / "photos" / "m7-prs-tilted.jpg").read_bytes()
    b64 = base64.b64encode(strip).decode()
    async with client(worker) as c:
        j = await c.post("/api/join", json={"band": "s1", "lang": "prs", "picture": "key",
                                            "consent": {"kind": "guardian-on-phone", "version": "online-2026-10"}})
        h = {"X-Learner-Token": j.json()["token"]}
        r = await c.post("/api/m/photo/mark", headers=h, json={"code": "M7-03-48217", "seed": 4821, "lang": "prs",
                                                               "strip": b64})
        assert r.status_code == 200, r.text
        assert {x["read"] for x in r.json()["readings"]} == {"?"}
    db = worker.db.sqlite
    tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")]
    dump = "\n".join(repr(tuple(row)) for t in tables for row in db.execute(f'SELECT * FROM "{t}"'))
    assert b64[100:160] not in dump and strip[100:140].hex() not in dump
    assert "read_sheet" in dump                                # the call was counted, and only counted


async def test_staff_pages_stay_off_until_the_three_access_secrets_are_set(worker):
    async with client(worker) as c:
        assert (await c.get("/api/m/review/me")).status_code == 404
    worker._started = False                                             # a new isolate, after Mo sets the secrets
    env = sys.modules["workers"].import_from_javascript("cloudflare:workers").env
    env.TUTOR_ACCESS_TEAM, env.TUTOR_ACCESS_AUD, env.TUTOR_STAFF_PEPPER = "team", "aud", "pepper"
    async with client(worker) as c:
        assert (await c.get("/api/m/review/me")).status_code == 401    # now it asks for Access's token
    assert worker.app.state.hub.staff.mode == "access"


async def test_staging_ai_is_the_fake_until_claudes_key_is_a_worker_secret_and_the_key_is_never_served(worker):
    async with client(worker) as c:
        assert (await c.get("/api/hello")).json()["ai"]["on"] is True
    assert worker.app.state.hub.gateway.provider.name == "fake"
    worker._started = False                                             # a new isolate, after the deploy job's put
    env = sys.modules["workers"].import_from_javascript("cloudflare:workers").env
    env.ANTHROPIC_API_KEY = "sk-ant-NOT-REAL-5555"
    async with client(worker) as c:
        r = await c.get("/api/hello")
    hub = worker.app.state.hub
    assert hub.gateway.provider.name == "anthropic" and hub.cfg.anthropic_key == env.ANTHROPIC_API_KEY
    assert r.json()["ai"]["on"] is True and env.ANTHROPIC_API_KEY not in r.text
    dump = "\n".join(repr(tuple(row)) for row in worker.db.sqlite.execute("SELECT * FROM cohorts"))
    assert env.ANTHROPIC_API_KEY not in dump


async def test_the_daily_cron_prunes_expired_reset_codes_old_wishes_and_old_logs(worker):
    """P24: the retention job is the Worker's cron (wrangler.toml [triggers]); `scheduled` runs the hub's prune(),
    starting the hub first when the cron is this isolate's first event."""
    assert WRANGLER["triggers"]["crons"] == ["17 22 * * *"]
    assert not worker._started
    await worker.Default().scheduled(SimpleNamespace(cron="17 22 * * *"), None, None)      # starts, and so prunes
    assert worker._started
    db = worker.db.sqlite
    db.execute("INSERT INTO reset_codes(token_hash, code_hash, expires) VALUES('a', 'x', '2020-01-01T00:00:00+00:00')")
    db.execute("INSERT INTO reset_codes(token_hash, code_hash, expires) VALUES('b', 'y', '2999-01-01T00:00:00+00:00')")
    for key, day in (("old", "2020-01-01"), ("new", "2999-01-01")):
        db.execute("INSERT INTO wishlist(cohort, band, lang, wish, wkey, first_day, last_day) "
                   "VALUES('staging', 's1', 'en', ?, ?, ?, ?)", (key, key, day, day))
    db.execute("INSERT INTO admin_log(at, what, changed_by) VALUES('2020-01-01T00:00:00+00:00', 'release', 'seed')")
    calls = worker.db.calls
    await worker.Default().scheduled()                                     # a later day: the isolate is warm
    assert worker.db.calls - calls <= 6                                     # one batch and the other three prunes
    assert [r[0] for r in db.execute("SELECT token_hash FROM reset_codes")] == ["b"]
    assert [r[0] for r in db.execute("SELECT wkey FROM wishlist")] == ["new"]
    assert db.execute("SELECT COUNT(*) FROM admin_log WHERE at < '2021'").fetchone()[0] == 0
