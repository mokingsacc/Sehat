"""The AI gateway (P5): provider policy, budgets, the identifier filter, the recorder, and Ask end to end on the fake."""
import asyncio
import hashlib
import json
import re

import pytest

from tutor_hub.ai import Gateway, PolicyError, make_provider
from tutor_hub.ai import filters, policy
from tutor_hub.ai.fake import FakeProvider
from tutor_hub.ai.providers import HttpProvider
from tutor_hub.server import create_app

from conftest import learner_of

# the AI provider switch (17 Oct 2026): any provider may serve any cohort, but each goes only to its own host
OTHER_HOSTS = ["https://api.anthropic.com/v1", "https://claude.ai/api", "https://generativelanguage.googleapis.com/v1",
               "https://api.example.com/v1", "https://api.openai.com.example.com/v1"]


# the policy

@pytest.mark.parametrize("url", OTHER_HOSTS)
@pytest.mark.parametrize("purpose", policy.PURPOSES)
@pytest.mark.parametrize("provider", ["openai", "local", "fake"])
def test_a_provider_goes_only_to_its_own_host_for_every_learner_purpose(url, purpose, provider):
    with pytest.raises(PolicyError):
        policy.check(provider, url, purpose)


@pytest.mark.parametrize("provider,home", [("openai", policy.OPENAI_URL), ("anthropic", policy.ANTHROPIC_URL),
                                           ("gemini", policy.GEMINI_URL)])
def test_each_online_provider_has_one_https_home(provider, home):
    for purpose in policy.PURPOSES:
        policy.check(provider, home, purpose)
    for url in (home.replace("https://", "http://"), "https://api.example.com/v1", "http://127.0.0.1:8081/v1", None):
        with pytest.raises(PolicyError):
            policy.check(provider, url, "explain")


@pytest.mark.parametrize("url,ok", [("https://api.together.example/v1", True), ("https://api.deepseek.com/v1", True),
                                    ("https://dashscope.aliyuncs.com/compatible-mode/v1", True),
                                    ("https://generativelanguage.googleapis.com/v1beta/openai", True),
                                    ("http://127.0.0.1:8081/v1", True), ("http://modelbox.lan/v1", True),
                                    ("http://api.example.com/v1", False), (None, False)])
def test_openai_compatible_goes_anywhere_over_https_or_on_the_hubs_network(url, ok):
    if ok:
        policy.check("openai_compat", url, "hint")
    else:
        with pytest.raises(PolicyError):
            policy.check("openai_compat", url, "hint")


@pytest.mark.parametrize("name", ["claude", "google", "vertex", "other"])
def test_other_providers_are_refused(cfg, name):
    cfg.ai_provider = name
    with pytest.raises(PolicyError):
        make_provider(cfg)


@pytest.mark.parametrize("provider,url", [("local", "https://api.anthropic.com/v1"),
                                          ("openai", "https://generativelanguage.googleapis.com/v1beta/openai")])
def test_a_hub_configured_for_a_host_not_its_providers_does_not_start(cfg, provider, url):
    cfg.ai_provider, cfg.llm_url = provider, url
    with pytest.raises(PolicyError):
        create_app(cfg)


@pytest.mark.anyio
async def test_a_wrong_host_raises_at_call_time_too_and_nothing_is_sent():
    p = HttpProvider("local", "http://127.0.0.1:8081/v1", "current", 5)
    p.url = "https://api.anthropic.com/v1"              # changed after start-up
    with pytest.raises(PolicyError):
        await Gateway(p).call("explain", [{"role": "user", "content": "why?"}], module="ask", lang="en")
    with pytest.raises(PolicyError):
        await p.complete("hint", [{"role": "user", "content": "why?"}])


@pytest.mark.parametrize("url,ok", [("http://127.0.0.1:8081/v1", True), ("http://10.42.0.1:8081/v1", True),
                                    ("http://localhost:8081/v1", True), ("http://qalam.lan/v1", True),
                                    ("http://modelbox:8081/v1", True), ("http://8.8.8.8/v1", False),
                                    ("https://api.example.com/v1", False)])
def test_the_local_provider_stays_on_the_hubs_network(url, ok):
    if ok:
        policy.check("local", url, "explain")
    else:
        with pytest.raises(PolicyError):
            policy.check("local", url, "explain")


def test_openai_only_at_its_own_https_host():
    policy.check("openai", policy.OPENAI_URL, "explain")
    for url in ("http://api.openai.com/v1", "https://openai.example.com/v1", None):
        with pytest.raises(PolicyError):
            policy.check("openai", url, "explain")
    with pytest.raises(PolicyError):
        policy.check("fake", "http://127.0.0.1/v1", "explain")


def test_choosing_the_provider(cfg):
    assert make_provider(cfg) is None                                  # no model server, no AI
    cfg.llm_url = "http://127.0.0.1:8081/v1"
    assert make_provider(cfg).name == "local"
    cfg.ai_provider = "off"
    assert make_provider(cfg) is None
    cfg.ai_provider = "fake"
    assert isinstance(make_provider(cfg), FakeProvider)
    cfg.ai_provider, cfg.llm_url = "openai", None
    p = make_provider(cfg)
    assert (p.name, p.url) == ("openai", policy.OPENAI_URL)


@pytest.mark.anyio
async def test_openai_without_a_key_is_simply_off(cfg):
    cfg.ai_provider = "openai"
    p = make_provider(cfg)
    assert await p.available() is False                                # and nothing went over the network
    r = await Gateway(p).call("explain", [{"role": "user", "content": "why?"}], module="ask", lang="en")
    assert (r.text, r.why) == (None, "off")


@pytest.mark.anyio
async def test_a_module_uses_only_the_purposes_its_manifest_lists(hub_client):
    g = Gateway(FakeProvider(), manifests=hub_client.hub.modules)
    msg = [{"role": "user", "content": "why?"}]
    assert (await g.call("explain", msg, module="ask", lang="en")).why == "ok"
    for purpose, module in (("hint", "ask"), ("explain", "print"), ("explain", "nosuchmodule"), ("chat", "ask")):
        with pytest.raises(PolicyError):
            await g.call(purpose, msg, module=module, lang="en")


# before and after a call

def ask(text="Why is the sky blue?"):
    return [{"role": "system", "content": "You are a tutor."}, {"role": "user", "content": text}]


@pytest.mark.anyio
async def test_untrusted_languages_and_rules_send_nothing():
    fake = FakeProvider()
    g = Gateway(fake, ai_langs=("prs", "en"))
    assert (await g.call("explain", ask("آسمان ولې شین دی؟"), module="ask", lang="ps")).why == "language"
    assert (await g.call("explain", ask("پدرم مرا می‌زند"), module="ask", lang="prs")).why == "rules"
    assert fake.sent == []


@pytest.mark.anyio
async def test_identifiers_never_leave():
    fake = FakeProvider()
    g = Gateway(fake)
    text = ("my name is Maryam, my brother Ahmad's phone is 0799 123 456 or ۰۷۹۹۱۲۳۴۵۶, write to maryam.a@example.com "
            "- why is 1/2 + 1/4 more than 1/2?")
    r = await g.call("explain", ask(text), module="ask", lang="en", names=("Ahmad",))
    assert r.why == "ok"
    sent = fake.sent_text()
    assert filters.find(sent, names=("Maryam", "Ahmad")) == []
    assert "Maryam" not in sent and "Ahmad" not in sent and "@" not in sent
    assert not re.search(r"\d(?:[\s\-.]?\d){6,}", sent)
    assert "1/2 + 1/4" in sent and "You are a tutor." in sent           # the question still reads


@pytest.mark.anyio
async def test_a_wrong_sum_is_dropped_and_a_right_one_marked():
    g = Gateway(FakeProvider({"explain": ["1/2 + 1/3 = 2/5", "1/3 + 1/6 = 1/2"]}))
    assert (await g.call("explain", ask(), module="ask", lang="en")).why == "maths"
    r = await g.call("explain", ask(), module="ask", lang="en")
    assert r.why == "ok" and r.maths_checked == 1 and "$1/3 + 1/6 = 1/2$" in r.text


@pytest.mark.anyio
async def test_a_hint_that_gives_the_answer_away_is_asked_again_once_then_dropped():
    fake = FakeProvider({"hint": ["It is ۰٫۷۵.", "Find a common denominator first."]})
    g = Gateway(fake)
    r = await g.call("hint", ask("1/2 + 1/4?"), module="homework", lang="en", answers=["3/4"])
    assert (r.text, len(fake.sent)) == ("Find a common denominator first.", 2)
    fake = FakeProvider({"hint": ["The answer is 3/4.", "Six eighths, so 0.75."]})
    r = await Gateway(fake).call("hint", ask("1/2 + 1/4?"), module="homework", lang="en", answers=["3/4"])
    assert (r.text, r.why, len(fake.sent)) == (None, "leak", 2)


@pytest.mark.anyio
async def test_errors_and_timeouts_are_quiet():
    r = await Gateway(FakeProvider(fail="error")).call("explain", ask(), module="ask", lang="en")
    assert (r.text, r.why) == (None, "error")
    r = await Gateway(FakeProvider(fail="timeout"), timeout=0.05).call("explain", ask(), module="ask", lang="en")
    assert (r.text, r.why) == (None, "timeout")
    r = await Gateway(FakeProvider(up=False)).call("explain", ask(), module="ask", lang="en")
    assert (r.text, r.why) == (None, "off")


@pytest.mark.anyio
async def test_the_vision_fake_reads_fixture_pictures_and_records_only_their_hashes(tmp_path):
    strip = b"\xff\xd8 answer cells \xff\xd9"
    sha = hashlib.sha256(strip).hexdigest()
    (tmp_path / "fixtures.json").write_text(json.dumps({"vision": {sha: {"1": "3/4", "2": "5"}}}), encoding="utf-8")
    fake = FakeProvider.from_json(tmp_path / "fixtures.json")
    msg = [{"role": "user", "content": [{"type": "text", "text": "Read the cells."}]}]
    r = await Gateway(fake).call("read_sheet", msg, module="photo", lang="en", images=[strip, b"unknown"])
    assert json.loads(r.text) == [{"1": "3/4", "2": "5"}, None]
    assert fake.sent[0]["images"] == [sha, hashlib.sha256(b"unknown").hexdigest()]
    assert strip not in json.dumps(fake.sent, default=str).encode()


@pytest.mark.anyio
async def test_slow_replies_still_arrive():
    fake = FakeProvider({"explain": "Light scatters."}, latency=0.05)
    start = asyncio.get_running_loop().time()
    assert (await Gateway(fake).call("explain", ask(), module="ask", lang="en")).text == "Light scatters."
    assert asyncio.get_running_loop().time() - start >= 0.05


# the filters on their own

@pytest.mark.parametrize("text,kinds", [
    ("اسم من مریم است. کسر چیست؟", ["name"]), ("اسمم مریم است", ["name"]), ("زما نوم مریم دی", ["name"]),
    ("call me on +93 799 123 456", ["number"]), ("شماره‌ام ۰۷۹۹۱۲۳۴۵۶ است", ["number"]),
    ("me@mail.af", ["email"]), ("۱/۲ + ۱/۴ چند می‌شود؟", []), ("12 + 345 = 357", []), ("the year 1405", []),
    ("what is 3.14159?", []),
])
def test_scrub_finds_identifiers_and_leaves_sums(text, kinds):
    out, found = filters.scrub(text)
    assert found == kinds
    assert filters.find(out) == []


@pytest.mark.parametrize("text,leak", [("It is 3/4.", True), ("It is ۳/۴.", True), ("0.75", True), ("۰٫۷۵", True),
                                       ("6/8 of the cake", True), ("Add 1/2 and 1/4.", False),
                                       ("Use the denominator 4.", False)])
def test_leaks(text, leak):
    assert filters.leaks(text, ["3/4"]) is leak


# through the hub

@pytest.fixture
def fake_hub(cfg):
    from fastapi.testclient import TestClient
    cfg.ai_provider = "fake"
    app = create_app(cfg)
    with TestClient(app) as c:
        c.hub = app.state.hub
        yield c


def usage(c):
    return c.portal.call(c.hub.store.ai_usage, c.hub.cohort_id)


def test_ask_works_end_to_end_on_the_fake(fake_hub):
    assert fake_hub.get("/api/hello").json()["ai"] == {"on": True, "langs": ["prs", "en"]}
    a = fake_hub.post("/api/ask", json={"text": "چرا آسمان آبی است؟", "lang": "prs", "year": 8}).json()
    assert a["source"] == "ai" and "practice answer" in a["text"]
    sent = fake_hub.hub.gateway.provider.sent
    assert [r["purpose"] for r in sent] == ["explain"] and sent[0]["messages"][-1]["content"] == "چرا آسمان آبی است؟"
    rows = usage(fake_hub)
    assert [(r["module"], r["purpose"], r["provider"], r["calls"]) for r in rows] == [("ask", "explain", "fake", 1)]
    assert rows[0]["tokens"] > 0 and rows[0]["cost_micro"] == 0
    assert set(rows[0]) == {"day", "cohort", "module", "purpose", "provider", "model", "calls", "tokens", "cost_micro",
                            "held"}


def test_the_recorder_finds_no_nickname_or_digit_run(fake_hub):
    fake_hub.post("/api/ask", json={"text": "my name is Maryam and my number is 0799123456: why do we sneeze dust?",
                                    "lang": "en"})
    sent = fake_hub.hub.gateway.provider.sent_text()
    assert sent and "Maryam" not in sent and not re.search(r"\d{7,}", sent)
    assert filters.find(sent) == []


def test_an_over_budget_cohort_gets_checked_answers_and_the_teacher_never_an_error(fake_hub):
    fake_hub.hub.gateway.budget = 1                        # one call uses it up
    first = fake_hub.post("/api/ask", json={"text": "چرا آسمان آبی است؟", "lang": "prs"})
    assert first.json()["source"] == "ai"
    later = fake_hub.post("/api/ask", json={"text": "زلزله چرا می‌آید؟", "lang": "prs"})
    assert later.status_code == 200 and later.json()["source"] == "none" and later.json()["waiting"]
    checked = fake_hub.post("/api/ask", json={"text": "مخرج مشترک چیست؟", "lang": "prs"}).json()
    assert checked["source"] == "bank" and checked["checked"]
    assert len(fake_hub.hub.gateway.provider.sent) == 1 and usage(fake_hub)[0]["calls"] == 1


def test_a_budget_of_nothing_means_no_ai(fake_hub):
    fake_hub.hub.gateway.budget = 0
    a = fake_hub.post("/api/ask", json={"text": "زلزله چرا می‌آید؟", "lang": "prs"}).json()
    assert a["source"] == "none" and fake_hub.hub.gateway.provider.sent == []


def test_budgets_are_per_cohort(fake_hub):
    fake_hub.hub.gateway.budget = 1
    fake_hub.post("/api/ask", json={"text": "چرا آسمان آبی است؟", "lang": "prs"})
    other = fake_hub.hub.seeds["staging"]["id"]
    a = fake_hub.post("/api/ask", json={"text": "زلزله چرا می‌آید؟", "lang": "prs"},
                      headers=learner_of(fake_hub, other)).json()
    assert a["source"] == "ai"
    assert fake_hub.portal.call(fake_hub.hub.store.ai_spent, other, rows_day(fake_hub))["calls"] == 1


def rows_day(c):
    return usage(c)[0]["day"]


def test_a_failing_provider_never_breaks_ask(fake_hub):
    fake_hub.hub.gateway.provider.fail = "error"
    a = fake_hub.post("/api/ask", json={"text": "زلزله چرا می‌آید؟", "lang": "prs"})
    assert a.status_code == 200 and a.json()["source"] == "none"
