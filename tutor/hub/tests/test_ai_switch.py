"""The AI provider switch (17 Oct 2026): a cohort picks its provider and model in the admin panel, saved through the
cohort's settings and admin_log and used from the next request; keys come only from secrets or the environment and
no API returns one; the identifier filter and the budget hold for every provider; and the request each provider
sends, checked against a fake HTTP server (httpx.MockTransport: nothing leaves the test)."""
import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from tutor_hub.ai import Gateway, make_provider
from tutor_hub.ai.fake import FakeProvider
from tutor_hub.ai.gateway import today
from tutor_hub.ai.providers import AnthropicProvider, HttpProvider
from tutor_hub.server import admin_pin, create_app

from test_admin import HUB, get, post

KEYS = {"openai_key": "sk-openai-NOT-REAL-1111", "anthropic_key": "sk-ant-NOT-REAL-2222",
        "gemini_key": "gm-NOT-REAL-3333", "compat_key": "tg-NOT-REAL-4444"}
ASK = [{"role": "system", "content": "You are a tutor."},
       {"role": "user", "content": "my phone is 0799 123 4567, why is 1/2 + 1/4 = 3/4?"}]


class FakeServer:
    """An OpenAI- or Anthropic-shaped model server: records each request and answers in that API's shape."""

    def __init__(self, status=200):
        self.seen, self.status = [], status

    def handler(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        self.seen.append({"url": str(request.url), "headers": dict(request.headers), "body": body})
        if self.status != 200:
            return httpx.Response(self.status, json={"error": {"message": "no"}})
        if request.url.path.endswith("/v1/messages"):
            return httpx.Response(200, json={"content": [{"type": "thinking", "thinking": ""},
                                                         {"type": "text", "text": "Look at the quarters."}],
                                             "usage": {"input_tokens": 40, "output_tokens": 6}})
        return httpx.Response(200, json={"choices": [{"message": {"content": "Look at the quarters."}}],
                                         "usage": {"prompt_tokens": 30, "completion_tokens": 5}})

    def attach(self, provider):
        client = httpx.AsyncClient(transport=httpx.MockTransport(self.handler))
        if isinstance(provider, AnthropicProvider):
            provider._client = client
        else:
            provider.client._client = client
        return provider


@pytest.fixture
def hub(cfg):
    cfg.ai_provider = "fake"
    cfg.compat_url, cfg.compat_model = "https://api.together.example/v1", "an-open-weight-model"
    for k, v in KEYS.items():
        setattr(cfg, k, v)
    with TestClient(create_app(cfg)) as c:
        c.hub = c.app.state.hub
        c.fake = c.hub.gateway.provider = FakeProvider()
        c.pin = {"X-Admin-Pin": admin_pin(cfg.data)}
        c.server = FakeServer()
        made = c.hub.gateway.make
        c.hub.gateway.make = lambda name, model: c.server.attach(made(name, model)) if name != "fake" else made(name, model)
        yield c


def call(c, **kw):
    return asyncio.run(c.hub.gateway.call("explain", ASK, module="ask", lang="en", cohort=HUB, **kw))


# per cohort, from the next request

def test_a_cohort_picks_its_provider_and_model_and_the_next_request_uses_it(hub):
    assert call(hub).why == "ok" and hub.fake.sent and not hub.server.seen          # the hub's default: the fake
    out = post(hub, f"/cohorts/{HUB}/settings", {"settings": {"ai_provider": "anthropic", "ai_model": "model-a"}})
    assert out["changed"] == "ai_model unset -> model-a; ai_provider unset -> anthropic"
    r = call(hub)
    assert r.why == "ok" and r.text == "Look at the quarters." and len(hub.server.seen) == 1
    assert hub.server.seen[0]["body"]["model"] == "model-a"
    rows = asyncio.run(hub.hub.store.ai_usage(HUB))
    assert any(x["provider"] == "anthropic" and x["model"] == "model-a" for x in rows), rows
    post(hub, f"/cohorts/{HUB}/settings", {"settings": {"ai_provider": "openai_compat", "ai_model": None}})
    call(hub)
    assert hub.server.seen[-1]["url"] == "https://api.together.example/v1/chat/completions"
    assert hub.server.seen[-1]["body"]["model"] == "an-open-weight-model"                # TUTOR_COMPAT_MODEL
    post(hub, f"/cohorts/{HUB}/settings", {"settings": {"ai_provider": None}})
    n = len(hub.server.seen)
    call(hub)
    assert len(hub.server.seen) == n                                                     # back on the default
    lines = [x["detail"] for x in get(hub, f"/log?cohort={HUB}")["log"] if x["what"] == "cohort.settings"]
    assert lines[:3] == ["ai_provider openai_compat -> unset",
                         "ai_model model-a -> unset; ai_provider anthropic -> openai_compat",
                         "ai_model unset -> model-a; ai_provider unset -> anthropic"]


@pytest.mark.parametrize("name", ["openai", "anthropic", "gemini", "openai_compat"])
def test_every_provider_gets_the_scrubbed_words_and_keeps_to_the_budget(hub, name):
    post(hub, f"/cohorts/{HUB}/settings", {"settings": {"ai_provider": name}})
    assert call(hub).why == "ok"
    sent = json.dumps(hub.server.seen[-1]["body"])
    assert "0799" not in sent and "4567" not in sent and "[number]" in sent              # the identifier filter
    assert asyncio.run(hub.hub.store.ai_spent(HUB, today()))["tokens"] > 0
    post(hub, f"/cohorts/{HUB}/settings", {"settings": {"ai_budget": 1}})
    n = len(hub.server.seen)
    assert call(hub).why == "budget" and len(hub.server.seen) == n                      # nothing sent


def test_the_panel_refuses_a_provider_it_cannot_make_and_logs_nothing(hub):
    hub.hub.cfg.compat_url = None
    for bad in ({"ai_provider": "claude"}, {"ai_provider": "openai_compat"}, {"ai_provider": "local"},
                {"ai_model": "a model; drop"}, {"ai_model": 7}):
        r = hub.post(f"/api/m/admin/cohorts/{HUB}/settings", headers=hub.pin, json={"settings": bad})
        assert r.status_code == 422, bad
    assert not [x for x in get(hub, f"/log?cohort={HUB}")["log"] if x["what"] == "cohort.settings"]


def test_a_provider_without_its_key_is_off_for_that_cohort_only(hub):
    hub.hub.cfg.gemini_key = None
    post(hub, f"/cohorts/{HUB}/settings", {"settings": {"ai_provider": "gemini"}})
    assert hub.get(f"/api/hello?cohort={HUB}").json()["ai"]["on"] is False
    assert call(hub).why == "off" and not hub.server.seen
    assert get(hub, f"/cohorts/{HUB}")["ai_choice"]["keys"]["gemini"] is False


# keys

def test_no_api_ever_returns_a_key(hub):
    post(hub, f"/cohorts/{HUB}/settings", {"settings": {"ai_provider": "anthropic"}})
    call(hub)
    c = get(hub, f"/cohorts/{HUB}")
    assert c["ai_choice"]["keys"] == {"openai": True, "anthropic": True, "gemini": True, "openai_compat": True}
    assert c["ai_choice"]["compat_host"] == "api.together.example" and c["ai_choice"]["default"] == "fake"
    texts = [hub.get("/api/m/admin" + p, headers=hub.pin).text
             for p in ("/me", "/cohorts", f"/cohorts/{HUB}", "/content", "/wishes", "/spend", "/safety", "/log")]
    texts += [hub.get(f"/api/hello?cohort={HUB}").text, json.dumps(hub.hub.store.sync.cohort(HUB))]
    for t in texts:
        for key in KEYS.values():
            assert key not in t
    assert all(k not in repr(hub.hub.cfg) for k in KEYS.values())


def test_keys_come_only_from_the_environment(monkeypatch, tmp_path):
    from tutor_hub.config import Config
    for env, attr in (("OPENAI_API_KEY", "openai_key"), ("ANTHROPIC_API_KEY", "anthropic_key"),
                      ("GEMINI_API_KEY", "gemini_key"), ("TUTOR_COMPAT_API_KEY", "compat_key")):
        monkeypatch.setenv(env, "from-env-" + attr)
        assert getattr(Config.from_env(data=tmp_path), attr) == "from-env-" + attr
        monkeypatch.delenv(env)
        assert getattr(Config.from_env(data=tmp_path), attr) is None


# the requests, as each provider sends them


@pytest.mark.anyio
async def test_claudes_request_is_the_messages_api_shape(cfg):
    cfg.anthropic_key = KEYS["anthropic_key"]
    server = FakeServer()
    p = server.attach(make_provider(cfg, "anthropic", None))
    assert p.model == cfg.anthropic_model
    r = await Gateway(p).call("read_sheet", ASK, module="photo", lang="en", images=[b"\xff\xd8jpeg"], max_tokens=60)
    assert r.why == "ok" and r.text == "Look at the quarters."
    req = server.seen[0]
    assert req["url"] == "https://api.anthropic.com/v1/messages"
    assert req["headers"]["x-api-key"] == KEYS["anthropic_key"] and req["headers"]["anthropic-version"] == "2023-06-01"
    body = req["body"]
    assert body["system"] == "You are a tutor." and body["model"] == cfg.anthropic_model
    assert body["max_tokens"] > 60 and "temperature" not in body
    user = body["messages"][0]
    assert user["role"] == "user" and user["content"][0]["type"] == "text"
    assert user["content"][1] == {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                                              "data": "/9hqcGVn"}}
    assert [m["role"] for m in body["messages"]] == ["user"]


@pytest.mark.anyio
async def test_a_failed_claude_call_is_quiet_and_never_logs_the_key(cfg, caplog):
    cfg.anthropic_key = KEYS["anthropic_key"]
    server = FakeServer(status=500)
    p = server.attach(make_provider(cfg, "anthropic", None))
    assert (await Gateway(p).call("explain", ASK, module="ask", lang="en")).why == "error"
    assert KEYS["anthropic_key"] not in caplog.text and "HTTP 500" in caplog.text


@pytest.mark.anyio
@pytest.mark.parametrize("name,url", [("openai_compat", "https://api.together.example/v1/chat/completions"),
                                      ("gemini", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"),
                                      ("openai", "https://api.openai.com/v1/chat/completions")])
async def test_openai_shaped_requests_go_to_their_base_url_with_their_own_key(cfg, name, url):
    cfg.compat_url, cfg.compat_model = "https://api.together.example/v1", "an-open-weight-model"
    for k, v in KEYS.items():
        setattr(cfg, k, v)
    server = FakeServer()
    p = server.attach(make_provider(cfg, name, "model-b"))
    assert isinstance(p, HttpProvider) and await p.available()
    r = await Gateway(p).call("read_sheet", ASK, module="photo", lang="en", images=[b"\xff\xd8jpeg"])
    assert r.why == "ok"
    req = server.seen[0]
    key = {"openai": "openai_key", "gemini": "gemini_key", "openai_compat": "compat_key"}[name]
    assert req["url"] == url and req["headers"]["authorization"] == "Bearer " + KEYS[key]
    body = req["body"]
    assert body["model"] == "model-b" and body["messages"][0] == {"role": "system", "content": "You are a tutor."}
    parts = body["messages"][1]["content"]
    assert parts[0]["type"] == "text" and parts[1]["image_url"]["url"].startswith("data:image/jpeg;base64,")
    assert ("store" in body) is (name == "openai")           # only OpenAI is asked not to keep a picture
