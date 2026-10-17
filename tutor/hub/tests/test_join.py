"""Joining, her own record and consent (P10): a learner is a token's hash, a band and an alias, never a name."""
import json
import sqlite3

from tutor_hub import learners

CONSENT = {"kind": "guardian-on-phone", "version": "hub-2026-10"}


def join(c, **body):
    return c.post("/api/join", json={"band": "p1", "lang": "prs", "picture": "book", **body})


def me(c, token, method="GET", **kw):
    return c.request(method, "/api/me", headers={"X-Learner-Token": token}, **kw)


def test_hello_names_the_consent_text_and_the_text_is_served(hub_client):
    v = hub_client.get("/api/hello").json()["consent"]
    assert v == "hub-2026-10c"                  # W7: the texts that name the school bag (WEBSITE.md 3.6)
    for lang in ("prs", "ps", "en"):
        doc = hub_client.get(f"/api/consent?lang={lang}").json()
        assert doc["version"] == v and doc["lang"] == lang and doc["draft"] is True and doc["bag"] is True
        assert set(doc["rows"]) == {"does", "keeps", "sees", "bag", "stop"} and len(doc["full"]) >= 3
    # the b texts stay readable for the learners who agreed to them, and name no bag
    old = hub_client.get("/api/consent?lang=en&version=hub-2026-10b").json()
    assert set(old["rows"]) == {"does", "keeps", "sees", "stop"} and not old.get("bag")
    assert "centre's computer" in hub_client.get("/api/consent?lang=en").json()["rows"]["sees"]
    # the texts from before the provider switch stay readable, for the records that name them (C5 H3)
    assert "OpenAI" in hub_client.get("/api/consent?lang=en&version=online-2026-10").json()["rows"]["sees"]
    assert hub_client.get("/api/consent?version=nope").status_code == 404


def test_the_online_home_shows_the_online_text(cfg):
    from fastapi.testclient import TestClient

    from tutor_hub.server import create_app
    cfg.home = "online"
    with TestClient(create_app(cfg)) as c:
        assert c.get("/api/hello").json()["consent"] == "online-2026-10c"


def test_joining_without_a_code_joins_this_hubs_cohort(hub_client):
    r = join(hub_client, consent=CONSENT)
    assert r.status_code == 200
    j = r.json()
    assert j["cohort"]["id"] == hub_client.hub.cohort_id and j["picture"] == "book" and 1 <= j["number"] <= 99
    got = me(hub_client, j["token"]).json()
    assert got == {"cohort": j["cohort"], "band": "p1", "picture": "book", "number": j["number"],
                   "consent": {"kind": "guardian-on-phone", "version": "hub-2026-10", "at": got["consent"]["at"]}}
    # the token itself is never stored: only its hash
    db = sqlite3.connect(hub_client.hub.cfg.data / "hub.db")
    dump = "\n".join(db.iterdump())
    assert j["token"] not in dump and learners.token_hash(j["token"]) in dump


def test_join_takes_nothing_but_band_language_picture_code_and_consent(hub_client):
    assert join(hub_client, name="Maryam").status_code == 422
    assert join(hub_client, consent=dict(CONSENT, guardian="Fatima")).status_code == 422
    assert join(hub_client, band="k9").status_code == 422
    assert join(hub_client, picture="maryam").status_code == 422
    assert join(hub_client, consent=dict(CONSENT, version="v0")).status_code == 422
    assert join(hub_client, consent=dict(CONSENT, kind="parent")).status_code == 422
    assert join(hub_client, cohort_code="NOPE-NOPE").status_code == 404
    assert join(hub_client, cohort_code="x").status_code == 404


def test_a_class_code_joins_that_class(hub_client):
    other = hub_client.hub.seeds["open"]["id"]
    code = learners.new_class_code()
    hub_client.portal.call(hub_client.hub.store.set_class_code, other, learners.code_hash(learners.normal_code(code)))
    for typed in (code, code.replace("-", " ").lower()):
        j = join(hub_client, cohort_code=typed).json()
        assert j["cohort"]["id"] == other
    assert me(hub_client, j["token"]).json()["consent"] is None               # joined, not yet agreed


def test_consent_given_later_withdrawn_by_deleting(hub_client):
    j = join(hub_client).json()
    t = j["token"]
    assert me(hub_client, t, "POST", json={"consent": dict(CONSENT, at="2026-10-16T09:41")}).json()["consent"] == {
        "kind": "guardian-on-phone", "version": "hub-2026-10", "at": "2026-10-16T09:41"}
    assert me(hub_client, t, "POST", json={"band": "s1"}).json()["band"] == "s1"
    assert me(hub_client, t, "POST", json={"band": "s1", "nickname": "x"}).status_code == 422
    e = {"at": learners.minute(), "verb": "lesson.start", "object": "dari-1-sheen"}
    assert hub_client.post("/api/events", headers={"X-Learner-Token": t}, json={"events": [e]}).status_code == 200
    assert me(hub_client, t, "DELETE").json() == {"deleted": True}
    assert me(hub_client, t).status_code == 401
    assert hub_client.portal.call(hub_client.hub.store.events, hub_client.hub.cohort_id) == []   # her events went too


def test_a_future_consent_minute_becomes_now():
    assert learners.consent_at("2999-01-01T00:00") == learners.minute()
    assert learners.consent_at("2026-02-30T00:00") == learners.minute()
    assert learners.consent_at("2026-10-16T09:41") == "2026-10-16T09:41"


def test_class_codes_are_easy_to_type():
    for _ in range(50):
        c = learners.new_class_code()
        assert len(c) == 9 and c[4] == "-" and learners.normal_code(c) == c.replace("-", "")
        assert not set(c) & set("0O1IL")
    assert learners.normal_code("k7qm 4prt") == "K7QM4PRT" and learners.normal_code("short") is None


def test_alias_pictures_are_the_reviewed_list(hub_client):
    doc = json.loads(learners.ALIASES.read_text(encoding="utf-8"))
    ids = [p["id"] for p in doc["pictures"]]
    assert ids == ["book", "key", "cup", "teapot", "clock", "apple", "grapes", "pomegranate", "mountain", "boat",
                   "umbrella", "bell"]
    assert all(set(p["name"]) == {"prs", "ps", "en"} for p in doc["pictures"]) and doc["draft"] is True
    assert hub_client.hub.aliases == set(ids)
