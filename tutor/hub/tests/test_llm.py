"""The model client: a model server that answers in an unexpected shape sends the question on; Ask never breaks."""
import httpx
import pytest

from tutor_hub.llm import LLM

pytestmark = pytest.mark.anyio


class Reply:
    def __init__(self, body):
        self.body = body

    def raise_for_status(self):
        pass

    def json(self):
        return self.body


def model():
    return LLM("http://127.0.0.1:8081/v1", "current", 5, None)


def replies(monkeypatch, body):
    async def post(self, *a, **kw):
        return Reply(body)
    monkeypatch.setattr(httpx.AsyncClient, "post", post)


@pytest.mark.parametrize("body", [{"choices": None}, {"choices": [{"message": "hi"}]}, [],
                                  {"choices": [{"message": {"content": [{"type": "text", "text": "hi"}]}}]}])
async def test_odd_replies_give_no_answer(monkeypatch, body):
    replies(monkeypatch, body)
    assert await model().chat([{"role": "user", "content": "?"}]) is None


async def test_reasoning_is_dropped(monkeypatch):
    replies(monkeypatch, {"choices": [{"message": {"content": "<think>hmm</think> ۳/۴"}}]})
    assert await model().chat([{"role": "user", "content": "?"}]) == "۳/۴"
