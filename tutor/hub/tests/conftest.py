from pathlib import Path

import pytest

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
                           copies_per_hour=12, wifi_ssid="Qalam", wifi_password="learn1234")


@pytest.fixture
def hub_client(cfg):
    from fastapi.testclient import TestClient

    from tutor_hub.server import create_app, teacher_pin
    app = create_app(cfg)
    with TestClient(app) as c:
        c.pin = teacher_pin(cfg.data)
        c.hub = app.state.hub
        yield c


class FakeModel:
    """Stands in for the local model server."""

    def __init__(self, reply="", up=True):
        self.reply, self.up, self.asked = reply, up, []

    async def available(self):
        return self.up

    async def chat(self, messages, **kw):
        self.asked.append(messages)
        return self.reply


@pytest.fixture
def fake_model():
    return FakeModel


@pytest.fixture
def anyio_backend():
    return "asyncio"            # the hub runs on asyncio (uvicorn); trio is not used
