"""The teacher dashboard (P20, C3.2, DESIGN-C2C3-SPECS item 11): hold-for-teacher, the To do queue's actions, the
class and lesson counts made from nameless events, the lock reset code, the class card and the answer sheet, behind
the staff gate (the PIN on the hub, Cloudflare Access online). No network: the AI is the fake."""
import asyncio
import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from tutor_hub import events, learners, qr
from tutor_hub.ai.fake import FakeProvider
from tutor_hub.mods import teacher
from tutor_hub.server import create_app, teacher_pin

from test_review import PEPPER, STAGING, online, rsa, token  # noqa: F401  (fixtures and helpers)

WORD = "Ali ate 1/4 of a cake and Sara ate 2/4 of it. How much of the cake did they eat together?"


@pytest.fixture
def hub(cfg):
    """The village hub with the fake AI, its PIN, and Homework help switched on for the hub's own cohort."""
    cfg.ai_provider = "fake"
    with TestClient(create_app(cfg)) as c:
        c.hub = c.app.state.hub
        c.fake = c.hub.gateway.provider = FakeProvider()
        c.hub.brain.gateway.provider = c.fake
        c.pin = {"X-Teacher-Pin": teacher_pin(cfg.data)}
        c.cid = c.hub.cohort_id
        yield c


def hold(c, on=True, **more):
    c.hub.store.sync.set_flag(c.cid, "teacher", enabled=True, settings={"hold": on, **more}, changed_by="admin")


def join(c, band="s1", picture="key"):
    r = c.post("/api/join", json={"band": band, "lang": "en", "picture": picture,
                                  "consent": {"kind": "self", "version": c.hub.consent_version}})
    assert r.status_code == 200, r.text
    return r.json()


def todo(c):
    r = c.get("/api/m/teacher/todo", headers=c.pin)
    assert r.status_code == 200, r.text
    return r.json()["items"]


def act(c, qid, **body):
    return c.post(f"/api/m/teacher/todo/{qid}", headers=c.pin, json=body)


# the gate

def test_the_dashboard_needs_the_pin_on_the_hub(hub):
    assert hub.get("/api/m/teacher/me").status_code == 401
    me = hub.get("/api/m/teacher/me", headers=hub.pin).json()
    assert me["via"] == "pin" and [x["id"] for x in me["cohorts"]] == [hub.cid]
    assert me["hold"] is False and me["lock_codes"] is True and me["printer"] is True
    assert hub.get(f"/api/m/teacher/todo?cohort={STAGING}", headers=hub.pin).status_code in (403, 404)


def test_online_only_teachers_and_admins_in_their_own_classes(online, rsa):
    def add(email, role):
        from tutor_hub import staff
        asyncio.run(online.hub.store.add_staff(id_hash=staff.id_hash(PEPPER, email), label="Teacher A", role=role,
                                               cohorts=[STAGING], initials=""))
    add("reader@example.org", "Dari reader")
    add("teacher@example.org", "teacher")
    me = lambda email, path="/api/m/teacher/me": online.get(path, headers={  # noqa: E731
        "Cf-Access-Jwt-Assertion": token(rsa, email=email)})
    assert me("nobody@example.org").json()["error"] == "Ask the admin to add you"
    assert me("reader@example.org").status_code == 403                     # a reviewer sees no class
    r = me("teacher@example.org")
    assert r.status_code == 200 and r.json()["via"] == "access" and r.json()["cohorts"][0]["id"] == STAGING
    assert "example" not in r.text
    assert me("teacher@example.org", "/api/m/teacher/class?cohort=d6co6etep6").status_code in (403, 404)
    assert me("teacher@example.org", "/api/m/teacher/todo").status_code == 200


# hold for the teacher

def test_without_hold_the_ai_answer_goes_straight_to_her(hub):
    a = hub.post("/api/ask", json={"text": "Why is the sky blue?", "lang": "en", "subject": "science"}).json()
    assert a["source"] == "ai" and not a["waiting"]
    assert todo(hub) == []
    assert hub.hub.store.sync.ai_usage(hub.cid)[0]["held"] == 0


def test_a_held_answer_waits_until_the_teacher_sends_it(hub):
    hold(hub)
    a = hub.post("/api/ask", json={"text": "Why is the sky blue?", "lang": "en", "subject": "science"}).json()
    assert a["waiting"] and a["source"] == "none" and "practice answer" not in json.dumps(a)
    assert hub.get(f"/api/ask/{a['id']}").json()["status"] == "waiting"
    usage = hub.hub.store.sync.ai_usage(hub.cid)
    assert usage[0]["held"] == 1 and usage[0]["calls"] == 1
    [card] = todo(hub)
    assert card["kind"] == "held" and "practice answer" in card["shown"] and card["checks"]["maths"] is True
    assert "token" not in card and act(hub, card["id"], action="reply", text="x").status_code == 422
    assert act(hub, card["id"], action="send").json() == {"ok": True}
    s = hub.get(f"/api/ask/{a['id']}").json()
    assert s["status"] == "reviewed" and "practice answer" in s["teacher_answer"]
    assert hub.hub.store.sync.approved() == []                  # sending is not "use it for others"
    assert todo(hub) == [] and act(hub, card["id"], action="send").status_code == 404


def test_a_held_ladder_is_sent_edited_and_never_with_its_answer(hub):
    hub.hub.store.sync.set_flag(hub.cid, "homework", enabled=True, changed_by="admin")
    hold(hub)
    hub.fake.replies["hint"] = ["ANSWER: 3/4", "ANSWER: 3/4",
                                json.dumps(["Look at what each person ate.", "1/5 + 1/5 = 2/5", "Both bottoms are 4."])]
    a = hub.post("/api/ask", json={"text": WORD, "lang": "en", "year": 7}).json()
    assert a["waiting"] and not a.get("ladder")
    [card] = todo(hub)
    assert "1/5 + 1/5 = 2/5" in card["hints"][1] and card["private"] == {"answer": "3/4", "sure": True}
    assert card["checks"]["leak"] is True
    leaky = act(hub, card["id"], action="edit", hints=["Think.", "It is 0.75 in all.", "Add."])
    assert leaky.status_code == 422 and "hint 2" in leaky.json()["error"]
    ok = act(hub, card["id"], action="edit", hints=["Look again at each part, ring 0700123456.", "1/5 + 1/5 = 2/5",
                                                    "Both bottoms are 4."])
    assert ok.status_code == 200
    s = hub.get(f"/api/ask/{a['id']}").json()
    assert s["status"] == "reviewed" and s["teacher_answer"] is None and s["checkable"] is True
    assert [r["rung"] for r in s["ladder"]] == [1, 2, 3] and "0700123456" not in s["ladder"][0]["text"]
    assert "3/4" not in json.dumps(s) and "0.75" not in json.dumps(s)
    verbs = [e["verb"] for e in hub.hub.store.sync.events(hub.cid)]
    assert "held.edited" in verbs


def test_dont_send_takes_a_reason_and_counts_it(hub):
    hold(hub)
    a = hub.post("/api/ask", json={"text": "Why is the sky blue?", "lang": "en"}).json()
    [card] = todo(hub)
    assert act(hub, card["id"], action="drop").status_code == 422
    assert act(hub, card["id"], action="drop", reason="wrong").status_code == 200
    assert hub.get(f"/api/ask/{a['id']}").json()["status"] == "rejected"
    e = hub.hub.store.sync.events(hub.cid)[0]
    assert (e["verb"], e["object"], e["module"]) == ("held.dropped", "wrong", "teacher")
    assert events.check({"at": "2026-10-17T10:00", "verb": "held.dropped", "object": "Maryam"}, phone=False)
    assert events.check({"at": "2026-10-17T10:00", "verb": "held.sent"}, phone=True)          # never from a phone


def test_care_comes_first_and_replies_are_filtered(hub):
    hub.post("/api/ask", json={"text": "زلزله چرا می‌آید؟", "lang": "prs", "teacher": True})
    hub.post("/api/ask", json={"text": "پدرم مرا می‌زند", "lang": "prs"})
    items = todo(hub)
    assert [x["kind"] for x in items] == ["care", "question"] and items[0]["shown"]
    assert act(hub, items[0]["id"], action="send").status_code == 422
    assert act(hub, items[0]["id"], action="seen").status_code == 200
    r = act(hub, items[1]["id"], action="reply", text="My name is Karim, call 0799123456. The ground shakes.", reuse=True)
    assert r.status_code == 200
    kept = hub.hub.store.sync.approved()[0]["answer"]
    assert "0799123456" not in kept and "Karim" not in kept and "ground shakes" in kept
    assert todo(hub) == []


# the class, from nameless events

def minute(**ago):
    return events.minute(datetime.now(timezone.utc) - timedelta(**ago))


def send_events(c, tok, evs):
    r = c.post("/api/events", headers={"X-Learner-Token": tok}, json={"events": evs})
    assert r.status_code == 200, r.text


def test_the_class_and_lessons_show_counts_never_names(hub):
    one, two = join(hub, picture="key"), join(hub, band="p2", picture="cup")
    lid = "maths-7-fractions-add"
    stuck = [{"at": minute(hours=2), "verb": "hint.rung", "object": f"{lid}:{n}", "value": 3} for n in (1, 2, 3)]
    stuck += [{"at": minute(hours=1), "verb": "check.item", "object": f"{lid}:{n}", "value": 0} for n in (1, 2, 3)]
    send_events(hub, one["token"], [{"at": minute(hours=3), "verb": "lesson.done", "object": lid, "value": 3},
                                    {"at": minute(hours=1), "verb": "check.done", "object": lid, "value": 40},
                                    {"at": minute(hours=1), "verb": "check.dispute", "object": f"{lid}:2"}] + stuck)
    send_events(hub, two["token"], [{"at": minute(hours=1), "verb": "lesson.done", "object": lid, "value": 2},
                                    {"at": minute(minutes=30), "verb": "check.done", "object": lid, "value": 90},
                                    {"at": minute(minutes=30), "verb": "check.item", "object": f"{lid}:2", "value": 1}])
    c = hub.get("/api/m/teacher/class", headers=hub.pin).json()
    assert (c["active"], c["learners"], c["lessons"], c["sheets"]) == (2, 2, 2, 2)
    rows = {r["alias"]: r for r in c["rows"]}
    me = rows[f"key-{one['number']}"]
    assert me["needs_help"] and me["average"] == 40 and me["days"] == 0 and not rows[f"cup-{two['number']}"]["needs_help"]
    assert [r["picture"] for r in c["rows"]] == ["cup", "key"]                  # by picture, never by score
    flat = json.dumps(c)
    assert one["token"] not in flat and learners.token_hash(one["token"]) not in flat
    her = hub.get(f"/api/m/teacher/class/key-{one['number']}", headers=hub.pin).json()
    assert her["lessons"][0]["pct"] == 40 and her["hints"] == {"1": 0, "2": 0, "3": 3} and her["needs_help"]
    assert hub.get("/api/m/teacher/class/key-999", headers=hub.pin).status_code == 404
    ls = {x["id"]: x for x in hub.get("/api/m/teacher/lessons", headers=hub.pin).json()["lessons"]}
    assert (ls[lid]["did"], ls[lid]["mastered"], ls[lid]["disputes"]) == (2, 1, 1)
    assert ls[lid]["hardest"] == 1 and ls[lid]["hints"]["3"] == 3
    d = hub.get(f"/api/m/teacher/lessons/{lid}", headers=hub.pin).json()
    assert d["items"][1] == {"n": 2, "right": 1, "wrong": 1, "disputes": 1, "hints": 1} and d["answers"] is True
    page = hub.get(f"/api/m/teacher/answers/{lid}.html?seed=4821", headers=hub.pin)
    assert page.status_code == 200 and "M7-03-48217" in page.text
    assert hub.get(f"/api/m/teacher/answers/{lid}.html").status_code == 401
    assert hub.get("/api/m/teacher/wishes", headers=hub.pin).json() == {"wishes": []}


def test_the_pure_counts():
    evs = [{"token_hash": "a", "verb": "check.done", "object": "x-1", "value": 85, "at": "1"},
           {"token_hash": "b", "verb": "check.done", "object": "x-1", "value": 90, "at": "2"},
           {"token_hash": "a", "verb": "check.done", "object": "x-1", "value": 60, "at": "3"},
           {"token_hash": "a", "verb": "check.item", "object": "x-1:4", "value": 0, "at": "3"},
           {"token_hash": "a", "verb": "check.item", "object": "x-1:2", "value": 0, "at": "3"},
           {"token_hash": "b", "verb": "check.item", "object": "x-1:2", "value": 0, "at": "3"}]
    s = teacher.lesson_stats(evs)["x-1"]
    assert s["mastered"] == 1 and s["hardest"] == 2 and s["did"] == 0           # her latest sheet counts
    assert teacher.stuck_items([{"verb": "hint.rung", "object": "x:1", "value": 1},
                                {"verb": "check.item", "object": "x:1", "value": 0},
                                {"verb": "check.item", "object": "x:1", "value": 2}]) == 0


# the lock reset code

def test_a_lock_reset_code_works_once_for_her_only(hub):
    me, other = join(hub, picture="key"), join(hub, picture="cup")
    r = hub.post(f"/api/m/teacher/class/key-{me['number']}/reset-code", headers=hub.pin).json()
    assert len(r["code"]) == 6 and r["code"].isdigit() and r["minutes"] == 15
    reset = lambda tok, code: hub.post("/api/me/pin-reset", headers={"X-Learner-Token": tok}, json={"code": code})  # noqa: E731
    assert reset(other["token"], r["code"]).status_code == 404                  # bound to her token
    wrong = "000000" if r["code"] != "000000" else "111111"
    assert reset(me["token"], wrong).status_code == 403
    persian = r["code"].translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))
    assert reset(me["token"], persian).json() == {"ok": True}
    assert reset(me["token"], r["code"]).status_code == 404                     # used once
    assert reset(me["token"], "12ab56").status_code == 422
    assert hub.post("/api/me/pin-reset", json={"code": "123456"}).status_code == 401
    hold(hub, False, lock_codes=False)
    assert hub.post(f"/api/m/teacher/class/key-{me['number']}/reset-code", headers=hub.pin).status_code == 403


# the class card

def test_the_class_card_holds_the_join_address_for_this_class_only(hub):
    code = learners.new_class_code()
    hub.hub.store.sync.set_class_code(hub.cid, learners.code_hash(learners.normal_code(code)))
    r = hub.post("/api/m/teacher/class-card", headers=hub.pin, json={"code": code.lower()}).json()
    assert r["url"] == f"{hub.hub.cfg.public_url}/?join={code.replace('-', '')}" and r["code"] == code
    assert r["svg"].startswith('<svg class="qr"')
    assert hub.post("/api/m/teacher/class-card", headers=hub.pin, json={"code": "ZZZZ2222"}).status_code == 404


def test_the_class_cards_qr_matches_segno_in_byte_mode():
    segno = pytest.importorskip("segno")
    from segno import consts, encoder
    for text in ("http://10.42.0.1/?join=HJKM2345", "https://qalam-staging.example.workers.dev/?join=ABCD2345",
                 "https://" + "a" * 50 + ".org/?join=ABCDEFGH", "https://" + "a" * 70 + ".org/?join=ABCDEFGH"):
        v = qr._version(text, True)
        buff = encoder.Buffer()
        for s in encoder.prepare_data(text, consts.MODE_BYTE, None):
            encoder.write_segment(buff, s, None, encoder.version_range(v), False)
        cap = consts.SYMBOL_CAPACITY[v][consts.ERROR_LEVEL_M]
        encoder.write_terminator(buff, cap, None, len(buff))
        encoder.write_padding_bits(buff, v, len(buff))
        encoder.write_pad_codewords(buff, v, cap, len(buff))
        bits = list(buff.getbits())
        data = [int("".join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits), 8)]
        fb = list(encoder.make_final_message(v, consts.ERROR_LEVEL_M, buff).getbits())
        final = [int("".join(map(str, fb[i:i + 8])), 2) for i in range(0, len(fb) // 8 * 8, 8)]
        assert qr._final(data, v) == final                       # blocks, error correction, interleaving
        for k in range(8):
            ref = segno.make_qr(text, error="m", mask=k, mode="byte", boost_error=False)
            assert ref.version == v and [list(r) for r in ref.matrix] == qr._draw(final, v, k), (v, k)
        b = qr._bits(text, v, True)
        ours = [int("".join(map(str, b[i:i + 8])), 2) for i in range(0, len(b), 8)]
        assert ours[:len(text) + 2] == data[:len(text) + 2]      # segno adds a zero byte after an aligned terminator
    with pytest.raises(ValueError):
        qr.matrix("javascript:alert(1)", url=True)
    with pytest.raises(ValueError):
        qr.matrix("https://example.org")                         # a sheet's QR never holds an address
