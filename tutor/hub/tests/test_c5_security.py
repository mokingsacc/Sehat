"""The C5 security review's fixes (review_c5_opus.md part A), each against the review's own reproduction:
H1 the class whose switches apply is the learner's own, never one `?cohort=` names; H2 online, tokenless requests
are counted by the address Cloudflare saw, and only wrong class codes count against it; H3 every consent text in use
names no AI company and says what may leave; M1 a staff write online needs `X-Qalam: 1`; M2 the staff pages' headers
on the hub; L1 a teacher's lock code in the Log; L2 the hub-wide PIN count; L3 one key fetch a minute for unknown key
ids; L4 Ask's subject and lesson are short; and the owner's AI price table. No network: the AI is the fake."""
import json

import pytest
from fastapi.testclient import TestClient

from tutor_hub import learners
from tutor_hub.ai.fake import FakeProvider
from tutor_hub.ai.gateway import today
from tutor_hub.server import create_app

from conftest import learner_of
from test_admin import as_admin, get, hub, post  # noqa: F401  (fixtures and helpers)
from test_review import STAGING, online, rsa, token  # noqa: F401

OPEN = "3w2lco2s8f"
HUB = "d6co6etep6"
Q = {"text": "Why is the sky blue?", "lang": "en"}


@pytest.fixture
def web(cfg):
    """Online, as the Worker runs, with the fake AI and the teacher module available (hold for the teacher)."""
    cfg.home, cfg.cohort, cfg.ai_provider = "online", OPEN, "fake"
    with TestClient(create_app(cfg)) as c:
        c.hub = c.app.state.hub
        c.fake = c.hub.gateway.provider = FakeProvider()
        c.hub.brain.gateway.provider = c.fake
        yield c


def join(c, **body):
    r = c.post("/api/join", json={"band": "s1", "lang": "en", "picture": "key",
                                  "consent": {"kind": "self", "version": c.hub.consent_version}, **body})
    assert r.status_code == 200, r.text
    return {"X-Learner-Token": r.json()["token"]}


# H1: her own class, never the one a link names

def test_h1_a_class_with_ai_off_gets_no_ai_answer_whatever_the_query_and_staging_pays_nothing(web):
    sync = web.hub.store.sync
    sync.set_flag(OPEN, "ask", enabled=True, changed_by="admin")
    sync.set_cohort_settings(OPEN, dict(sync.cohort(OPEN)["settings"], ai=False))     # the admin's kill switch
    h = join(web)
    for path in ("/api/ask", f"/api/ask?cohort={STAGING}"):                       # the review's reproduction
        r = web.post(path, json=Q, headers=h)
        assert r.status_code == 200 and r.json()["source"] != "ai", r.json()
    assert not web.fake.sent and sync.ai_spent(STAGING, today())["tokens"] == 0
    assert sync.events_since(STAGING, "2000-01-01T00:00") == []                   # no count lands in staging
    assert {e["verb"] for e in sync.events_since(OPEN, "2000-01-01T00:00")} >= {"ask.answered"}
    assert sync.queue(cohort=STAGING, own=False) == []


def test_h1_a_module_off_for_her_class_is_404_with_and_without_the_query(web):
    h = join(web)                                                                   # open: ask is off there
    for path in ("/api/ask", f"/api/ask?cohort={STAGING}"):
        assert web.post(path, json=Q, headers=h).status_code == 404
    # and a tokenless write never takes a class from the query: this hub's own cohort's switches apply
    assert web.post(f"/api/ask?cohort={STAGING}", json=Q).status_code in (401, 404)
    r = web.post(f"/api/m/plan?cohort={STAGING}", json={"goal": "astronomy", "lang": "en", "band": "s1"})
    assert r.json()["kind"] == "wish" and [w["cohort"] for w in web.hub.store.sync.wishes()] == [OPEN]
    # reads that spend and store nothing may still name a class (the timetable, hello)
    assert web.get(f"/api/hello?cohort={STAGING}").json()["cohort"]["id"] == STAGING


def test_h1_a_class_that_holds_answers_holds_them_whatever_the_query(web):
    sync = web.hub.store.sync
    sync.set_flag(STAGING, "teacher", enabled=True, settings={"hold": True}, changed_by="admin")
    sync.set_flag(OPEN, "ask", enabled=True, changed_by="admin")                 # open holds nothing
    h = learner_of(web, STAGING)
    for path in ("/api/ask", f"/api/ask?cohort={OPEN}"):
        a = web.post(path, json=Q, headers=h).json()
        assert a["waiting"] and a["source"] == "none", a                           # the teacher sees it first
    assert [x["held"] for x in sync.ai_usage(STAGING)] == [2] and sync.ai_usage(OPEN) == []


def test_h1_the_provider_is_her_class_choice(web):
    sync = web.hub.store.sync
    sync.set_flag(OPEN, "ask", enabled=True, changed_by="admin")
    sync.set_cohort_settings(STAGING, dict(sync.cohort(STAGING)["settings"], ai_provider="anthropic"))
    web.post(f"/api/ask?cohort={STAGING}", json=Q, headers=join(web))
    assert {x["provider"] for x in sync.ai_usage(OPEN)} == {"fake"} and sync.ai_usage(STAGING) == []


# H2: online, per address, and only wrong codes count

def no_client(app):
    """The Workers ASGI adapter's scope: no client address."""
    async def wrapped(scope, receive, send):
        await app(dict(scope, client=None) if scope["type"] == "http" else scope, receive, send)
    return wrapped


@pytest.fixture
def worker_like(cfg):
    cfg.home, cfg.cohort = "online", OPEN
    app = create_app(cfg)
    with TestClient(no_client(app)) as c:
        c.hub = app.state.hub
        yield c


def test_h2_new_learners_are_never_shut_out_by_a_shared_bucket(worker_like):
    c = worker_like
    for i in range(25):                                                             # 25 phones, 25 addresses
        assert c.post("/api/join", json={"band": "s1", "lang": "en", "picture": "key"},
                      headers={"CF-Connecting-IP": f"203.0.113.{i}"}).status_code == 200
    code = learners.new_class_code()
    c.hub.store.sync.set_class_code(STAGING, learners.code_hash(learners.normal_code(code)))
    one = {"CF-Connecting-IP": "198.51.100.7"}                                     # a school's Wi-Fi: one address
    for _ in range(30):
        r = c.post("/api/join", json={"band": "s1", "lang": "en", "picture": "key", "cohort_code": code}, headers=one)
        assert r.status_code == 200 and r.json()["cohort"]["id"] == STAGING


def test_h2_twenty_wrong_codes_an_hour_from_one_address_then_wait(worker_like):
    c = worker_like
    code = learners.new_class_code()
    c.hub.store.sync.set_class_code(STAGING, learners.code_hash(learners.normal_code(code)))
    guess = {"CF-Connecting-IP": "192.0.2.9"}
    body = {"band": "s1", "lang": "en", "picture": "key"}
    for _ in range(20):
        assert c.post("/api/join", json=dict(body, cohort_code="WRONG234"), headers=guess).status_code == 404
    assert c.post("/api/join", json=dict(body, cohort_code="WRONG234"), headers=guess).status_code == 429
    assert c.post("/api/join", json=dict(body, cohort_code=code), headers=guess).status_code == 429
    assert c.post("/api/join", json=dict(body, cohort_code=code),
                  headers={"CF-Connecting-IP": "192.0.2.10"}).status_code == 200     # her neighbour is fine


def test_h2_a_server_with_a_socket_address_never_trusts_the_header(hub_client):
    body = {"band": "s1", "lang": "prs", "picture": "key", "cohort_code": "WRONG234"}
    for i in range(20):
        hub_client.post("/api/join", json=body, headers={"CF-Connecting-IP": f"10.0.0.{i}"})
    assert hub_client.post("/api/join", json=body, headers={"CF-Connecting-IP": "10.0.0.99"}).status_code == 429


# H3: provider-neutral consent

def test_h3_every_consent_text_in_use_names_no_company_and_says_what_may_leave():
    texts = learners.load_consent()
    for home, version in learners.CONSENT_VERSIONS.items():
        for lang in ("prs", "ps", "en"):
            doc = texts[(lang, version)]
            words = json.dumps(doc, ensure_ascii=False).lower()
            assert not any(n in words for n in ("openai", "anthropic", "claude", "google", "gemini")), (lang, version)
            # W7: the texts in use name the school bag, a fifth row and a fifth paragraph (WEBSITE.md 3.6)
            assert doc["home"] == home and set(doc["rows"]) == {"does", "keeps", "sees", "bag", "stop"} and len(doc["full"]) == 5
            assert doc["bag"] is True
        en = " ".join([*texts[("en", version)]["rows"].values(), *texts[("en", version)]["full"]])
        assert "AI service" in en and "no name" in en
        assert "nothing is sent over the internet" not in en and "nothing leaves" not in en
    hub_en = " ".join(texts[("en", learners.CONSENT_VERSIONS["hub"])]["full"])
    assert "switches on an AI service on the internet" in hub_en                   # the hub can send, now: it says so


# M1: a staff write online needs the header a form cannot set

def test_m1_a_forged_form_cannot_change_the_class_code(online, rsa):
    as_admin(online, rsa)
    bare = {"Cf-Access-Jwt-Assertion": online.pin["Cf-Access-Jwt-Assertion"]}     # what a cross-site form carries
    r = online.post(f"/api/m/admin/cohorts/{STAGING}/code", headers=bare)
    assert r.status_code == 403 and "X-Qalam" in r.json()["error"]
    assert online.post(f"/api/m/admin/cohorts/{STAGING}/code", headers=bare, data={"x": "1"}).status_code == 403
    assert online.post(f"/api/m/admin/cohorts/{STAGING}/code", headers=online.pin).status_code == 200
    assert online.get("/api/m/admin/me", headers=bare).status_code == 200            # reads need none


# M2: the staff pages' headers on the hub

def test_m2_the_hub_sends_the_staff_pages_with_their_headers_and_leaves_the_rest(hub_client):
    for page in ("/admin/", "/teacher/", "/review/"):
        r = hub_client.get(page)
        assert r.status_code == 200 and r.headers["x-frame-options"] == "DENY", page
        assert "frame-ancestors 'none'" in r.headers["content-security-policy"]
        assert r.headers["x-content-type-options"] == "nosniff" and r.headers["referrer-policy"] == "no-referrer"
    assert "x-frame-options" not in hub_client.get("/app/").headers                 # the review page frames the app
    assert "x-frame-options" not in hub_client.get("/api/sheets/dari-1-sheen.html").headers   # the APK frames sheets


# L1, L2, L3, L4

def test_l1_a_lock_reset_code_is_in_the_log_without_the_code(hub_client):
    h = join(hub_client)
    me = hub_client.get("/api/me", headers=h).json()
    pin = {"X-Teacher-Pin": hub_client.pin}
    r = hub_client.post(f"/api/m/teacher/class/{me['picture']}-{me['number']}/reset-code", headers=pin)
    assert r.status_code == 200
    [row] = hub_client.hub.store.sync.admin_log(cohort=HUB)
    assert row["what"] == "teacher.lock_code" and row["changed_by"] == "teacher:hub"
    assert row["detail"] == f"a lock reset code for key-{me['number']}" and r.json()["code"] not in json.dumps(row)


def test_l2_after_thirty_wrong_pins_in_an_hour_one_check_every_ten_seconds(hub_client):
    hub = hub_client.hub
    now = [1000.0]
    hub.clock = lambda: now[0]
    for i in range(30):                                     # 30 phones, or one that keeps getting a new address
        now[0] += 0.5
        with pytest.raises(Exception):
            hub.check_pin("000000", f"10.42.0.{i}")
    now[0] += 1
    with pytest.raises(Exception) as e:
        hub.check_pin(hub.pin, "10.42.0.200")
    assert e.value.status_code == 429                       # even the right PIN waits its turn
    now[0] += 10
    hub.check_pin(hub.pin, "10.42.0.200")                   # ten seconds on: checked, and right
    now[0] += 3601
    hub.check_pin(hub.pin, "10.42.0.201")                   # an hour later the count has gone


def test_l3_an_unknown_key_id_fetches_the_keys_at_most_once_a_minute(online, rsa):
    as_admin(online, rsa)
    assert online.get("/api/m/admin/me", headers=online.pin).status_code == 200
    n = len(online.fetched)
    bad = {"Cf-Access-Jwt-Assertion": token(dict(rsa, kid="made-up"), email="admin@example.org")}
    for _ in range(5):
        assert online.get("/api/m/admin/me", headers=bad).status_code == 403
    assert len(online.fetched) == n + 1


def test_l4_asks_subject_and_lesson_are_short(hub_client):
    assert hub_client.post("/api/ask", json=dict(Q, subject="s" * 41)).status_code == 422
    assert hub_client.post("/api/ask", json=dict(Q, lesson="l" * 81)).status_code == 422
    assert hub_client.post("/api/ask", json=dict(Q, subject="science", lesson="maths-7-fractions-add")).status_code == 200


# the owner's AI price table

def test_the_price_table_is_empty_by_default_and_prices_the_next_call(hub):
    hub.post("/api/ask", json=Q)
    assert get(hub, "/spend")["prices"] == [] and hub.hub.store.sync.ai_usage(HUB)[0]["cost_micro"] == 0
    for bad in ({"provider": "nobody", "usd_in": 1, "usd_out": 1}, {"provider": "fake", "usd_in": 1},
                {"provider": "fake", "usd_in": -1, "usd_out": 1}, {"provider": "fake", "model": "a b", "usd_in": 1,
                                                                    "usd_out": 1}):
        assert hub.post("/api/m/admin/prices", headers=hub.pin, json=bad).status_code == 422, bad
    out = post(hub, "/prices", {"provider": "fake", "model": "", "usd_in": 2, "usd_out": 10})
    assert out["prices"][0] | {"changed_at": None} == {"provider": "fake", "model": "", "usd_in": 2.0, "usd_out": 10.0,
                                                        "changed_at": None}
    hub.post("/api/ask", json={"text": "Why do leaves fall?", "lang": "en"})
    spend = get(hub, "/spend")
    assert spend["providers"][-1] == "fake" and next(c for c in spend["cohorts"] if c["id"] == HUB)["cost_micro"] > 0
    post(hub, "/prices", {"provider": "fake", "model": "", "usd_in": None, "usd_out": None})
    assert get(hub, "/spend")["prices"] == []
    lines = [x["detail"] for x in get(hub, "/log")["log"] if x["what"] == "prices"]
    assert lines == ["fake (any model): removed", "fake (any model): $2 in, $10 out per million tokens"]


def test_no_staff_answer_ever_carries_a_key(online, rsa, cfg):
    keys = {"openai_key": "sk-openai-NOT-REAL-1111", "anthropic_key": "sk-ant-NOT-REAL-2222",
            "gemini_key": "gm-NOT-REAL-3333", "compat_key": "tg-NOT-REAL-4444"}
    for k, v in keys.items():
        setattr(online.hub.cfg, k, v)
    as_admin(online, rsa)
    texts = [online.get("/api/m/admin" + p, headers=online.pin).text
             for p in ("/me", "/cohorts", f"/cohorts/{STAGING}", "/content", "/wishes", "/spend", "/safety", "/staff",
                       "/log")]
    as_admin(online, rsa, "teacher@example.org", role="teacher")
    texts += [online.get("/api/m/teacher" + p, headers=online.pin).text for p in ("/me", "/todo", "/class",
                                                                                     "/lessons", "/wishes")]
    assert texts and all(v not in t for t in texts for v in keys.values())
