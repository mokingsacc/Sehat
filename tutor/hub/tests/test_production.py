"""Production (P24): worker/wrangler.production.toml, its guard (worker/guard.py) and the hand-started workflow
(.github/workflows/tutor-production.yml). Nothing here reaches Cloudflare: the production Worker is started on the D1
fake, as test_worker.py starts staging's."""
import copy
import importlib.util
import tomllib

import httpx
import pytest

from test_worker import TUTOR, WORKER, WRANGLER, load_entry

PRODUCTION = WORKER / "wrangler.production.toml"
TEXT = PRODUCTION.read_text(encoding="utf-8")
PROD = tomllib.loads(TEXT)
WORKFLOW = (TUTOR.parent / ".github" / "workflows" / "tutor-production.yml").read_text(encoding="utf-8")
STAGING_WORKFLOW = (TUTOR.parent / ".github" / "workflows" / "tutor-worker.yml").read_text(encoding="utf-8")
DB_ID = "0f1e2d3c-4b5a-4968-8776-655443322110"


def guard():
    spec = importlib.util.spec_from_file_location("worker_guard", WORKER / "guard.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def deployable(w=None):
    w = copy.deepcopy(w or PROD)
    w["d1_databases"][0]["database_id"] = DB_ID
    return w


def test_the_production_file_passes_its_guard_and_deploys_only_from_main_with_a_real_database():
    g = guard()
    assert g.problems(PROD, TEXT) == []
    assert any("database_id" in p for p in g.problems(PROD, TEXT, deploy=True, ref="refs/heads/main"))
    assert g.problems(deployable(), TEXT, deploy=True, ref="refs/heads/main") == []
    assert any("main only" in p for p in g.problems(deployable(), TEXT, deploy=True,
                                                    ref="refs/heads/a-working-branch"))


def test_the_guard_refuses_staging_sehat_and_anything_but_the_pilots_settings():
    g = guard()
    staging_text = (WORKER / "wrangler.toml").read_text(encoding="utf-8")
    assert g.problems(WRANGLER, staging_text)                      # the staging file is never production
    bad = []
    for change in (lambda w: w.update(name="sehat"), lambda w: w.update(routes=[{"pattern": "qalam.org/*"}]),
                   lambda w: w.update(kv_namespaces=[{"binding": "K", "id": "x"}]),
                   lambda w: w.update(r2_buckets=[{"binding": "R"}]), lambda w: w.update(observability={}),
                   lambda w: w["d1_databases"][0].update(database_name="qalam-staging"),
                   lambda w: w["d1_databases"][0].update(migrations_dir="../migrations"),
                   lambda w: w["d1_databases"].append({"binding": "S", "database_name": "fhb"}),
                   lambda w: w["vars"].update(TUTOR_AI_PROVIDER="fake"),
                   lambda w: w["vars"].update(TUTOR_AI_PROVIDER="local"),
                   lambda w: w["vars"].update(QALAM_SPIKE="on"), lambda w: w["vars"].update(TUTOR_RELEASE="0"),
                   lambda w: w["vars"].update(TUTOR_LACKS="printer"), lambda w: w["vars"].update(TUTOR_HOME="hub"),
                   lambda w: w["vars"].pop("TUTOR_ORIGINS"), lambda w: w.pop("triggers"),
                   lambda w: w.update(preview_urls=True),
                   lambda w: w["assets"].update(run_worker_first=["/*"]),
                   lambda w: w["assets"].update(run_worker_first=["/api/*"])):
        w = copy.deepcopy(PROD)
        change(w)
        bad.append(bool(g.problems(w, TEXT)))
    assert all(bad), bad
    assert g.problems(PROD, TEXT + "\n# deploy beside sehat\n")
    assert g.problems(PROD, TEXT.replace('"qalam"', '"qalam-staging"'))
    assert g.problems(dict(PROD, vars=dict(PROD["vars"], TUTOR_AI_PROVIDER="openai")), TEXT) == []


def test_production_differs_from_staging_only_where_it_must():
    same = ("main", "compatibility_date", "compatibility_flags", "workers_dev", "preview_urls", "assets", "rules",
            "triggers")
    assert {k: PROD[k] for k in same} == {k: WRANGLER[k] for k in same}
    assert set(PROD) == set(WRANGLER)
    v, s = PROD["vars"], WRANGLER["vars"]
    assert {k for k in v if v[k] != s.get(k)} == {"TUTOR_COHORT", "TUTOR_AI_PROVIDER", "TUTOR_RELEASE"}
    assert set(s) - set(v) == {"QALAM_SPIKE"}
    assert v["TUTOR_COHORT"] == "3w2lco2s8f" and (TUTOR / "cohorts" / "open.json").exists()


async def test_the_production_worker_starts_with_ai_off_release_on_and_the_cron(monkeypatch, tmp_path):
    entry = load_entry(monkeypatch, tmp_path, PRODUCTION)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=entry.qalam), base_url="https://qalam") as c:
        h = (await c.get("/api/hello")).json()
        assert h["home"] == "online" and h["printer"]["state"] == "off" and h["ai"]["on"] is False
        assert h["cohort"]["label"] == "Open"
        assert (await c.get("/api/_spike")).status_code == 404
        assert (await c.get("/api/print/1")).status_code == 404
    hub = entry.app.state.hub
    assert hub.cfg.release is True and hub.gateway.provider is None
    await entry.Default().scheduled(None, None, None)


def test_the_workflow_is_started_by_hand_from_main_behind_the_environment_and_creates_nothing():
    code = "\n".join(line.split(" #")[0] for line in WORKFLOW.splitlines() if not line.lstrip().startswith("#"))
    head = code.split("\njobs:")[0]
    assert "workflow_dispatch:" in head and "schedule:" in head
    assert "push:" not in head and "pull_request" not in head
    env = next(line for line in code.splitlines() if line.strip().startswith("environment:"))
    assert env.strip().endswith("&& 'production-backup' || 'production' }}")      # a deploy is always `production`
    assert "inputs.what == 'export'" in env and "github.ref == 'refs/heads/main'" in code
    assert "vars.QALAM_LIVE == 'yes'" in code                                    # the weekly export waits for go-live
    for never in ("d1 create", "secret put", "secrets.CLOUDFLARE_API_TOKEN", "ANDROID_", "d1 delete", "delete",
                  "qalam-staging", "migrations apply", "--force"):
        assert never not in code, never
    order = [code.index(s) for s in ("python3 guard.py wrangler.toml\n", "guard.py wrangler.toml --deploy",
                                     "wrangler d1 list", "python3 build.py", "pywrangler deploy")]
    assert order == sorted(order)
    export = code[code.index("d1 export"):]
    assert export.index("gpg ") < export.index("shred -u") < export.index("upload-artifact")
    assert "*.gpg" in export and "retention-days: 35" in export
    assert "--remote" in export


def test_the_staging_guard_is_unchanged():
    """The staging job keeps its own guard, inline and as it was: production is a separate workflow and file."""
    assert 'if w.get("name") != "qalam-staging":' in STAGING_WORKFLOW
    assert 'for key in ("routes", "route", "kv_namespaces", "r2_buckets", "queues", "durable_objects", "services"):' \
        in STAGING_WORKFLOW
    assert "wrangler.production.toml" not in STAGING_WORKFLOW


pytestmark = pytest.mark.anyio


async def test_a_d1_export_restores_into_a_working_store(monkeypatch, tmp_path):
    """The restore drill's offline half (docs/RELEASE.md): a dump of the D1 database, as `wrangler d1 export` writes
    one, loads into a fresh SQLite file that the hub opens with every learner, wish and log row still there."""
    import sqlite3
    from tutor_hub.stores import SqliteStore
    entry = load_entry(monkeypatch, tmp_path, PRODUCTION)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=entry.qalam), base_url="https://qalam") as c:
        h = (await c.get("/api/hello")).json()
        for picture in ("key", "cup", "book"):
            r = await c.post("/api/join", json={"band": "s1", "lang": "prs", "picture": picture,
                                                "consent": {"kind": "guardian-on-phone", "version": h["consent"]}})
            assert r.status_code == 200
    src = entry.db.sqlite
    src.set_authorizer(None)                            # the fake refuses PRAGMA, as D1 does; the export does not
    dump = "\n".join(src.iterdump())
    assert "CREATE TABLE" in dump and "INSERT INTO" in dump
    restored = tmp_path / "restored.db"
    db = sqlite3.connect(restored)
    db.executescript(dump)
    db.close()
    s = SqliteStore(restored)
    await s.open()                                      # its migrations are all recorded: nothing to apply again
    try:
        assert len(await s.learners_in("3w2lco2s8f")) == 3
        assert await s.cohort("3w2lco2s8f")
    finally:
        await s.close()
    tables = lambda con: {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}  # noqa: E731
    assert tables(sqlite3.connect(restored)) == tables(src)
