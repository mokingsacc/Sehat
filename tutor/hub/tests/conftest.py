from pathlib import Path

import httpx
import pytest

from tutor_hub.ai.fake import FakeProvider
from tutor_hub.config import Config
from tutor_hub.packs import Library

TUTOR = Path(__file__).resolve().parents[2]
PACKS = TUTOR / "content" / "packs"


@pytest.fixture(scope="session")
def library():
    lib = Library(PACKS)
    assert not lib.problems, lib.problems
    return lib


@pytest.fixture
def cfg(tmp_path):
    return Config.from_env(data=tmp_path / "data", print_backend="outbox", llm_url=None, free_copies=3,
                           copies_per_hour=12, wifi_ssid="Qalam", wifi_password="learn1234",
                           openai_key=None, anthropic_key=None, gemini_key=None, compat_key=None)  # none from the shell


@pytest.fixture
def hub_client(cfg):
    from fastapi.testclient import TestClient

    from tutor_hub.server import create_app, teacher_pin
    app = create_app(cfg)
    with TestClient(app) as c:
        c.pin = teacher_pin(cfg.data)
        c.hub = app.state.hub
        yield c


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """No test reaches the network: a real HTTP connection fails at once. In-process apps (TestClient,
    httpx.ASGITransport) and tests that stub the client still work."""
    def refuse(self, request, *a, **kw):
        raise AssertionError(f"a test tried to reach the network: {request.url}")

    async def refuse_async(self, request, *a, **kw):
        refuse(self, request)
    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", refuse)
    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", refuse_async)


@pytest.fixture
def fake_ai():
    """The fake provider class (tutor_hub/ai/fake.py): FakeProvider({"explain": "..."}, up=..., latency=...)."""
    return FakeProvider


@pytest.fixture
def anyio_backend():
    return "asyncio"            # the hub runs on asyncio (uvicorn); trio is not used


def learner_of(c, cohort: str, band: str = "s1", consent: bool = True) -> dict:
    """The headers of a new learner in `cohort` (made in the store, as a class code would): since C5 (H1) a request
    acts in another class only with a token of that class, never through `?cohort=`."""
    from tutor_hub import learners
    tok = learners.new_token()
    extra = {"consent_kind": "self", "consent_version": c.hub.consent_version, "consent_at": learners.minute()} \
        if consent else {}
    c.hub.store.sync.add_learner(token_hash=learners.token_hash(tok), cohort=cohort, picture="key", band=band, **extra)
    return {"X-Learner-Token": tok}
