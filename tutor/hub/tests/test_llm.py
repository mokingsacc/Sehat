"""The model client: a model server that answers in an unexpected shape sends the question on; Ask never breaks."""
import httpx
import pytest

from tutor_hub.llm import LLM


class Reply:
    def __init__(self, body):
        self.body = body

    def raise_for_status(self):
        pass

    def json(self):
        return self.body


def model():
    return LLM("http://127.0.0.1:8081/v1", "current", 5, None)


@pytest.mark.parametrize("body", [{"choices": None}, {"choices": [{"message": "hi"}]}, [],
                                  {"choices": [{"message": {"content": [{"type": "text", "text": "hi"}]}}]}])
def test_odd_replies_give_no_answer(monkeypatch, body):
    monkeypatch.setattr(httpx, "post", lambda *a, **kw: Reply(body))
    assert model().chat([{"role": "user", "content": "?"}]) is None


def test_reasoning_is_dropped(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *a, **kw: Reply({"choices": [{"message": {"content": "<think>hmm</think> ۳/۴"}}]}))
    assert model().chat([{"role": "user", "content": "?"}]) == "۳/۴"
