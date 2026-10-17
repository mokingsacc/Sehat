"""The admin panel (P21, C3.3, DESIGN-C2C3-SPECS item 12): the admin PIN on the hub and an admin staff row online;
cohorts with neutral labels and class codes shown once; module switches with risks, dependencies and maturity, and
blocked capabilities only with paid human moderation; the two kill switches; content releases and review notes; the
wishlist across cohorts; AI spend and safety counts; staff without emails; and every change in the log. No network:
the AI is the fake."""
import asyncio
import copy
import json
import shutil
import sqlite3

import pytest
from fastapi.testclient import TestClient

from tutor_hub import admin as admin_mod
from tutor_hub import flags, learners, staff
from tutor_hub.ai.fake import FakeProvider
from tutor_hub.config import Config
from tutor_hub.server import admin_pin, create_app, teacher_pin

from test_review import PEPPER, STAGING, online, rsa, token  # noqa: F401  (fixtures and helpers)

HUB = "d6co6etep6"
OPEN = "3w2lco2s8f"


@pytest.fixture
def hub(cfg):
    cfg.ai_provider = "fake"
    with TestClient(create_app(cfg)) as c:
        c.hub = c.app.state.hub
        c.fake = c.hub.gateway.provider = FakeProvider()
        c.hub.brain.gateway.provider = c.fake
        c.pin = {"X-Admin-Pin": admin_pin(cfg.data)}
        c.cfg = cfg
        yield c


def get(c, path, **kw):
    r = c.get("/api/m/admin" + path, headers=c.pin, **kw)
    assert r.status_code == 200, (path, r.text)
    return r.json()


def post(c, path, body=None, status=200):
    r = c.post("/api/m/admin" + path, headers=c.pin, json=body or {})
    assert r.status_code == status, (path, r.status_code, r.text)
    return r.json()


def as_admin(c, rsa, email="admin@example.org", role="admin"):
    asyncio.run(c.hub.store.add_staff(id_hash=staff.id_hash(PEPPER, email), label="Admin A" if role == "admin"
                                      else "Teacher A", role=role, cohorts=[STAGING], initials=""))
    c.pin = {"Cf-Access-Jwt-Assertion": token(rsa, email=email), "X-Qalam": "1"}   # as the page sends
    return c


# the gate

def test_the_hub_opens_it_with_the_admin_pin_never_the_teachers(hub, cfg):
    assert hub.get("/api/m/admin/me").status_code == 401
    assert hub.get("/api/m/admin/me", headers={"X-Admin-Pin": teacher_pin(cfg.data)}).status_code == 401
    assert admin_pin(cfg.data) != teacher_pin(cfg.data)
    me = get(hub, "/me")
    assert me["via"] == "pin" and me["home"] == "hub" and me["staff"] is False
    # five wrong admin PINs lock the admin page for a while, not the teacher's
    for _ in range(5):
        hub.get("/api/m/admin/me", headers={"X-Admin-Pin": "000000"})
    assert hub.get("/api/m/admin/me", headers=hub.pin).status_code == 429
    assert hub.get("/api/m/teacher/me", headers={"X-Teacher-Pin": teacher_pin(cfg.data)}).status_code == 200


def test_online_only_an_admin_row_and_never_without_access(online, rsa, cfg):
    as_admin(online, rsa, "teacher@example.org", role="teacher")
    assert online.get("/api/m/admin/me", headers=online.pin).json()["error"] == "admins only"
    as_admin(online, rsa)
    me = get(online, "/me")
    assert me == {"label": "Admin A", "via": "access", "home": "online", "staff": True}
    cfg2 = copy.copy(cfg)
    cfg2.access_team = cfg2.access_aud = cfg2.staff_pepper = None
    with TestClient(create_app(cfg2)) as c:                       # no Access settings: there is no admin panel
        assert c.get("/api/m/admin/me").status_code == 404
        assert c.get("/api/m/admin/cohorts").status_code == 404


# cohorts

def test_cohorts_are_counted_never_listed_by_learner(hub):
    hub.post("/api/join", json={"band": "s1", "lang": "en", "picture": "key"})
    rows = {c["id"]: c for c in get(hub, "/cohorts")["cohorts"]}
    assert set(rows) == {HUB, STAGING, OPEN}
    assert rows[HUB]["learners"] == 1 and rows[HUB]["own"] and rows[HUB]["ai"] and rows[HUB]["day"]
    assert set(rows[HUB]) == {"id", "label", "langs", "bands", "learners", "ai", "day", "own"}


@pytest.mark.parametrize("label", ["Girls class", "boys 2", "Women of Mazar", "Out of school group", "Banned A",
                                   "دختران مزار", "صنف زنان", "نجونې"])
def test_a_label_that_says_who_is_in_the_class_is_refused(hub, label):
    r = hub.post("/api/m/admin/cohorts", headers=hub.pin, json={"label": label, "langs": ["prs"], "bands": ["s1"]})
    assert r.status_code == 422 and "who is in the class" in r.json()["error"]


def test_a_new_cohort_has_a_random_id_every_module_but_recall_and_cert_off_and_its_code_shown_once(hub, cfg):
    out = post(hub, "/cohorts", {"label": "Mazar class", "langs": ["prs", "ps"], "bands": ["s1", "p1"]})
    cid, code = out["id"], out["code"]
    assert flags.COHORT_ID.match(cid) and learners.normal_code(code)
    c = get(hub, f"/cohorts/{cid}")
    assert c["bands"] == ["p1", "s1"] and c["settings"]["maturity"] == ["pilot", "stable"] and c["learners"] == 0
    # spaced review (C4.1) and certificates (C4.2) are switched on in a new cohort; they show only once `lessons` is on
    assert [m["id"] for m in c["modules"] if m["enabled"]] == ["cert", "recall"]
    assert not any(m["on"] for m in c["modules"])
    assert code not in str(c) and code.replace("-", "") not in str(c)
    db = sqlite3.connect(cfg.data / "hub.db")
    dump = "\n".join(db.iterdump())
    db.close()
    assert code.replace("-", "") not in dump and learners.code_hash(learners.normal_code(code)) in dump
    joined = hub.post("/api/join", json={"cohort_code": code, "band": "s1", "lang": "prs", "picture": "key"})
    assert joined.status_code == 200 and joined.json()["cohort"]["id"] == cid
    whats = [x["what"] for x in get(hub, f"/log?cohort={cid}")["log"]]
    assert "cohort.new" in whats and "cohort.code" in whats
    post(hub, "/cohorts", {"label": "mazar CLASS", "langs": ["prs"], "bands": ["p1"]}, status=409)    # one label, one cohort


def test_a_new_code_stops_the_old_one_and_the_cards_need_the_code(hub):
    old = post(hub, f"/cohorts/{STAGING}/code")["code"]
    new = post(hub, f"/cohorts/{STAGING}/code")
    assert new["url"].endswith("/?join=" + learners.normal_code(new["code"]))
    join = lambda code: hub.post("/api/join", json={"cohort_code": code, "band": "s1", "lang": "en",  # noqa: E731
                                                    "picture": "key"}).status_code
    assert join(old) == 404 and join(new["code"]) == 200
    cards = post(hub, f"/cohorts/{STAGING}/cards", {"code": new["code"]})
    assert cards["svg"].startswith("<svg") and cards["url"].endswith(learners.normal_code(new["code"]))
    post(hub, f"/cohorts/{HUB}/cards", {"code": new["code"]}, status=404)          # another cohort's code


# module switches

def test_a_risky_module_needs_a_confirm_and_a_missing_dependency_turns_on_both(hub):
    post(hub, f"/cohorts/{HUB}/flags/ask", {"enabled": False})
    post(hub, f"/cohorts/{HUB}/flags/homework", {"enabled": False})
    r = post(hub, f"/cohorts/{HUB}/flags/homework", {"enabled": True}, status=409)
    assert set(r["need"]) == {"both", "confirm"} and r["missing"] == ["ask"]
    assert {x["id"] for x in r["risks"]} == {"ask", "homework"} and all(x["sentence"] for x in r["risks"])
    post(hub, f"/cohorts/{HUB}/flags/homework", {"enabled": True, "confirm": True}, status=409)
    out = post(hub, f"/cohorts/{HUB}/flags/homework", {"enabled": True, "confirm": True, "both": True})
    assert out["turned_on"] == ["ask", "homework"]
    mods = {m["id"]: m for m in get(hub, f"/cohorts/{HUB}")["modules"]}
    assert mods["homework"]["enabled"] and mods["ask"]["enabled"] and mods["homework"]["risk"] == "medium"
    assert mods["homework"]["changed_by"] == "admin:hub"
    # a module without risk needs no confirm: the plan flag off and on again
    post(hub, f"/cohorts/{OPEN}/flags/timetable", {"enabled": False})
    assert post(hub, f"/cohorts/{OPEN}/flags/timetable", {"enabled": True})["turned_on"] == ["timetable"]
    post(hub, f"/cohorts/{OPEN}/flags/plan", {"enabled": False})
    assert post(hub, f"/cohorts/{OPEN}/flags/plan", {"enabled": True, "confirm": True})["ok"]
    log = get(hub, f"/log?cohort={HUB}")["log"]
    assert any(x["what"] == "module" and x["detail"].startswith("homework on") and x["by"] == "admin:hub" for x in log)


def test_open_keeps_homework_help_off_in_2027_and_photo_behind_the_pilots_gate(hub, tmp_path):
    # C4.9: ask and homework are refused in open; photo waits for cohorts/gates/photo-open.json to pass
    for mid in ("ask", "homework"):
        r = post(hub, f"/cohorts/{OPEN}/flags/{mid}", {"enabled": True, "confirm": True, "both": True}, status=409)
        assert "off in open in 2027" in r["error"]
    r = post(hub, f"/cohorts/{OPEN}/flags/photo", {"enabled": True, "confirm": True, "both": True}, status=409)
    assert "four numbers" in r["error"]
    c = get(hub, f"/cohorts/{OPEN}")
    mods = {m["id"]: m for m in c["modules"]}
    assert (mods["photo"]["lock"], mods["homework"]["lock"], mods["ask"]["lock"]) == ("gate", "open", "open")
    assert mods["photo"]["settings"] == {"per_day": 5} and c["gate"]["open"] is False and c["gate"]["problems"]
    assert [w["code"] for w in c["gate"]["why"]] == ["missing"]       # the page words it in the reader's language
    assert get(hub, f"/cohorts/{HUB}")["gate"] is None
    assert {m["id"]: m for m in get(hub, f"/cohorts/{HUB}")["modules"]}["photo"]["settings"] == {"per_day": 10}
    hub.hub.cfg.cohorts = tmp_path / "cohorts"            # a copy: the repository's gate file is the pilot's to write
    shutil.copytree(cfg_cohorts := Config().cohorts, hub.hub.cfg.cohorts)
    assert not (cfg_cohorts / "gates" / "photo-open.json").exists()
    gate = hub.hub.cfg.cohorts / "gates" / "photo-open.json"
    gate.parent.mkdir(parents=True, exist_ok=True)
    nums = {"report": "pilot report", "fix": {"prs": {"sheets": 240, "cells": 3000, "fixed": 150}}, "leaks": 0,
            "tokens_per_mark": 1400, "d7": "decided"}
    gate.write_text(json.dumps(nums), encoding="utf-8")
    c = get(hub, f"/cohorts/{OPEN}")
    assert c["gate"] == {"open": True, "problems": [], "why": [], "tokens_per_mark": 1400}
    assert post(hub, f"/cohorts/{OPEN}/flags/photo", {"enabled": True, "confirm": True, "both": True})["ok"]


def test_the_teachers_hold_and_lock_codes_are_settings_checked_against_the_schema(hub):
    out = post(hub, f"/cohorts/{HUB}/flags/teacher", {"enabled": True, "settings": {"hold": True, "lock_codes": False}})
    assert out["ok"]
    t = next(m for m in get(hub, f"/cohorts/{HUB}")["modules"] if m["id"] == "teacher")
    assert t["settings"] == {"hold": True, "lock_codes": False} and t["schema"]["hold"]["type"] == "bool"
    me = hub.get("/api/m/teacher/me", headers={"X-Teacher-Pin": teacher_pin(hub.cfg.data)}).json()
    assert me["hold"] is True and me["lock_codes"] is False
    for bad in ({"hold": "yes"}, {"colour": 1}):
        r = hub.post(f"/api/m/admin/cohorts/{HUB}/flags/teacher", headers=hub.pin, json={"enabled": True,
                                                                                          "settings": bad})
        assert r.status_code == 422


def test_drafts_only_where_the_cohort_takes_them_and_blocked_only_with_paid_human_moderation(hub):
    hub.hub.modules["sketch"] = {"id": "sketch", "version": "0.1.0", "maturity": "draft", "depends": [],
                                 "bands": ["s1"], "slots": [], "capabilities": [], "settings": {}, "needs": [],
                                 "offline": "no"}
    hub.hub.modules["pals"] = {"id": "pals", "version": "0.1.0", "maturity": "pilot", "depends": [],
                               "bands": ["s1"], "slots": [], "capabilities": ["child.contact"], "settings": {},
                               "needs": [], "offline": "no"}
    assert "draft modules" in post(hub, f"/cohorts/{HUB}/flags/sketch", {"enabled": True}, status=409)["error"]
    assert post(hub, f"/cohorts/{STAGING}/flags/sketch", {"enabled": True})["ok"]          # staging takes drafts
    mods = {m["id"]: m for m in get(hub, f"/cohorts/{HUB}")["modules"]}
    assert mods["sketch"]["lock"] == "maturity" and mods["pals"]["lock"] == "moderation"
    assert mods["pals"]["risk"] == "blocked"
    r = post(hub, f"/cohorts/{HUB}/flags/pals", {"enabled": True, "confirm": True}, status=403)
    assert "paid human moderation" in r["error"]
    # even a flag written behind the panel's back keeps it off until moderation is paid-human
    hub.hub.store.sync.set_flag(HUB, "pals", enabled=True, changed_by="seed")
    assert "pals" not in [m["id"] for m in hub.get(f"/api/hello?cohort={HUB}").json()["modules"]]
    post(hub, f"/cohorts/{HUB}/settings", {"settings": {"moderation": "paid-human"}})
    assert post(hub, f"/cohorts/{HUB}/flags/pals", {"enabled": True, "confirm": True})["ok"]
    assert "pals" in [m["id"] for m in hub.get(f"/api/hello?cohort={HUB}").json()["modules"]]


# kill switches and settings

def test_ai_off_reaches_phones_and_the_gateway_and_the_school_day_goes_with_its_bells(hub):
    assert hub.get(f"/api/hello?cohort={HUB}").json()["ai"]["on"] is True
    post(hub, f"/cohorts/{HUB}/kill", {"switch": "ai", "on": False})
    assert hub.get(f"/api/hello?cohort={HUB}").json()["ai"]["on"] is False
    assert hub.get(f"/api/hello?cohort={STAGING}").json()["ai"]["on"] is True
    r = asyncio.run(hub.hub.gateway.call("explain", [{"role": "user", "content": "Why is the sky blue?"}],
                                         module="ask", lang="en", cohort=HUB))
    assert r.why == "off" and not hub.fake.sent
    assert hub.get(f"/api/m/timetable?band=s1&cohort={HUB}").status_code == 200
    post(hub, f"/cohorts/{HUB}/kill", {"switch": "day", "on": False, "all": True})
    for cid in (HUB, STAGING, OPEN):
        assert hub.get(f"/api/m/timetable?band=s1&cohort={cid}").status_code == 404
    post(hub, f"/cohorts/{HUB}/kill", {"switch": "ai", "on": True})
    assert hub.get(f"/api/hello?cohort={HUB}").json()["ai"]["on"] is True
    assert "ai" not in get(hub, f"/cohorts/{HUB}")["settings"]                       # unset counts as on
    details = [x["detail"] for x in get(hub, f"/log?cohort={HUB}")["log"] if x["what"] == "cohort.kill"]
    assert details[:3] == ["AI on", "school day and bells off", "AI off"]


def test_settings_are_checked_and_the_log_says_what_changed(hub):
    post(hub, f"/cohorts/{HUB}/settings", {"settings": {"ai_budget": 3}}, status=200)
    out = post(hub, f"/cohorts/{HUB}/settings", {"settings": {"ai_budget": 500000, "moderation": "teacher"}})
    assert out["changed"] == "ai_budget 3 -> 500000; moderation unset -> teacher"
    for bad in ({"ai_budget": -1}, {"moderation": "parents"}, {"colour": "red"}, {"maturity": ["beta"]}):
        r = hub.post(f"/api/m/admin/cohorts/{HUB}/settings", headers=hub.pin, json={"settings": bad})
        assert r.status_code == 422, bad
    assert get(hub, f"/cohorts/{HUB}")["cap"] == 500000
    assert hub.hub.gateway.cap(hub.hub.store.sync.cohort(HUB)["settings"]) == 500000
    post(hub, f"/cohorts/{HUB}/settings", {"settings": {"ai_budget": None}})
    assert get(hub, f"/cohorts/{HUB}")["cap"] == hub.hub.gateway.budget
    lines = [x["detail"] for x in get(hub, "/log")["log"] if x["what"] == "cohort.settings"]
    assert lines[0] == "ai_budget 500000 -> unset"


def test_the_timetable_editor_saves_a_checked_template_that_phones_then_fetch(hub):
    c = get(hub, f"/cohorts/{HUB}")
    tt = c["timetable"]
    assert tt["days"][0] == "sat" and "period" in tt["kinds"] and set(tt["bands"]) == {"p1", "p2", "s1", "s2"}
    own = copy.deepcopy(tt["default"])
    own["days"] = ["sat", "sun", "mon", "tue", "wed"]
    own["bands"]["p1"]["start"] = "07:30"
    del own["bands"]["s2"]
    out = post(hub, f"/cohorts/{HUB}/settings", {"settings": {"timetable": own}})
    assert out["changed"].startswith("timetable default -> template ")
    post(hub, f"/cohorts/{HUB}/kill", {"switch": "day", "on": True})
    day = hub.get(f"/api/m/timetable?cohort={HUB}&band=p1")
    assert day.status_code == 200 and day.json()["timetable"]["start"] == "07:30"        # the phone's next fetch
    assert hub.get(f"/api/m/timetable?cohort={HUB}&band=s2").status_code == 404           # s2 has no school day now
    bad = copy.deepcopy(own)
    bad["bands"]["p1"]["blocks"] = [{"kind": "break", "min": 15}]
    r = hub.post(f"/api/m/admin/cohorts/{HUB}/settings", headers=hub.pin, json={"settings": {"timetable": bad}})
    assert r.status_code == 422 and "at least one period" in r.text
    post(hub, f"/cohorts/{HUB}/settings", {"settings": {"timetable": "default"}})
    assert get(hub, f"/cohorts/{HUB}")["settings"]["timetable"] == "default"


# content

def test_a_pack_is_published_only_when_every_lesson_is_signed_and_rolls_back(hub, monkeypatch):
    d = get(hub, "/content")
    pack = next(p for p in d["packs"] if p["id"] == "starter")
    assert pack["lessons"] and not pack["publishable"] and pack["problems"]
    assert all(set(v) == {"signed", "of"} for v in pack["roles"].values())
    r = post(hub, f"/content/{pack['id']}/publish", {"cohort": STAGING}, status=409)
    assert r["problems"]
    monkeypatch.setattr(admin_mod.packs, "release_problems", lambda *a: [])
    out = post(hub, f"/content/{pack['id']}/publish", {"cohort": STAGING})
    assert out["short"] == pack["hash"][7:15]
    post(hub, f"/content/{pack['id']}/rollback", {"cohort": STAGING}, status=409)        # nothing earlier
    hub.hub.store.sync.add_release(pack=pack["id"], version="0.0.9", content_hash="sha256:" + "0" * 64,
                                   cohort=STAGING, released_by="admin")
    hub.hub.store.sync.add_release(pack=pack["id"], version=pack["version"], content_hash=pack["hash"],
                                   cohort=STAGING, released_by="admin")
    back = post(hub, f"/content/{pack['id']}/rollback", {"cohort": STAGING})
    assert back["version"] == "0.0.9" and back["current_files"] is False
    rel = next(p for p in get(hub, "/content")["packs"] if p["id"] == "starter")["releases"][STAGING]
    assert rel["version"] == "0.0.9" and rel["current"] is False
    whats = [x["what"] for x in get(hub, f"/log?cohort={STAGING}")["log"]]
    assert "release" in whats and "rollback" in whats


def test_the_review_notes_show_what_reviewers_asked_for(hub):
    lid = next(iter(hub.hub.library.lessons))
    s = hub.hub.store.sync
    s.add_review_note(lesson=lid, step=2, role="Dari reader", step_hash="sha256:a", status="change",
                      chips=["spelling"], text="the second word")
    s.add_review_note(lesson=lid, step=3, role="Dari reader", step_hash="sha256:b", status="change", chips=[],
                      text="old")
    s.add_review_note(lesson=lid, step=3, role="Dari reader", step_hash="sha256:b", status="ok", chips=[], text="")
    notes = get(hub, "/content")["notes"]
    assert [(n["step"], n["chips"], n["text"]) for n in notes] == [(2, ["spelling"], "the second word")]


# the wishlist

def test_the_wishlist_across_cohorts_is_marked_planned_or_not_for_qalam(hub):
    s = hub.hub.store.sync
    s.add_wish(cohort=HUB, band="s1", lang="en", wish="chemistry", wkey="chemistry")
    s.add_wish(cohort=STAGING, band="s2", lang="en", wish="Chemistry", wkey="chemistry")
    s.add_wish(cohort=OPEN, band="s1", lang="prs", wish="نجوم", wkey="نجوم")
    rows = {w["wkey"]: w for w in get(hub, "/wishes")["wishes"]}
    w = rows["chemistry"]
    assert w["count"] == 2 and w["bands"] == ["s1", "s2"] and w["cohorts"] == ["Staging", "Village hub"]
    assert w["status"] == "new" and set(w) == {"wkey", "text", "count", "bands", "langs", "cohorts", "first_day",
                                               "last_day", "status"}
    post(hub, "/wishes", {"wkey": "chemistry", "status": "planned"})
    post(hub, "/wishes", {"wkey": "نجوم", "status": "not_for_qalam"})
    post(hub, "/wishes", {"wkey": "nothing", "status": "planned"}, status=404)
    rows = {w["wkey"]: w["status"] for w in get(hub, "/wishes")["wishes"]}
    assert rows == {"chemistry": "planned", "نجوم": "not_for_qalam"}
    assert any(x["detail"] == "a wish marked not for qalam" for x in get(hub, "/log")["log"])


# spend and safety

def test_spend_per_cohort_and_day_with_a_warm_tag_at_80_percent(hub):
    day = admin_mod.days_back(1)[0]
    post(hub, f"/cohorts/{STAGING}/settings", {"settings": {"ai_budget": 1000}})
    s = hub.hub.store.sync
    s.add_ai_usage(day=day, cohort=STAGING, module="ask", purpose="explain", provider="fake", model="fake",
                   tokens=600, cost_micro=1200)
    s.add_ai_usage(day=day, cohort=STAGING, module="homework", purpose="hint", provider="fake", model="fake",
                   tokens=250, cost_micro=500, held=True)
    d = {c["id"]: c for c in get(hub, "/spend")["cohorts"]}
    st = d[STAGING]
    assert len(st["days"]) == 14 and st["days"][-1]["day"] == day
    assert st["today"] == {"day": day, "tokens": 850, "cost_micro": 1700, "calls": 2, "held": 1, "pct": 85,
                           "warn": True}
    assert st["by_purpose"] == {"explain": 1, "hint": 1} and st["cap"] == 1000
    assert d[HUB]["today"]["warn"] is False


def test_safety_counts_rules_hits_drops_disputes_and_the_oldest_held_item(hub):
    assert hub.post("/api/ask", json={"text": "پدرم مرا می‌زند", "lang": "prs"}).status_code == 200
    asyncio.run(hub.hub.record("safety.flag", "leak", cohort_id=HUB))
    tok = hub.post("/api/join", json={"band": "s1", "lang": "en", "picture": "key",
                                      "consent": {"kind": "self", "version": hub.hub.consent_version}}).json()["token"]
    from tutor_hub import events
    lid = next(l for l, x in hub.hub.library.lessons.items() if x.get("sheet"))
    assert hub.post("/api/events", headers={"X-Learner-Token": tok}, json={"events": [
        {"at": events.minute(), "verb": "check.dispute", "object": f"{lid}:2"}]}).status_code == 200
    hub.hub.store.sync.add_question(lang="en", subject=None, year=7, lesson_id=None, question="q", answer="a",
                                    source="ai", urgent=False, waiting=False, cohort=HUB, held=True)
    d = {c["id"]: c for c in get(hub, "/safety")["cohorts"]}[HUB]
    assert d["days"][-1]["distress"] == 1 and d["drops"] == {"leak": 1, "maths": 0}
    assert d["disputes"] == [{"item": f"{lid}:2", "n": 1}] and d["held"] == 1 and d["oldest_held_hours"] == 0
    assert "مرا" not in str(d)                                    # counts only: the words stay with the teacher


# staff

def test_staff_are_added_by_email_kept_as_a_hash_and_the_last_admin_stays(online, rsa, cfg):
    as_admin(online, rsa)
    out = post(online, "/staff", {"email": "Teacher.B@Example.org", "label": "Teacher B", "role": "teacher",
                                  "cohorts": [STAGING]})
    assert out == {"ok": True}
    rows = get(online, "/staff")
    assert {s["label"] for s in rows["staff"]} == {"Admin A", "Teacher B"} and "Dari reader" in rows["roles"]
    assert "example" not in str(rows).lower()
    db = sqlite3.connect(cfg.data / "hub.db")
    dump = "\n".join(db.iterdump()).lower()
    db.close()
    assert "example.org" not in dump and staff.id_hash(PEPPER, "teacher.b@example.org") in dump
    online.pin = {"Cf-Access-Jwt-Assertion": token(rsa, email="teacher.b@example.org"), "X-Qalam": "1"}
    assert online.get("/api/m/teacher/me", headers=online.pin).status_code == 200
    as_admin(online, rsa)
    for bad in ({"email": "nobody", "label": "X", "role": "teacher"}, {"email": "a@b.c", "label": "Girls teacher",
                                                                         "role": "teacher"},
                {"email": "a@b.c", "label": "X", "role": "boss"}, {"email": "a@b.c", "label": "X", "role": "teacher",
                                                                   "cohorts": ["nosuchcohort"]}):
        assert online.post("/api/m/admin/staff", headers=online.pin, json=bad).status_code == 422, bad
    ids = {s["label"]: s["id"] for s in get(online, "/staff")["staff"]}
    assert online.delete(f"/api/m/admin/staff/{ids['Admin A']}", headers=online.pin).status_code == 409
    assert online.delete(f"/api/m/admin/staff/{ids['Teacher B']}", headers=online.pin).status_code == 200
    log = get(online, "/log")["log"]
    assert [x["detail"] for x in log if x["what"].startswith("staff")] == ["Teacher B (teacher)",
                                                                            "Teacher B (teacher)"]
    assert all(x["by"] == "admin:Admin A" for x in log if x["what"].startswith("staff"))


def test_the_hub_has_no_staff_list(hub):
    assert hub.get("/api/m/admin/staff", headers=hub.pin).status_code == 409


def test_no_name_or_email_in_any_admin_answer(online, rsa):
    as_admin(online, rsa)
    for path in ("/me", "/cohorts", f"/cohorts/{STAGING}", "/content", "/wishes", "/spend", "/safety", "/staff",
                 "/log"):
        assert "example.org" not in online.get("/api/m/admin" + path, headers=online.pin).text.lower(), path
