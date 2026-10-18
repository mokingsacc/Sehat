"""The online home (P11; TUTOR_HOME=online, as the Worker runs): many phones reach it from one address, so the
per-phone limits count learner tokens; a question may go to the AI provider there, so Ask needs a learner whose guardian (or
who herself) agreed; and only the sites in TUTOR_ORIGINS may call the API from another page. On the hub everything
stays as it was: limits by address, Ask without a token, any origin (the Android app)."""
import pytest
from fastapi.testclient import TestClient

from tutor_hub.server import create_app


def consent(version):
    return {"kind": "guardian-on-phone", "version": version}


@pytest.fixture
def online(cfg):
    cfg.home = "online"
    cfg.origins = ("https://app.example.org",)
    with TestClient(create_app(cfg)) as c:
        c.hub = c.app.state.hub
        yield c


def join(c, with_consent=True):
    v = c.get("/api/hello").json()["consent"]
    body = {"band": "s1", "lang": "prs", "picture": "key", **({"consent": consent(v)} if with_consent else {})}
    r = c.post("/api/join", json=body)
    assert r.status_code == 200, r.text
    return {"X-Learner-Token": r.json()["token"]}


def test_hello_says_which_home(online):
    assert online.get("/api/hello").json()["home"] == "online"


def test_the_hub_says_hub(hub_client):
    assert hub_client.get("/api/hello").json()["home"] == "hub"


def test_online_ask_needs_a_learner_who_agreed(online):
    q = {"text": "۱ + ۱", "lang": "prs", "year": 7}
    assert online.post("/api/ask", json=q).status_code == 401
    assert online.post("/api/ask", json=q, headers={"X-Learner-Token": "x" * 32}).status_code == 401
    assert online.post("/api/ask", json=q, headers=join(online, with_consent=False)).status_code == 403
    r = online.post("/api/ask", json=q, headers=join(online))
    assert r.status_code == 200 and r.json()["source"] == "maths"


def test_the_hub_asks_without_a_token(hub_client):
    assert hub_client.post("/api/ask", json={"text": "۱ + ۱", "lang": "prs"}).status_code == 200


def test_online_limits_count_each_learner_behind_one_address(online):
    q = {"text": "۲ + ۲", "lang": "prs", "year": 7}
    a, b = join(online), join(online)
    for _ in range(online.hub.ask_limit.n):
        assert online.post("/api/ask", json=q, headers=a).status_code == 200
    assert online.post("/api/ask", json=q, headers=a).status_code == 429
    assert online.post("/api/ask", json=q, headers=b).status_code == 200        # her sister, the same address


def test_hub_limits_count_the_phone(hub_client):
    a = {"X-Learner-Token": "a" * 32}
    for _ in range(hub_client.hub.ask_limit.n):
        hub_client.post("/api/ask", json={"text": "۱ + ۱", "lang": "prs"}, headers=a)
    # another token from the same phone does not get a fresh allowance on the hub
    assert hub_client.post("/api/ask", json={"text": "۱ + ۱", "lang": "prs"},
                           headers={"X-Learner-Token": "b" * 32}).status_code == 429


def test_cors_is_narrowed_online(online):
    pre = {"Access-Control-Request-Method": "POST"}
    ok = online.options("/api/hello", headers={"Origin": "https://app.example.org", **pre})
    assert ok.headers.get("access-control-allow-origin") == "https://app.example.org"
    other = online.get("/api/hello", headers={"Origin": "https://elsewhere.example"})
    assert "access-control-allow-origin" not in other.headers


def test_the_hub_allows_any_origin(hub_client):
    assert hub_client.get("/api/hello", headers={"Origin": "http://anything"}).headers["access-control-allow-origin"] == "*"
