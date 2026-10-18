"""Live audio classes (P30a, DESIGN-C6-SPECS.md C6.1): held off without the relay's secrets, locked by the secrets, the
consent text and the gate file; a learner's class from her token only; a one-time ticket; the teacher's routes for her
own class with `X-Qalam: 1`; the two learners' rule; the end; the retention; `hello.live`; at most 16 KB of body on
every live route; and the relay as a fake (tests/fakes/rtc.py) that never receives sound or a token. No network."""
import asyncio
import json
import shutil
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from tutor_hub import learners, staff, timetable
from tutor_hub.ai.fake import FakeProvider
from tutor_hub.mods import live as live_mod
from tutor_hub.rtc import Realtime, RtcError, munge_opus, no_video
from tutor_hub.server import create_app

from conftest import TUTOR, learner_of
from fakes.rtc import OFFER, FakeRTC
from test_review import AUD, PEPPER, STAGING, TEAM, jwk, rsa, token  # noqa: F401  (fixtures and helpers)

HUB = "d6co6etep6"
SECRETS = {"rtc_app": "app-1", "rtc_secret": "s-1", "rtc_turn_key": "k-1", "rtc_turn_secret": "t-1"}


def iso(t):
    return t.isoformat(timespec="seconds")


@pytest.fixture
def online(cfg, rsa, tmp_path):
    cfg.home, cfg.lacks, cfg.cohort = "online", ("printer", "pin"), STAGING
    cfg.access_team, cfg.access_aud, cfg.staff_pepper = TEAM, AUD, PEPPER
    cfg.ai_provider = "fake"
    shutil.copytree(TUTOR / "cohorts", tmp_path / "cohorts")
    cfg.cohorts = tmp_path / "cohorts"
    for k, v in SECRETS.items():
        setattr(cfg, k, v)
    with TestClient(create_app(cfg)) as c:
        c.hub = c.app.state.hub
        c.cfg = cfg

        async def keys(team):
            return [jwk(rsa)]
        c.hub.staff.fetcher = keys
        c.rtc = c.hub.rtc = FakeRTC(cfg)
        c.fake = c.hub.gateway.provider = FakeProvider()
        c.hub.store.sync.set_flag(STAGING, "live", enabled=True, settings={}, changed_by="admin")
        c.teacher = staff_of(c, rsa, "teacher@example.org", "teacher")
        c.admin = staff_of(c, rsa, "admin@example.org", "admin")
        yield c


def staff_of(c, rsa, email, role, cohorts=(STAGING,)):
    asyncio.run(c.hub.store.add_staff(id_hash=staff.id_hash(PEPPER, email), label=f"{role.title()} A", role=role,
                                      cohorts=list(cohorts), initials=""))
    return {"Cf-Access-Jwt-Assertion": token(rsa, email=email), "X-Qalam": "1"}


def start(c, subject="maths", status=200, headers=None):
    r = c.post("/api/m/teacher/live/start", headers=headers or c.teacher, json={"cohort": STAGING, "subject": subject})
    assert r.status_code == status, r.text
    return r.json()


def publish(c, sid):
    r = c.post(f"/api/m/teacher/live/{sid}/sdp", headers=c.teacher, json={"sdp": OFFER, "mid": "0"})
    assert r.status_code == 200, r.text
    return r.json()


def roster(c, sid):
    r = c.get(f"/api/m/teacher/live/{sid}/roster", headers=c.teacher)
    assert r.status_code == 200, r.text
    return r.json()


def join(c, sid, h):
    r = c.post(f"/api/m/live/{sid}/join", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def sql(c, query, args=()):
    s = c.hub.store.sync
    with s.lock:
        return [tuple(r) for r in s.db.execute(query, args)]


# held and locked

def test_live_is_held_without_the_relays_secrets_and_the_hub_never_lists_it(hub_client):
    hub = hub_client.hub
    hub.store.sync.set_flag(hub.cohort_id, "live", enabled=True, settings={}, changed_by="admin")
    assert "live" in hub.held()
    h = hub_client.get("/api/hello").json()
    assert "live" not in [m["id"] for m in h["modules"]] and h["live"] is None
    me = learner_of(hub_client, hub.cohort_id)
    assert hub_client.get("/api/m/live", headers=me).status_code == 404
    hub.cfg.rtc_app, hub.cfg.rtc_secret = "app", "secret"
    assert "live" not in hub.held()


def test_hello_live_is_null_while_off_and_names_the_open_class_while_on(online):
    assert online.get("/api/hello").json()["live"] is None
    sid = start(online)["id"]
    h = online.get("/api/hello").json()
    assert "live" in [m["id"] for m in h["modules"]]
    assert h["live"]["id"] == sid and h["live"]["subject"] == "maths" and h["live"]["since"]
    online.hub.store.sync.set_flag(STAGING, "live", enabled=False, settings={}, changed_by="admin")
    assert online.get("/api/hello").json()["live"] is None


def test_the_three_locks_refuse_the_switch_with_their_codes(online):
    hub, cfg = online.hub, online.cfg
    hub.store.sync.set_flag(STAGING, "live", enabled=False, settings={}, changed_by="admin")

    def lock():
        rows = online.get(f"/api/m/admin/cohorts/{STAGING}", headers=online.admin).json()["modules"]
        return next(m["lock"] for m in rows if m["id"] == "live")

    def switch():
        return online.post(f"/api/m/admin/cohorts/{STAGING}/flags/live", headers=online.admin,
                           json={"enabled": True, "confirm": True, "both": True})
    cfg.rtc_turn_secret = None
    assert lock() == "rtc" and switch().json()["code"] == "locked" and switch().status_code == 409
    me = online.get("/api/m/admin/me", headers=online.admin).json()
    assert me["rtc"] == {"app": True, "secret": True, "turn_key": True, "turn_secret": False}
    assert "s-1" not in json.dumps(me) and "app-1" not in json.dumps(me)
    cfg.rtc_turn_secret = "t-1"
    assert lock() == "consent" and switch().status_code == 409                 # no consent text names live classes
    for key in [k for k in hub.consent_texts if k[1] == hub.consent_version]:
        hub.consent_texts[key] = dict(hub.consent_texts[key], live=True)
    assert hub.consent_names_live()
    cfg.release = True
    assert lock() == "gate" and switch().status_code == 409
    gate = cfg.cohorts / "gates" / "live.json"
    gate.parent.mkdir(exist_ok=True)
    gate.write_text(json.dumps({"d9": "decided: yes, for adult classes first"}))
    assert lock() == "gate"                                                    # the opinion's date is missing
    gate.write_text(json.dumps({"d9": "decided: yes", "opinion": "2027-07-20"}))
    assert lock() is None and switch().status_code == 200
    cfg.release = False
    gate.unlink()
    assert lock() is None                                                      # staging needs no gate file


def test_live_is_off_in_every_seed_and_no_migration_seeds_it():
    for name in ("hub", "staging", "open"):
        seed = json.loads((TUTOR / "cohorts" / f"{name}.json").read_text())
        assert not (seed.get("modules") or {}).get("live")
    for f in (TUTOR / "migrations").glob("*.sql"):
        assert "'live'" not in f.read_text()


# the learner

def test_a_learner_joins_her_own_class_only_with_her_token_and_consent(online):
    sid = start(online)["id"]
    assert online.post(f"/api/m/live/{sid}/join").status_code == 401
    assert online.post(f"/api/m/live/{sid}/join", headers=learner_of(online, STAGING, consent=False)).status_code == 403
    other = learner_of(online, HUB)
    online.hub.store.sync.set_flag(HUB, "live", enabled=True, settings={}, changed_by="admin")
    for f in ("lessons", "timetable"):
        online.hub.store.sync.set_flag(HUB, f, enabled=True, settings={}, changed_by="admin")
    # another class's learner: 404, whatever ?cohort= says (C5 H1)
    assert online.post(f"/api/m/live/{sid}/join?cohort={STAGING}", headers=other).status_code == 404
    assert online.get(f"/api/m/live?cohort={STAGING}", headers=other).json() == {}
    me = learner_of(online, STAGING)
    j = join(online, sid, me)
    assert len(j["ticket"]) == 32 and j["ice"] and j["state"]["audio"] == "off" and j["v"] == 1
    assert online.get("/api/m/live", headers=me).json()["id"] == sid


def test_a_ticket_works_once_and_dies_at_sixty_seconds(online):
    sid = start(online)["id"]
    me = learner_of(online, STAGING)
    t = join(online, sid, me)["ticket"]
    r = online.post(f"/api/m/live/{sid}/sdp", headers=me, json={"ticket": t})
    assert r.status_code == 200 and r.json()["renegotiate"] is False            # the sound is off: nothing pulled
    assert online.post(f"/api/m/live/{sid}/sdp", headers=me, json={"ticket": t}).status_code == 403
    t = join(online, sid, me)["ticket"]
    sql(online, "UPDATE live_present SET ticket_at=?", (iso(datetime.now(timezone.utc) - timedelta(seconds=61)),))
    assert online.post(f"/api/m/live/{sid}/sdp", headers=me, json={"ticket": t}).status_code == 403
    assert all(x[0] != "pull" for x in online.rtc.calls)


def test_the_join_limit_and_a_closed_class(online):
    sid = start(online)["id"]
    me = learner_of(online, STAGING)
    for _ in range(10):
        join(online, sid, me)
    assert online.post(f"/api/m/live/{sid}/join", headers=me).status_code == 429
    online.post(f"/api/m/teacher/live/{sid}/end", headers=online.teacher)
    other = learner_of(online, STAGING)
    assert online.post(f"/api/m/live/{sid}/join", headers=other).status_code == 410
    assert online.get(f"/api/m/live/{sid}/state", headers=other).json()["over"] is True


def test_a_hand_with_a_reason_reaches_the_teacher_and_is_lowered(online):
    sid = start(online)["id"]
    a, b = learner_of(online, STAGING), learner_of(online, STAGING)
    join(online, sid, a), join(online, sid, b)
    assert online.post(f"/api/m/live/{sid}/hand", headers=a, json={"reason": 4}).status_code == 422
    assert online.post(f"/api/m/live/{sid}/hand", headers=a, json={"reason": "I am Karim"}).status_code == 422
    assert online.post(f"/api/m/live/{sid}/hand", headers=a, json={"reason": 3}).json() == {"hand": True}
    assert online.post(f"/api/m/live/{sid}/hand", headers=b, json={"reason": 1}).json() == {"hand": True}
    hands = roster(online, sid)["hands"]
    assert [h["reason"] for h in hands] == [3, 1] and all(set(h) == {"alias", "picture", "number", "reason", "since"}
                                                          for h in hands)
    r = online.post(f"/api/m/teacher/live/{sid}/lower", headers=online.teacher, json={"alias": hands[0]["alias"]})
    assert r.json() == {"lowered": 1} and [h["reason"] for h in roster(online, sid)["hands"]] == [1]
    assert online.post(f"/api/m/teacher/live/{sid}/lower", headers=online.teacher, json={"all": True}).json() == \
        {"lowered": 1}
    assert online.post(f"/api/m/live/{sid}/hand", headers=b, json={"reason": None}).json() == {"hand": False}


# the teacher

def test_the_teachers_routes_need_the_header_and_her_own_class(online, rsa):
    no_header = {k: v for k, v in online.teacher.items() if k != "X-Qalam"}
    r = online.post("/api/m/teacher/live/start", headers=no_header, json={"cohort": STAGING, "subject": "maths"})
    assert r.status_code == 403
    stranger = staff_of(online, rsa, "other@example.org", "teacher", cohorts=(HUB,))
    r = online.post("/api/m/teacher/live/start", headers=stranger, json={"cohort": STAGING, "subject": "maths"})
    assert r.status_code == 403 and r.json()["code"] == "not_your_class"
    sid = start(online)["id"]
    for path in ("roster",):
        assert online.get(f"/api/m/teacher/live/{sid}/{path}", headers=stranger).json()["code"] == "not_your_class"
    for path in ("sdp", "board", "lower", "end"):
        r = online.post(f"/api/m/teacher/live/{sid}/{path}", headers=stranger, json={})
        assert r.json().get("code") == "not_your_class", path
    assert online.get("/api/m/teacher/live?cohort=" + STAGING, headers=online.teacher).json()["open"]["id"] == sid
    assert online.get("/api/m/teacher/me?cohort=" + STAGING, headers=online.teacher).json()["live"] is True   # the Live tab
    reviewer = staff_of(online, rsa, "reviewer@example.org", "Dari reader")
    assert online.post("/api/m/teacher/live/start", headers=reviewer,
                       json={"cohort": STAGING, "subject": "maths"}).status_code == 403


def test_start_refuses_a_second_open_class_the_days_third_the_months_cap_and_an_unknown_subject(online):
    assert online.post("/api/m/teacher/live/start", headers=online.teacher,
                       json={"cohort": STAGING, "subject": "auto"}).status_code == 422
    assert online.post("/api/m/teacher/live/start", headers=online.teacher,
                       json={"cohort": STAGING, "subject": "chemistry"}).status_code == 422
    first = start(online, "class")
    assert start(online, status=409)["code"] == "live_open"
    online.post(f"/api/m/teacher/live/{first['id']}/end", headers=online.teacher)
    second = start(online)
    online.post(f"/api/m/teacher/live/{second['id']}/end", headers=online.teacher)
    assert start(online, status=429)["code"] == "budget"                      # per_day 2
    online.hub.store.sync.set_flag(STAGING, "live", enabled=True, settings={"per_day": 6}, changed_by="admin")
    sql(online, "UPDATE live_sessions SET listener_min=?", (2_000_000,))     # 480 GB a session: 960 GB > 900
    assert start(online, status=409)["code"] == "cap"
    online.cfg.rtc_gb_month = 2000
    assert start(online)["id"]
    status = online.get("/api/m/teacher/live?cohort=" + STAGING, headers=online.teacher).json()
    assert status["today"] == 3 and status["per_day"] == 6 and status["max_minutes"] == 45


def test_the_two_learners_rule_and_its_grace(online):
    sid = start(online)["id"]
    a, b = learner_of(online, STAGING), learner_of(online, STAGING)
    join(online, sid, a)
    publish(online, sid)
    r = roster(online, sid)
    assert r["here"] == 1 and r["audio"] == "off"                               # one learner: nothing relayed
    v0 = r["v"]
    join(online, sid, b)
    r = roster(online, sid)
    assert r["here"] == 2 and r["audio"] == "on" and r["v"] == v0 + 1
    st = online.get(f"/api/m/live/{sid}/state?v={v0}", headers=a).json()
    assert st["audio"] == "on" and st["pub"] == 1 and st["over"] is False
    assert online.get(f"/api/m/live/{sid}/state?v={st['v']}", headers=a).status_code == 204
    # now a pull is made for a fresh ticket, and her browser's answer goes to her own relay session
    t = join(online, sid, a)["ticket"]
    p = online.post(f"/api/m/live/{sid}/sdp", headers=a, json={"ticket": t}).json()
    assert p["renegotiate"] is True and p["type"] == "offer" and p["sdp"].startswith("v=0")
    assert online.post(f"/api/m/live/{sid}/answer", headers=a, json={"sdp": OFFER}).json() == {"ok": True}
    pull = [x for x in online.rtc.calls if x[0] == "pull"][-1]
    teacher_sfu = online.hub.store.sync.live_session(sid)["state"]["rtc"]["sfu"]
    assert pull[2] == teacher_sfu and pull[3] == "mic"
    # one learner goes quiet: the sound stays two minutes, then stops
    old = iso(datetime.now(timezone.utc) - timedelta(seconds=40))
    sql(online, "UPDATE live_present SET seen_at=? WHERE token_hash=?", (old, learners.token_hash(b["X-Learner-Token"])))
    r = roster(online, sid)
    assert r["here"] == 1 and r["audio"] == "on"
    s = online.hub.store.sync.live_session(sid)
    st = dict(s["state"], low_since=iso(datetime.now(timezone.utc) - timedelta(seconds=121)))
    online.hub.store.sync.live_update(sid, state=st)
    r = roster(online, sid)
    assert r["audio"] == "off" and r["v"] > v0 + 1


def test_the_teacher_publishes_sound_only_at_32_kbps_and_the_relay_never_sees_a_token(online):
    sid = start(online)["id"]
    video = OFFER + "m=video 9 UDP/TLS/RTP/SAVPF 96\r\n"
    assert online.post(f"/api/m/teacher/live/{sid}/sdp", headers=online.teacher,
                       json={"sdp": video, "mid": "0"}).status_code == 422
    answer = publish(online, sid)["sdp"]
    assert "maxaveragebitrate=32000" in answer and "stereo=0" in answer
    me = learner_of(online, STAGING)
    join(online, sid, me)
    online.post(f"/api/m/live/{sid}/sdp", headers=me, json={"ticket": join(online, sid, me)["ticket"]})
    sent = online.rtc.sent()
    tok = me["X-Learner-Token"]
    assert tok not in sent and learners.token_hash(tok) not in sent
    assert all(x[0] in ("ice", "new_session", "publish", "pull", "renegotiate") for x in online.rtc.calls)
    assert online.fake.sent == []                                              # no AI anywhere near a class


def test_the_board_shows_a_lesson_step_and_clears(online):
    sid = start(online)["id"]
    lesson = next(iter(online.hub.library.lessons))
    bad = online.post(f"/api/m/teacher/live/{sid}/board", headers=online.teacher, json={"lesson": lesson, "step": 999})
    assert bad.status_code == 422
    r = online.post(f"/api/m/teacher/live/{sid}/board", headers=online.teacher, json={"lesson": lesson, "step": 0})
    assert r.json()["board"] == {"lesson": lesson, "step": 0}
    me = learner_of(online, STAGING)
    join(online, sid, me)
    assert online.get(f"/api/m/live/{sid}/state", headers=me).json()["board"] == {"lesson": lesson, "step": 0}
    assert online.post(f"/api/m/teacher/live/{sid}/board", headers=online.teacher, json={}).json()["board"] is None


def test_the_end_deletes_the_room_and_blanks_the_state(online):
    sid = start(online)["id"]
    a, b = learner_of(online, STAGING), learner_of(online, STAGING)
    join(online, sid, a), join(online, sid, b)
    publish(online, sid)
    roster(online, sid)
    online.post(f"/api/m/live/{sid}/leave", headers=a)
    r = online.post(f"/api/m/teacher/live/{sid}/end", headers=online.teacher).json()
    assert r["over"] is True and r["subject"] == "maths" and r["peak"] == 2
    assert sql(online, "SELECT * FROM live_present") == []
    s = online.hub.store.sync.live_session(sid)
    assert s["state"] == {} and s["ended_at"] and s["host"] == "teacher:Teacher A"
    assert roster(online, sid)["over"] is True
    assert online.get(f"/api/m/live/{sid}/state", headers=b).json()["over"] is True
    cols = [c[1] for c in sql(online, "PRAGMA table_info(live_sessions)")] + \
        [c[1] for c in sql(online, "PRAGMA table_info(live_present)")]
    assert not any(w in c for c in cols for w in ("name", "sex", "girl", "email", "phone"))


def test_a_class_whose_teacher_went_quiet_or_ran_over_is_ended(online):
    sid = start(online)["id"]
    me = learner_of(online, STAGING)
    join(online, sid, me)
    sql(online, "UPDATE live_sessions SET seen_at=?", (iso(datetime.now(timezone.utc) - timedelta(minutes=11)),))
    assert online.get("/api/m/live", headers=me).json() == {}
    assert online.hub.store.sync.live_session(sid)["ended_at"] and sql(online, "SELECT * FROM live_present") == []
    sid = start(online)["id"]
    sql(online, "UPDATE live_sessions SET started_at=? WHERE id=?",
        (iso(datetime.now(timezone.utc) - timedelta(minutes=47)), sid))
    assert roster(online, sid)["over"] is True                                # 45 minutes and a minute's grace


def test_no_live_route_reads_a_body_over_16_kb(online):
    sid = start(online)["id"]
    me = learner_of(online, STAGING)
    big = json.dumps({"sdp": "v=0" + "x" * (16 * 1024)})
    posts = [f"/api/m/live/{sid}/{p}" for p in ("join", "sdp", "answer", "hand", "leave", "speak")] + \
        ["/api/m/teacher/live/start"] + [f"/api/m/teacher/live/{sid}/{p}"
                                         for p in ("sdp", "board", "lower", "end", "floor", "listen", "answer")]
    for path in posts:
        h = dict(me if "/teacher/" not in path else online.teacher, **{"content-type": "application/json"})
        assert online.post(path, headers=h, content=big).status_code == 413, path
    # since P30b (C6.4) the floor and speak routes answer; the floor tests below say whom they refuse
    assert online.post(f"/api/m/live/{sid}/speak", headers=me, json={}).status_code == 403        # a child: never
    assert online.post(f"/api/m/teacher/live/{sid}/floor", headers=online.teacher, json={}).json()["floor"] is None


# the floor (P30b, C6.4): an adult in an adult-only class, given the floor, speaks for at most 90 seconds

def adults_only(c, floor=True, consent=True):
    """STAGING made a class of adults only, its `floor` setting on, under a consent text naming live classes."""
    sql(c, "UPDATE cohorts SET bands=? WHERE id=?", (json.dumps(["ad"]), STAGING))
    c.hub.store.sync.set_flag(STAGING, "live", enabled=True, settings={"floor": floor, "per_day": 6},
                                 changed_by="admin")
    if consent:
        for key in [k for k in c.hub.consent_texts if k[1] == c.hub.consent_version]:
            c.hub.consent_texts[key] = dict(c.hub.consent_texts[key], live=True)


def room(c, n=2, band="ad"):
    """An open class with the teacher's sound on and `n` learners in the room."""
    sid = start(c)["id"]
    publish(c, sid)
    people = [learner_of(c, STAGING, band=band) for _ in range(n)]
    for p in people:
        join(c, sid, p)
    assert roster(c, sid)["audio"] == ("on" if n >= 2 else "off")
    return sid, people


def alias(c, h):
    row = c.hub.store.sync.learner(learners.token_hash(h["X-Learner-Token"]))
    return f"{row['picture']}-{row['number']}"


def give(c, sid, who, status=200):
    r = c.post(f"/api/m/teacher/live/{sid}/floor", headers=c.teacher, json={"alias": alias(c, who)})
    assert r.status_code == status, r.text
    return r.json()


def speak(c, sid, who, status=200):
    t = join(c, sid, who)["ticket"]
    r = c.post(f"/api/m/live/{sid}/speak", headers=who, json={"ticket": t, "sdp": OFFER, "mid": "0"})
    assert r.status_code == status, r.text
    return r.json()


def test_the_floor_goes_to_one_adult_and_her_voice_to_the_teacher_and_the_others(online):
    adults_only(online)
    sid, (a, b) = room(online)
    assert online.get("/api/m/teacher/live", headers=online.teacher).json()["floor"] is True
    f = give(online, sid, a)["floor"]
    assert f["alias"] == alias(online, a) and f["on"] is False
    until = datetime.fromisoformat(f["until"]) - datetime.now(timezone.utc)
    assert timedelta(seconds=85) < until <= timedelta(seconds=90)
    # her phone knows it is hers; the others see only that someone has the floor, never who
    sa = online.get(f"/api/m/live/{sid}/state", headers=a).json()
    sb = online.get(f"/api/m/live/{sid}/state", headers=b).json()
    assert sa["floor_mine"] is True and sb["floor_mine"] is False
    assert set(sb["floor"]) == {"until", "on"} and alias(online, a) not in json.dumps(sb)
    assert give(online, sid, b, 409)["code"] == "floor_held"                         # one floor at a time
    speak(online, sid, b, 403)                                                       # not hers
    pub0 = online.hub.store.sync.live_session(sid)["state"]["rtc"]["pub"]
    r = speak(online, sid, a)
    assert "maxaveragebitrate=32000" in r["sdp"] and r["until"] == f["until"]
    voice = [x for x in online.rtc.calls if x[0] == "publish"][-1]
    assert voice[3] == "0" and voice[4] == "voice"
    st = online.hub.store.sync.live_session(sid)["state"]
    assert st["rtc"]["pub"] == pub0 + 1 and st["floor"]["published"] is True       # the phones pull again
    # the others pull the teacher's mic and her voice; she never pulls her own
    online.post(f"/api/m/live/{sid}/sdp", headers=b, json={"ticket": join(online, sid, b)["ticket"]})
    many = [x for x in online.rtc.calls if x[0] == "pull_many"][-1]
    assert many[2] == ((st["rtc"]["sfu"], "mic"), (st["floor"]["sfu"], "voice"))
    n = len([x for x in online.rtc.calls if x[0] == "pull_many"])
    online.post(f"/api/m/live/{sid}/sdp", headers=a, json={"ticket": join(online, sid, a)["ticket"]})
    assert len([x for x in online.rtc.calls if x[0] == "pull_many"]) == n
    assert [x for x in online.rtc.calls if x[0] == "pull"][-1][3] == "mic"
    # the teacher hears her through a relay session of the page's own
    p = online.post(f"/api/m/teacher/live/{sid}/listen", headers=online.teacher, json={}).json()
    assert p["renegotiate"] is True
    assert [x for x in online.rtc.calls if x[0] == "pull"][-1][2:] == (st["floor"]["sfu"], "voice")
    r = online.post(f"/api/m/teacher/live/{sid}/answer", headers=online.teacher, json={"sdp": OFFER})
    assert r.json() == {"ok": True}
    assert roster(online, sid)["floor"] == {"alias": alias(online, a), "until": f["until"], "on": True}
    sent = online.rtc.sent()
    assert a["X-Learner-Token"] not in sent and learners.token_hash(a["X-Learner-Token"]) not in sent
    assert online.fake.sent == []                                                     # no AI near it
    assert sql(online, "SELECT COUNT(*) FROM events")[0][0] == 0                      # nothing written of anyone


def test_the_floor_falls_at_90_seconds_and_with_take_back_done_or_leaving(online, monkeypatch):
    adults_only(online)
    sid, (a, b) = room(online)
    give(online, sid, a)
    speak(online, sid, a)
    pub = online.hub.store.sync.live_session(sid)["state"]["rtc"]["pub"]
    real = live_mod.now
    monkeypatch.setattr(live_mod, "now", lambda: real() + timedelta(seconds=91))
    st = online.get(f"/api/m/live/{sid}/state", headers=b).json()
    assert st["floor"] is None and st["floor_mine"] is False and st["pub"] == pub + 1   # pull again, without her
    assert online.hub.store.sync.live_session(sid)["state"]["floor"] is None
    monkeypatch.setattr(live_mod, "now", real)
    speak(online, sid, a, 403)                                                       # it has fallen
    # "Take back the floor"
    give(online, sid, a)
    r = online.post(f"/api/m/teacher/live/{sid}/floor", headers=online.teacher, json={})
    assert r.json()["floor"] is None and online.get(f"/api/m/live/{sid}/state", headers=a).json()["floor_mine"] is False
    # her "Done"
    give(online, sid, a)
    assert online.post(f"/api/m/live/{sid}/speak", headers=a, json={"done": True}).json()["floor"] is None
    # she leaves with it
    give(online, sid, a)
    online.post(f"/api/m/live/{sid}/leave", headers=a)
    assert online.hub.store.sync.live_session(sid)["state"]["floor"] is None
    # the sound goes off (fewer than two for two minutes): it falls with it
    join(online, sid, a)
    give(online, sid, a)
    old = iso(datetime.now(timezone.utc) - timedelta(seconds=40))
    sql(online, "UPDATE live_present SET seen_at=? WHERE token_hash=?", (old, learners.token_hash(b["X-Learner-Token"])))
    s = online.hub.store.sync.live_session(sid)
    low = iso(datetime.now(timezone.utc) - timedelta(seconds=121))
    online.hub.store.sync.live_update(sid, state=dict(s["state"], low_since=low))
    r = roster(online, sid)
    assert r["audio"] == "off" and r["floor"] is None


def test_the_floor_is_refused_to_a_child_a_mixed_class_without_the_setting_or_the_consent(online):
    # a mixed class (the seed's every band): no floor, even with the setting and the consent text
    adults_only(online)
    sql(online, "UPDATE cohorts SET bands=? WHERE id=?", (json.dumps(["s2", "ad"]), STAGING))
    sid, (a, b) = room(online)
    assert online.get("/api/m/teacher/live", headers=online.teacher).json()["floor"] is False
    assert give(online, sid, a, 409)["code"] == "locked"
    online.post(f"/api/m/teacher/live/{sid}/end", headers=online.teacher)
    # adults only, but the setting off
    adults_only(online, floor=False)
    sid, (a, b) = room(online)
    assert give(online, sid, a, 409)["code"] == "locked"
    online.post(f"/api/m/teacher/live/{sid}/end", headers=online.teacher)
    # adults only and the setting on, but her consent text does not name live classes
    adults_only(online)
    sid, (a, b) = room(online)
    for key in [k for k in online.hub.consent_texts if k[1] == online.hub.consent_version]:
        online.hub.consent_texts[key] = dict(online.hub.consent_texts[key], live=False)
    assert give(online, sid, a, 409)["code"] == "locked"
    adults_only(online)
    # a child's token: the floor is refused, and speak refuses her whatever the state says (403)
    child = learner_of(online, STAGING, band="s1")
    join(online, sid, child)
    assert give(online, sid, child, 409)["code"] == "locked"
    st = dict(online.hub.store.sync.live_session(sid)["state"],
              floor={"alias": alias(online, child), "until": iso(datetime.now(timezone.utc) + timedelta(seconds=60)),
                     "sfu": None, "published": False})
    online.hub.store.sync.live_update(sid, state=st)
    speak(online, sid, child, 403)
    assert not [x for x in online.rtc.calls if x[0] == "publish" and x[4] == "voice"]
    online.post(f"/api/m/teacher/live/{sid}/floor", headers=online.teacher, json={})
    # fewer than two listening: the floor waits
    online.post(f"/api/m/teacher/live/{sid}/end", headers=online.teacher)
    sid, (a,) = room(online, n=1)
    assert give(online, sid, a, 409)["code"] == "floor_few"
    # the floor's routes are the teacher's own class's, with X-Qalam, as every live write
    h = {k: v for k, v in online.teacher.items() if k != "X-Qalam"}
    assert online.post(f"/api/m/teacher/live/{sid}/floor", headers=h, json={}).status_code == 403


def test_the_admin_turns_the_floor_on_only_for_an_adult_only_class_under_a_consent_naming_live(online):
    def floor_on():
        return online.post(f"/api/m/admin/cohorts/{STAGING}/flags/live", headers=online.admin,
                           json={"enabled": True, "settings": {"floor": True}, "confirm": True, "both": True})
    for key in [k for k in online.hub.consent_texts if k[1] == online.hub.consent_version]:
        online.hub.consent_texts[key] = dict(online.hub.consent_texts[key], live=True)
    r = floor_on()
    assert r.status_code == 409 and r.json()["code"] == "locked"                     # the seed's bands are mixed
    sql(online, "UPDATE cohorts SET bands=? WHERE id=?", (json.dumps(["ad"]), STAGING))
    for key in [k for k in online.hub.consent_texts if k[1] == online.hub.consent_version]:
        online.hub.consent_texts[key] = dict(online.hub.consent_texts[key], live=False)
    assert floor_on().status_code == 409                                             # the consent text first
    for key in [k for k in online.hub.consent_texts if k[1] == online.hub.consent_version]:
        online.hub.consent_texts[key] = dict(online.hub.consent_texts[key], live=True)
    assert floor_on().status_code == 200
    assert online.hub.store.sync.flags(STAGING)["live"]["settings"]["floor"] is True
    # the switch's confirm names what the capability lets a learner do
    online.hub.store.sync.set_flag(STAGING, "live", enabled=False, settings={}, changed_by="admin")
    r = online.post(f"/api/m/admin/cohorts/{STAGING}/flags/live", headers=online.admin, json={"enabled": True, "both": True})
    assert r.status_code == 409 and r.json()["code"] == "confirm_first"
    assert "never recorded" in r.json()["risks"][0]["sentence"]


def test_the_floor_is_off_in_every_seed():
    for name in ("hub", "staging", "open"):
        assert "floor" not in (TUTOR / "cohorts" / f"{name}.json").read_text()


def test_the_admin_sees_the_months_line_against_the_cap(online):
    sid = start(online)["id"]
    online.post(f"/api/m/teacher/live/{sid}/end", headers=online.teacher)
    sql(online, "UPDATE live_sessions SET listener_min=600, peak=14")
    c = online.get(f"/api/m/admin/cohorts/{STAGING}", headers=online.admin).json()
    assert c["live"] == {"classes": 1, "peak": 14, "hours": 10.0, "gb": 0.14, "cap": 900, "full": False, "pct": 0}
    assert c["timetable"]["live_subjects"] == list(timetable.LIVE_SUBJECTS)


# the timetable

def test_a_live_block_has_a_subject_and_counts_as_a_period():
    day = {"start": "08:00", "blocks": [{"kind": "opening", "min": 5}, {"kind": "live", "min": 40, "subject": "maths"}]}
    t = {"days": ["sat"], "bands": {"s1": day}}
    assert timetable.check(t) == []
    day["blocks"][1]["subject"] = "auto"
    assert any("live class's subject" in p for p in timetable.check(t))
    day["blocks"][1] = {"kind": "live", "min": 40, "subject": "class", "lesson": "x"}
    assert any("unknown lesson" in p for p in timetable.check(t))


# the relay client itself, against a stand-in for Cloudflare's API

def test_the_relay_client_talks_only_to_the_relays_host_with_the_apps_secret(cfg):
    for k, v in SECRETS.items():
        setattr(cfg, k, v)
    seen = []

    def answer(request: httpx.Request):
        seen.append((request.method, request.url.host, request.url.path, request.headers["authorization"],
                     json.loads(request.content or b"null")))
        p = request.url.path
        if p.endswith("/generate-ice-servers"):
            return httpx.Response(201, json={"iceServers": [{"urls": ["stun:stun.cloudflare.com:3478"]},
                                                            {"urls": ["turn:turn.cloudflare.com:443?transport=tcp"],
                                                             "username": "u", "credential": "c"}]})
        if p.endswith("/sessions/new"):
            return httpx.Response(201, json={"sessionId": "abc"})
        if p.endswith("/tracks/new") and "sessionDescription" in json.loads(request.content):
            return httpx.Response(200, json={"sessionDescription": {"type": "answer", "sdp": OFFER}, "tracks": []})
        if p.endswith("/tracks/new"):
            return httpx.Response(200, json={"requiresImmediateRenegotiation": True,
                                             "sessionDescription": {"type": "offer", "sdp": OFFER}})
        if p.endswith("/renegotiate"):
            return httpx.Response(200, json={})
        return httpx.Response(404)

    rtc = Realtime(cfg, client=httpx.AsyncClient(transport=httpx.MockTransport(answer)))

    async def run():
        ice = await rtc.ice()
        sid, none = await rtc.new_session()
        ans = await rtc.publish(sid, OFFER, "0", "mic")
        offer, again = await rtc.pull("xyz", sid, "mic")
        await rtc.renegotiate("xyz", OFFER)
        await rtc.aclose()
        return ice, sid, none, ans, offer, again
    ice, sid, none, ans, offer, again = asyncio.run(run())
    assert len(ice) == 2 and sid == "abc" and none is None and "maxaveragebitrate=32000" in ans and again is True
    assert {h for _, h, *_ in seen} == {"rtc.live.cloudflare.com"}
    assert seen[0][2] == "/v1/turn/keys/k-1/credentials/generate-ice-servers" and seen[0][3] == "Bearer t-1"
    assert seen[0][4] == {"ttl": 7200}
    assert all(x[2].startswith("/v1/apps/app-1/") and x[3] == "Bearer s-1" for x in seen[1:])
    assert seen[2][4]["tracks"] == [{"location": "local", "mid": "0", "trackName": "mic"}]
    assert seen[3][4]["tracks"] == [{"location": "remote", "sessionId": "abc", "trackName": "mic"}]
    assert seen[4][0] == "PUT" and seen[4][4]["sessionDescription"]["type"] == "answer"
    # the older answer shape of the TURN endpoint, and an error that names no secret
    old = Realtime(cfg, client=httpx.AsyncClient(transport=httpx.MockTransport(
        lambda r: httpx.Response(201, json={"iceServers": {"urls": ["turn:x"], "username": "u", "credential": "c"}}))))
    assert asyncio.run(old.ice()) == [{"urls": ["turn:x"], "username": "u", "credential": "c"}]
    down = Realtime(cfg, client=httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(500))))
    with pytest.raises(RtcError) as e:
        asyncio.run(down.new_session())
    assert "s-1" not in str(e.value) and str(e.value) == "HTTP 500"
    cfg.rtc_secret = None
    with pytest.raises(RtcError):
        asyncio.run(Realtime(cfg).new_session())


def test_the_opus_line_is_mono_at_32_kbps():
    sdp = "v=0\r\nm=audio 9 UDP 111\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;stereo=1;useinbandfec=1\r\n"
    out = munge_opus(sdp)
    line = next(x for x in out.split("\r\n") if x.startswith("a=fmtp:111"))
    assert line == "a=fmtp:111 minptime=10;useinbandfec=1;maxaveragebitrate=32000;stereo=0;sprop-stereo=0"
    bare = munge_opus("v=0\r\nm=audio 9 UDP 109\r\na=rtpmap:109 opus/48000/2\r\n")
    assert "a=fmtp:109 maxaveragebitrate=32000;stereo=0;sprop-stereo=0" in bare
    assert no_video(OFFER) and not no_video(OFFER + "m=video 9 UDP 96\r\n")
    assert live_mod.MB_PER_LISTENER_MIN == 0.24 and live_mod.TICKET_S == 60 and live_mod.GRACE_S == 120
