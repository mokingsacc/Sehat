"""The fake provider: everything is built and tested on it, and staging uses it until a key exists (BUILD-PLAN 3.7).

- Scripted replies per purpose: a string, a list (one per call, the last one repeating) or a function of the
  messages. Purposes without a script get a short, plainly marked practice reply.
- Latency, errors and timeouts on request: `latency` seconds before each reply; `fail="error"` raises ProviderError,
  `fail="timeout"` never answers (the gateway's timeout ends the call).
- Vision: `read_sheet` "reads" a picture by looking up its SHA-256 in `vision` (a fixture JSON maps each fixture
  image to what a model would read) and answers that as JSON; an unknown picture reads as nothing.
- The recorder: `sent` holds every request exactly as it would leave the hub (purpose, messages, picture hashes,
  limits), so tests check what a real provider would have been sent.
"""
import asyncio
import copy
import hashlib
import json
from pathlib import Path

from .providers import Provider, ProviderError, Reply

def practice_hint(messages) -> str:
    """Homework help's calls (brain.py) on the fake: a private answer, then three plainly marked practice hints."""
    said = " ".join(str(m.get("content", "")) for m in messages)
    if "ANSWER:" in said:
        return "ANSWER: practice"
    if "three hints" in said:
        return json.dumps(["Practice hint 1 from the test AI.", "Practice hint 2 from the test AI.",
                           "Practice hint 3 from the test AI."])
    return "Look again at the first step of the lesson."


PRACTICE = {
    "explain": "This is a practice answer from the test AI. A teacher will check real answers.",
    "hint": practice_hint,
    "plan": "[]",
    "screen": "ok",
}


def tokens(text: str) -> int:
    """A rough count, about four characters a token, so budgets can be tested."""
    return len(text) // 4 + 1


class FakeProvider(Provider):
    name = "fake"
    model = "fake"

    def __init__(self, replies: dict | None = None, *, up: bool = True, latency: float = 0.0, fail: str | None = None,
                 vision: dict | None = None):
        self.replies = dict(replies or {})
        self.up, self.latency, self.fail = up, latency, fail
        self.vision = dict(vision or {})
        self.sent: list[dict] = []
        self._calls: dict[str, int] = {}

    @classmethod
    def from_json(cls, path: Path | str, **kw) -> "FakeProvider":
        """A fixture file: {"replies": {purpose: reply}, "vision": {sha256: what is read}}."""
        d = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(d.get("replies"), vision=d.get("vision"), **kw)

    async def available(self) -> bool:
        return self.up

    def _script(self, purpose: str, messages: list[dict]) -> str:
        r = self.replies.get(purpose, PRACTICE.get(purpose, ""))
        n = self._calls[purpose] = self._calls.get(purpose, 0) + 1
        if callable(r):
            return r(messages)
        if isinstance(r, list):
            return r[min(n, len(r)) - 1] if r else ""
        return r

    async def complete(self, purpose, messages, *, max_tokens=350, temperature=0.2, images=None) -> Reply:
        pictures = [hashlib.sha256(b).hexdigest() for b in images or []]
        self.sent.append({"purpose": purpose, "messages": copy.deepcopy(messages), "images": pictures,
                          "max_tokens": max_tokens, "temperature": temperature})
        if self.latency:
            await asyncio.sleep(self.latency)
        if self.fail == "error":
            raise ProviderError("the fake provider failed, as the test asked")
        if self.fail == "timeout":
            await asyncio.Event().wait()             # never answers
        if purpose == "read_sheet":
            text = json.dumps([self.vision.get(h) for h in pictures], ensure_ascii=False)
        else:
            text = self._script(purpose, messages)
        sent = sum(tokens(str(m.get("content", ""))) for m in messages) + 85 * len(pictures)
        return Reply(text or None, sent, tokens(text or ""))

    def sent_text(self) -> str:
        """Everything the recorder holds, as one string, for scans."""
        return "\n".join(str(m.get("content", "")) for r in self.sent for m in r["messages"])
