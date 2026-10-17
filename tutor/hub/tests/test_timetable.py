"""The virtual school day (P19): the timetable template, its check, the route that serves it without a token, the
kill switch, and migration 0011 for a database seeded before it."""
import copy
import pathlib
import shutil
import sqlite3

from tutor_hub import flags, timetable
from tutor_hub.stores.sqlite import MIGRATIONS, migrate

TUTOR = pathlib.Path(__file__).resolve().parents[2]


SEEDS = {"d6co6etep6": "hub", "qg1j2918yx": "staging", "3w2lco2s8f": "open"}
OTHER = "zz99yy88xx"


# the template

def test_the_default_template_follows_the_spec():
    assert timetable.check("default") == [] and timetable.check(timetable.DEFAULT) == []
    assert timetable.DEFAULT["days"] == ["sat", "sun", "mon", "tue", "wed", "thu"]
    periods = {b: [x["min"] for x in d["blocks"] if x["kind"] == "period"] for b, d in timetable.DEFAULT["bands"].items()}
    assert periods == {"p1": [25, 25], "p2": [30, 30, 30], "s1": [40] * 4, "s2": [40] * 4}
    for d in timetable.DEFAULT["bands"].values():
        kinds = [x["kind"] for x in d["blocks"]]
        assert kinds[0] == "opening" and kinds[-2:] == ["sheet", "close"] and kinds.count("break") == 1


def test_a_band_without_a_day_gets_none():
    assert timetable.for_band("default", "ey") is None and timetable.for_band("default", "ad") is None
    assert timetable.for_band(None, "s1") is None
    own = {"days": ["sat"], "bands": {"p1": {"start": "09:00", "blocks": [{"kind": "period", "min": 30}]}}}
    assert timetable.for_band(own, "s1") is None
    t = timetable.for_band(own, "p1")
    assert t == {"days": ["sat"], "holidays": [], "ramadan": None, "start": "09:00",
                 "blocks": [{"kind": "period", "min": 30}]}


def test_the_check_names_each_problem():
    bad = copy.deepcopy(timetable.DEFAULT)
    bad["days"] = ["sat", "sat"]
    bad["holidays"] = ["21 March"]
    bad["bands"]["ey"] = bad["bands"]["p1"]
    bad["bands"]["p1"] = {"start": "8am", "blocks": [{"kind": "nap", "min": 5}, {"kind": "break", "min": 500}]}
    bad["ramadan"] = {"from": "2027-03-09", "to": "2027-02-08", "start": "09:30", "period_min": 5}
    bad["name"] = "x"
    p = timetable.check(bad)
    for words in ("nothing else", "timetable.days", "timetable.holidays", "bands.ey", "p1.start", "kind is one of",
                  "5 to 120 minutes", "at least one period", "from first", "period_min"):
        assert any(words in x for x in p), (words, p)
    assert timetable.check("mine") and timetable.check([]) and timetable.template({"days": []}) is None
    late = {"days": ["sat"], "bands": {"s1": {"start": "21:00", "blocks": [{"kind": "period", "min": 90}]}}}
    assert any("22:00" in x for x in timetable.check(late))
    long = {"days": ["sat"], "bands": {"s1": {"start": "06:00", "blocks": [{"kind": "period", "min": 120}] * 5}}}
    assert any("at most 9 hours" in x for x in timetable.check(long))


def test_a_cohort_file_with_a_broken_timetable_is_refused():
    seeds, problems = flags.load_seeds(TUTOR / "cohorts")
    assert not problems and all(s["settings"]["timetable"] == "default" for s in seeds.values())
    assert all(s["modules"]["timetable"] is True for s in seeds.values())
    c = copy.deepcopy(seeds["hub"])
    c["settings"]["timetable"] = {"days": ["fri"], "bands": {"p1": {"start": "25:00", "blocks": []}}}
    assert any(x.startswith("settings.timetable.bands.p1") for x in flags.check_cohort(c))
    c["settings"] = {"bells": "loud"}
    assert flags.check_cohort(c) == [f"settings may only hold {', '.join(flags.SETTINGS)} for now"]


# the route

def test_the_hub_serves_her_bands_day_without_a_token(hub_client):
    r = hub_client.get("/api/m/timetable", params={"band": "s1"})
    assert r.status_code == 200
    j = r.json()
    assert j["cohort"] == hub_client.hub.cohort_id and j["band"] == "s1"
    assert j["timetable"] == timetable.for_band("default", "s1")
    assert hub_client.get("/api/m/timetable", params={"band": "p1", "cohort": hub_client.hub.cohort_id}).status_code == 200
    for band in ("ey", "ad", "zz"):
        assert hub_client.get("/api/m/timetable", params={"band": band}).status_code == 404
    assert hub_client.get("/api/m/timetable", params={"band": "s1", "cohort": OTHER}).status_code == 404
    assert hub_client.get("/api/m/timetable").status_code == 422


def test_reading_the_day_records_nothing(hub_client):
    before = len(hub_client.portal.call(hub_client.hub.store.events, hub_client.hub.cohort_id, 500))
    for band in ("p1", "p2", "s1", "s2"):
        hub_client.get("/api/m/timetable", params={"band": band}, headers={"X-Learner-Token": "a" * 43})
    assert len(hub_client.portal.call(hub_client.hub.store.events, hub_client.hub.cohort_id, 500)) == before


def test_the_kill_switch_takes_the_school_day_away(hub_client):
    hub = hub_client.hub
    ids = lambda: [m["id"] for m in hub_client.get("/api/hello").json()["modules"]]  # noqa: E731
    assert "timetable" in ids()
    hub.store.sync.set_flag(hub.cohort_id, "timetable", enabled=False, changed_by="admin")
    assert "timetable" not in ids()
    assert hub_client.get("/api/m/timetable", params={"band": "s1"}).status_code == 404
    hub.store.sync.set_flag(hub.cohort_id, "timetable", enabled=True, changed_by="admin")
    assert hub_client.get("/api/m/timetable", params={"band": "s1"}).status_code == 200


def test_the_module_is_for_the_school_bands_and_adults_study_time(hub_client):
    # 7b: adults are in the module's bands for their study time, which lives on the phone; no timetable is served them
    tt = next(m for m in hub_client.get("/api/hello").json()["modules"] if m["id"] == "timetable")
    assert tt["bands"] == ["p1", "p2", "s1", "s2", "ad"] and tt["risk"] == "none"
    assert hub_client.get("/api/m/timetable", params={"band": "ad", "cohort": hub_client.hub.cohort_id}).status_code == 404


# migration 0011

def test_migration_0011_gives_an_existing_database_the_school_day(tmp_path):
    early = tmp_path / "early"
    early.mkdir()
    for f in sorted(MIGRATIONS.glob("*.sql")):
        if f.name < "0011":
            shutil.copy(f, early / f.name)
    db = sqlite3.connect(tmp_path / "t.db", isolation_level=None)
    migrate(db, early)
    for cid in (*SEEDS, OTHER):
        db.execute("INSERT INTO cohorts(id, label, langs, bands, settings, created) "
                   "VALUES(?, 'x', '[]', '[]', '{\"maturity\": [\"pilot\"]}', 'now')", (cid,))
    assert migrate(db) == ["0011_timetable", "0012_teacher", "0013_plan", "0014_admin", "0015_recall", "0016_cert",
                          "0017_made", "0018_prices", "0019_live"]
    rows = dict(db.execute("SELECT id, json_extract(settings, '$.timetable') FROM cohorts").fetchall())
    assert rows == {**{c: "default" for c in SEEDS}, OTHER: None}
    assert db.execute("SELECT json_extract(settings, '$.maturity[0]') FROM cohorts WHERE id=?",
                      ("qg1j2918yx",)).fetchone() == ("pilot",)
    on = db.execute("SELECT cohort, enabled, changed_by FROM flags WHERE module='timetable' ORDER BY cohort").fetchall()
    assert on == sorted((c, 1, "seed") for c in SEEDS)
    assert db.execute("SELECT COUNT(*) FROM flag_log WHERE module='timetable'").fetchone() == (3,)
    assert migrate(db) == []


def test_migration_0011_leaves_a_cohorts_own_timetable_and_switch_alone(tmp_path):
    early = tmp_path / "early"
    early.mkdir()
    for f in sorted(MIGRATIONS.glob("*.sql")):
        if f.name < "0011":
            shutil.copy(f, early / f.name)
    db = sqlite3.connect(tmp_path / "t.db", isolation_level=None)
    migrate(db, early)
    db.execute("INSERT INTO cohorts(id, label, langs, bands, settings, created) "
               "VALUES('qg1j2918yx', 'x', '[]', '[]', '{\"timetable\": {\"days\": [\"sat\"]}}', 'now')")
    db.execute("INSERT INTO flags(module, cohort, enabled, settings, changed_by, changed_at) "
               "VALUES('timetable', 'qg1j2918yx', 0, '{}', 'admin', 'now')")
    migrate(db)
    assert db.execute("SELECT json_extract(settings, '$.timetable.days[0]') FROM cohorts").fetchone() == ("sat",)
    assert db.execute("SELECT enabled, changed_by FROM flags WHERE module='timetable'").fetchone() == (0, "admin")
