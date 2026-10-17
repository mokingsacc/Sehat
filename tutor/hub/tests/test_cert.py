"""Certificates (P25b, C4.2): earned from her own events with consent; a row with no learner in it; the paper with an
empty name line; the check at /api/cert/<id> and /v/<id>; the hub's print queue with the id only. No network."""
import sqlite3
from datetime import datetime, timezone

import pytest

from tutor_hub import cert, graph, learners
from tutor_hub.stores.base import CERT_ID

NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M")
MONEY = ["adult-maths-1-numbers", "adult-maths-2-change"]          # ad-money: the goal and what it needs


def join(c, band="ad", consent=True):
    body = {"band": band, "lang": "prs", "picture": "key"}
    if consent:
        body["consent"] = {"kind": "self", "version": c.hub.consent_version}
    r = c.post("/api/join", json=body)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def did(c, token, *evs):
    r = c.post("/api/events", headers={"X-Learner-Token": token},
               json={"events": [{"at": NOW, "verb": v, "object": o, "value": n} for v, o, n in evs]})
    assert r.status_code == 200, r.text


def earn(c, token, path="ad-money", lang="prs", version=None):
    found = graph.find_pathway(c.hub.library.graphs, path)
    version = version or (found[0]["version"] if found else "1")
    return c.post("/api/m/cert", headers={"X-Learner-Token": token}, json={"path": path, "version": version,
                                                                           "lang": lang})


def test_the_solar_hijri_month_is_the_one_holding_the_tenth():
    assert cert.hijri("2027-10") == (1406, 7) and cert.hijri("2028-01") == (1406, 10)
    assert cert.hijri("2027-03") == (1405, 12) and cert.hijri("2027-04") == (1406, 1)
    assert cert.month_labels("2027-10") == {"prs": "میزان ۱۴۰۶", "ps": "تله ۱۴۰۶", "en": "October 2027"}


def test_every_lesson_must_count_and_the_final_needs_its_sheet():
    done = {"done": True, "best": None}
    assert cert.missing(["a", "b"], "b", {"a": done, "b": {"done": False, "best": 85}}) == []
    assert cert.missing(["a", "b"], "b", {"a": done, "b": done}) == ["b"]              # the final: its sheet
    assert cert.missing(["a", "b"], None, {"a": {"done": False, "best": 80}, "b": done}) == []
    assert cert.missing(["a", "b"], None, {"a": {"done": False, "best": 79}}) == ["a", "b"]
    assert cert.can_certify({"subject": "maths"}, {"certificate": True})
    assert not cert.can_certify({"subject": "quran"}, {"certificate": True})
    assert not cert.can_certify({"subject": "maths"}, {"certificate": False})


def test_a_finished_pathway_earns_a_certificate_whose_row_says_nothing_about_her(hub_client):
    c = hub_client
    token = join(c)
    did(c, token, ("lesson.done", MONEY[0], 3), ("check.done", MONEY[1], 90))
    r = earn(c, token)
    assert r.status_code == 200, r.text
    out = r.json()
    assert CERT_ID.match(out["id"]) and out["month"] == NOW[:7] and out["lessons"] == 2
    assert out["url"] == f"{c.hub.cfg.public_url}/v/{out['id']}"
    body = out["paper"]["body"]
    assert '<div class="cert-name"></div>' in body and out["url"] in body and "<svg" in body
    assert "تمام کرده است" in body and "Everyday maths" in body and "passed" not in body
    assert ".cert-paper" in out["paper"]["css"]
    db = sqlite3.connect(c.hub.cfg.data / "hub.db")
    cols = [r[1] for r in db.execute("PRAGMA table_info(certificates)")]
    assert cols == ["id", "course", "version", "month", "cohort"]
    [row] = db.execute("SELECT * FROM certificates").fetchall()
    assert row == (out["id"], "ad-money", "2026.10.17", NOW[:7], c.hub.cohort_id)
    assert learners.token_hash(token) not in str(row) and token not in str(row)
    # checking it: the course in three languages and the month, no token, any case
    chk = c.get(f"/api/cert/{out['id'].lower()}").json()
    assert chk["course"]["en"].startswith("Everyday maths") and chk["course"]["prs"] and chk["course"]["ps"]
    assert chk["month"] == NOW[:7] and set(chk["months"]) == {"prs", "ps", "en"}
    assert c.get("/api/cert/QC-00000-00000").status_code == 404
    assert c.get("/api/cert/not-an-id").status_code == 404
    page = c.get(f"/v/{out['id']}")
    assert page.status_code == 200 and "/js/certcheck.js" in page.text and out["id"] not in page.text
    assert page.headers["cache-control"] == "no-store"


def test_missing_events_say_which_lessons_and_write_nothing(hub_client):
    c = hub_client
    token = join(c)
    did(c, token, ("lesson.done", MONEY[0], 3), ("lesson.done", MONEY[1], 3))      # the final without its sheet
    r = earn(c, token)
    assert r.status_code == 409 and r.json()["missing"] == [MONEY[1]]
    other = join(c)
    did(c, other, ("check.done", MONEY[1], 95))
    assert earn(c, token).status_code == 409                       # another learner's events never count for her
    db = sqlite3.connect(c.hub.cfg.data / "hub.db")
    assert db.execute("SELECT COUNT(*) FROM certificates").fetchone() == (0,)


def test_no_certificate_without_her_token_her_consent_her_band_or_the_current_version(hub_client):
    c = hub_client
    assert c.post("/api/m/cert", json={"path": "ad-money", "version": "x"}).status_code == 401
    assert earn(c, join(c, consent=False)).status_code == 403
    child = join(c, band="s1")
    assert earn(c, child).status_code == 404                        # an adult pathway, a child's band
    assert earn(c, child, path="no-such-path").status_code == 404
    assert earn(c, join(c), version="1999").status_code == 409


def test_five_requests_a_day_a_token(hub_client):
    c = hub_client
    token = join(c)
    codes = [earn(c, token).status_code for _ in range(6)]
    assert codes == [409] * 5 + [429]


def test_the_module_switch_and_the_check_route_that_stays(hub_client):
    c = hub_client
    token = join(c)
    did(c, token, ("lesson.done", MONEY[0], 3), ("check.done", MONEY[1], 90))
    cid = earn(c, token).json()["id"]
    c.portal.call(lambda: c.hub.store.set_flag(c.hub.cohort_id, "cert", enabled=False, settings={},
                                               changed_by="admin:t"))
    assert earn(c, token).status_code == 404
    assert c.get(f"/api/cert/{cid}").status_code == 200             # the check is the core's, always on


def test_the_hubs_print_queue_holds_the_id_only(hub_client):
    c = hub_client
    token = join(c)
    did(c, token, ("lesson.done", MONEY[0], 3), ("check.done", MONEY[1], 90))
    cid = earn(c, token).json()["id"]
    seen = []
    c.hub.prints.add = lambda jid, spec: seen.append(spec)
    r = c.post("/api/m/cert/print", json={"id": cid, "lang": "prs", "lessons": 2})
    assert r.status_code == 200 and r.json()["status"] == "queued"
    db = sqlite3.connect(c.hub.cfg.data / "hub.db")
    assert db.execute("SELECT lesson_id, kind, copies FROM prints").fetchall() == [(cid, "certificate", 1)]
    assert seen[0]["cert"] == cid and seen[0]["title"] == f"Qalam certificate {cid}" and "name" not in seen[0]
    html = cert.document(cert.paper_body(titles=seen[0]["titles"], lang="prs", cid=cid, month=seen[0]["month"],
                                         lessons=2, url="http://10.42.0.1/v/" + cid), cid=cid, fonts="/fonts")
    assert '<div class="cert-name"></div>' in html and "A4 landscape" in html
    assert c.post("/api/m/cert/print", json={"id": "QC-00000-00000"}).status_code == 404


@pytest.mark.parametrize("n", [31])
def test_checks_are_limited_by_address(hub_client, n):
    codes = [hub_client.get("/api/cert/QC-00000-00000").status_code for _ in range(n)]
    assert codes[:30] == [404] * 30 and codes[30] == 429


def test_the_seeds_and_migration_0016_turn_certificates_on_and_give_open_five_photos_a_day(tmp_path):
    import shutil
    from tutor_hub import flags
    from tutor_hub.stores.sqlite import MIGRATIONS, migrate
    from test_modules import REAL, TUTOR
    seeds, _ = flags.load_seeds(TUTOR / "cohorts")
    assert all(s["modules"]["cert"] is True for s in seeds.values())
    m = REAL["cert"]
    assert m["capabilities"] == [] and m["slots"] == [] and "ey" not in m["bands"] and m["settings"]["per_day"]["default"] == 5
    assert REAL["photo"]["settings"]["per_day"]["default"] == 10
    early = tmp_path / "early"
    early.mkdir()
    for f in sorted(MIGRATIONS.glob("*.sql")):
        if f.name < "0016":
            shutil.copy(f, early / f.name)
    db = sqlite3.connect(tmp_path / "t.db", isolation_level=None)
    migrate(db, early)
    for cid in ("d6co6etep6", "qg1j2918yx", "3w2lco2s8f"):
        db.execute("INSERT INTO cohorts(id, label, langs, bands, settings, created) "
                   "VALUES(?, 'x', '[]', '[]', '{}', 'now')", (cid,))
        db.execute("INSERT INTO flags(module, cohort, enabled, settings, changed_by, changed_at) "
                   "VALUES('photo', ?, 0, '{}', 'seed', 'now')", (cid,))
    assert migrate(db) == ["0016_cert", "0017_made"]
    on = db.execute("SELECT cohort, enabled, changed_by FROM flags WHERE module='cert' ORDER BY cohort").fetchall()
    assert on == [("3w2lco2s8f", 1, "seed"), ("d6co6etep6", 1, "seed"), ("qg1j2918yx", 1, "seed")]
    photo = dict(db.execute("SELECT cohort, settings FROM flags WHERE module='photo'").fetchall())
    assert photo == {"3w2lco2s8f": '{"per_day": 5}', "d6co6etep6": "{}", "qg1j2918yx": "{}"}
    assert db.execute("SELECT COUNT(*) FROM flag_log WHERE module IN ('cert', 'photo')").fetchone() == (4,)
    assert migrate(db) == []
