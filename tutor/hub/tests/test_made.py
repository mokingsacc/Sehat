"""Her own questions (P32, C4.8): layer 2, "Ask my teacher to check". Off until an admin turns `made` on, and only
where `teacher` is on too; the words pass rules.py (distress goes to Needs care) and the identifier filter; the
teacher's verdict comes back to her phone; the rows go when she deletes herself and 60 days after they were sent or
decided. `share.cohort` is registered and blocked. Layer 1 (the phone) is app/tests/made.test.js."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from tutor_hub import modules
from tutor_hub.mods import made
from tutor_hub.server import admin_pin, create_app, teacher_pin
from tutor_hub.stores.base import MADE_CHIPS, MADE_DAYS

from test_modules import REAL

STAGING = "qg1j2918yx"              # cohorts/staging.json: teacher on, made off (no seed turns it on)
Q = {"q": "What is 3/4 of 12?", "a": "9", "why": "12 split in 4 is 3, and 3 of them is 9"}


@pytest.fixture
def hub(cfg):
    cfg.cohort = STAGING
    with TestClient(create_app(cfg)) as c:
        c.hub = c.app.state.hub
        c.pin = {"X-Teacher-Pin": teacher_pin(cfg.data)}
        c.admin = {"X-Admin-Pin": admin_pin(cfg.data)}
        yield c


def flag(c, module, enabled=True, settings=None):
    body = {"enabled": enabled, "confirm": True, "both": True}
    if settings:
        body["settings"] = settings
    r = c.post(f"/api/m/admin/cohorts/{STAGING}/flags/{module}", json=body, headers=c.admin)
    assert r.status_code == 200, r.text


def join(c, lang="en"):
    r = c.post("/api/join", json={"band": "s1", "lang": lang, "picture": "key",
                                  "consent": {"kind": "self", "version": c.hub.consent_version}})
    assert r.status_code == 200, r.text
    return {"X-Learner-Token": r.json()["token"]}


def send(c, me, body=None, lang="en", **over):
    return c.post("/api/m/made", json={"kind": "question", "body": {**Q, **(body or {})}, "lang": lang, **over},
                  headers=me)


def sql(c, query, args=()):
    s = c.hub.store.sync
    with s.lock:
        return [tuple(r) for r in s.db.execute(query, args)]


def test_off_until_an_admin_turns_it_on_and_only_where_a_teacher_reads_to_do(hub):
    me = join(hub)
    assert "made" not in hub.get("/api/modules").json().get("enabled", [])
    assert send(hub, me).status_code == 404
    assert hub.get("/api/m/made/mine", headers=me).status_code == 404
    flag(hub, "made")
    assert send(hub, me).status_code == 200
    flag(hub, "teacher", False)
    assert send(hub, me).status_code == 404                     # layer 2 needs a teacher who reads To do
    assert hub.post("/api/m/made", json={"kind": "question", "body": Q, "lang": "en"}).status_code in (401, 404)


def test_she_sends_one_the_teacher_checks_it_and_her_phone_reads_the_verdict(hub):
    flag(hub, "made")
    me = join(hub)
    assert hub.post("/api/m/made", json={"kind": "question", "body": Q, "lang": "en"}).status_code == 401
    mid = send(hub, me).json()["id"]
    other = send(hub, me, {"q": "What is 1/2 of 10?", "a": "5", "why": ""}).json()["id"]
    todo = hub.get("/api/m/teacher/todo", headers=hub.pin).json()
    mine = [x for x in todo["items"] if x["kind"] == "made"]
    assert [x["mid"] for x in mine] == [mid, other] and todo["groups"]["made"] == 2
    assert mine[0]["made"] == Q and mine[0]["question"] == Q["q"] and todo["items"][-1]["kind"] == "made"
    # nothing of who she is reaches the teacher: no token, alias, band or number
    assert not {"token", "token_hash", "alias", "band", "number", "picture"} & set(mine[0])
    assert hub.get("/api/m/made/mine", headers=me).json()["items"] == [
        {"id": mid, "status": "waiting", "chips": [], "reply": None},
        {"id": other, "status": "waiting", "chips": [], "reply": None}]
    ok = hub.post(f"/api/m/teacher/made/{mid}", json={"verdict": "ok", "chips": []}, headers=hub.pin)
    assert ok.status_code == 200, ok.text
    assert hub.post(f"/api/m/teacher/made/{mid}", json={"verdict": "ok", "chips": []},
                    headers=hub.pin).status_code == 404               # decided once
    # the teacher's note may not give her answer away, nor carry a name or number; the chips are a closed list
    assert hub.post(f"/api/m/teacher/made/{other}", json={"verdict": "change", "chips": ["answer_wrong"],
                                                         "reply": "It is 5."}, headers=hub.pin).status_code == 422
    assert hub.post(f"/api/m/teacher/made/{other}", json={"verdict": "change", "chips": ["rude"]},
                    headers=hub.pin).status_code == 422
    assert hub.post(f"/api/m/teacher/made/{other}", json={"verdict": "maybe", "chips": []},
                    headers=hub.pin).status_code == 422
    r = hub.post(f"/api/m/teacher/made/{other}", json={"verdict": "change", "chips": ["spelling", "unclear"],
                                                      "reply": "Look at the word half again, call 0701234567"},
                 headers=hub.pin)
    assert r.status_code == 200, r.text
    got = {x["id"]: x for x in hub.get("/api/m/made/mine", headers=me).json()["items"]}
    assert got[mid] == {"id": mid, "status": "ok", "chips": [], "reply": None}
    assert got[other]["status"] == "change" and got[other]["chips"] == ["spelling", "unclear"]
    assert "0701234567" not in got[other]["reply"] and got[other]["reply"].startswith("Look at the word half")
    assert not [x for x in hub.get("/api/m/teacher/todo", headers=hub.pin).json()["items"] if x["kind"] == "made"]
    # another learner reads only her own
    assert hub.get("/api/m/made/mine", headers=join(hub)).json()["items"] == []
    assert hub.post("/api/m/teacher/made/1", json={"verdict": "ok", "chips": []}).status_code in (401, 403)


@pytest.mark.parametrize("words", ["My name is Laila, what is 2+2?", "Write to me at a@b.org", "Call 0791234567",
                                   "Look at www.example.com", "See khanacademy.org"])
def test_a_name_a_number_an_email_or_a_web_address_is_refused_so_she_takes_it_out(hub, words):
    flag(hub, "made")
    me = join(hub, "prs")
    for field in ("q", "a", "why"):
        r = send(hub, me, {field: words}, lang="prs")
        assert r.status_code == 422 and r.json()["error"] == made.REFUSE["prs"], (field, r.text)
    assert sql(hub, "SELECT COUNT(*) FROM made") == [(0,)]


def test_distress_goes_to_needs_care_and_what_the_rules_stop_is_refused_with_its_message(hub):
    flag(hub, "made")
    me = join(hub)
    r = send(hub, me, {"q": "I want to die", "a": "x"})
    assert r.status_code == 200 and r.json()["care"] is True and r.json()["id"] is None and r.json()["message"]
    todo = hub.get("/api/m/teacher/todo", headers=hub.pin).json()
    assert todo["groups"]["care"] == 1 and todo["groups"]["made"] == 0 and todo["items"][0]["kind"] == "care"
    r = send(hub, me, {"q": "نظر تو درباره‌ی انتخابات چیست؟"})
    assert r.status_code == 422 and r.json()["error"]
    assert sql(hub, "SELECT COUNT(*) FROM made") == [(0,)]


def test_the_shape_is_checked_and_a_day_has_its_limit(hub):
    flag(hub, "made", settings={"per_day": 2})
    me = join(hub)
    assert send(hub, me, {"q": "x" * 301}).status_code == 422
    assert send(hub, me, {"q": " "}).status_code == 422
    assert send(hub, me, kind="lesson").status_code == 422          # lessons wait for 2028 (C4.8)
    assert send(hub, me, lang="de").status_code == 422
    assert send(hub, me, {"name": "Laila"}).status_code == 422       # no other field
    n = sql(hub, "SELECT COUNT(*) FROM made")[0][0]
    codes = [send(hub, me).status_code for _ in range(4)]
    assert codes.count(429) >= 1 and sql(hub, "SELECT COUNT(*) FROM made")[0][0] <= n + 2


def test_her_rows_go_when_she_deletes_herself_and_sixty_days_after_sent_or_decided(hub):
    flag(hub, "made")
    me, other = join(hub), join(hub)
    send(hub, me)
    keep = send(hub, other).json()["id"]
    assert hub.delete("/api/me", headers=me).status_code == 200
    assert [r[0] for r in sql(hub, "SELECT id FROM made")] == [keep]
    now = datetime.now(timezone.utc)
    old = (now - timedelta(days=MADE_DAYS + 1)).isoformat(timespec="seconds")
    young = (now - timedelta(days=MADE_DAYS - 1)).isoformat(timespec="seconds")
    sql(hub, "UPDATE made SET at=? WHERE id=?", (old, keep))
    a = send(hub, other).json()["id"]
    sql(hub, "UPDATE made SET at=?, decided_at=?, status='ok' WHERE id=?", (old, young, a))   # decided lately: kept
    hub.portal.call(hub.hub.prune)
    assert [r[0] for r in sql(hub, "SELECT id FROM made")] == [a]
    cols = {r[1] for r in sql(hub, "PRAGMA table_info(made)")}
    assert not {"name", "alias", "band", "number", "picture", "token"} & cols


def test_sharing_with_the_class_is_registered_and_blocked():
    assert modules.CAPABILITY_RISK["share.cohort"] == "blocked" and "share.cohort" in modules.RISK_SENTENCE
    assert "share.cohort" not in REAL["made"]["capabilities"]
    assert modules.risk({**REAL["made"], "capabilities": ["free.text", "share.cohort"]}) == "blocked"
    assert set(MADE_CHIPS) == {"spelling", "answer_wrong", "unclear", "unsafe", "not_school"}
