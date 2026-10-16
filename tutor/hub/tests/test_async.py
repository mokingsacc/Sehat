"""The async seam: a slow model answering one phone does not hold up the others."""
import asyncio
import time

import httpx
import pytest

from tutor_hub.ai.fake import FakeProvider
from tutor_hub.server import create_app

pytestmark = pytest.mark.anyio


def slow_model():
    """A provider that takes 0.2 s for every answer, reached through the AI gateway."""
    return FakeProvider({"explain": "آسمان آبی است چون نور آفتاب در هوا پخش می‌شود."}, latency=0.2)


async def test_twenty_phones_ask_at_once(cfg):
    app = create_app(cfg)
    hub = app.state.hub
    async with app.router.lifespan_context(app):
        hub.gateway.provider = model = slow_model()

        async def ask(k):
            # each phone has its own address on the hub's Wi-Fi, so the per-phone limit is not what is tested here
            transport = httpx.ASGITransport(app=app, client=(f"10.42.0.{k + 10}", 50000))
            async with httpx.AsyncClient(transport=transport, base_url="http://hub") as phone:
                return await phone.post("/api/ask", json={"text": "چرا آسمان آبی است؟", "lang": "prs"})

        start = time.monotonic()
        answers = await asyncio.gather(*(ask(k) for k in range(20)))
        took = time.monotonic() - start

    assert [a.status_code for a in answers] == [200] * 20
    assert {a.json()["source"] for a in answers} == {"ai"} and len(model.sent) == 20
    assert took < 1.0, f"20 asks took {took:.2f} s: something still blocks (one at a time would take 4 s)"
