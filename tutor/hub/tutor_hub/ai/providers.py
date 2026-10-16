"""Providers: what actually answers a gateway call. Each checks the policy again before anything leaves.

- `HttpProvider` speaks the OpenAI chat API: `local` (a model server on the hub) or `openai` (online; switched on
  with a key after 20 January 2027, P18). Pictures (`read_sheet`, P14) go inline in the last user message as JPEG
  data URIs, never through a files API, and the request asks the provider not to keep it (`store: false`).
- `FakeProvider` (fake.py) answers from a script, for tests and for staging until a key exists.
`make_provider(cfg)` picks one from TUTOR_AI_PROVIDER and refuses, at start-up, one the policy does not allow.
"""
import base64
from dataclasses import dataclass

from .. import llm as llm_mod
from . import policy


class ProviderError(RuntimeError):
    """The provider did not answer (it failed, or refused the request)."""


@dataclass
class Reply:
    text: str | None
    tokens_in: int = 0
    tokens_out: int = 0


class Provider:
    name = "none"
    url: str | None = None
    model = "none"
    # millionths of a US dollar per token, in and out; zero for the hub's own model and the fake (P18 sets OpenAI's)
    price_in = 0.0
    price_out = 0.0

    async def available(self) -> bool:
        raise NotImplementedError

    async def complete(self, purpose: str, messages: list[dict], *, max_tokens: int = 350, temperature: float = 0.2,
                       images: list[bytes] | None = None) -> Reply:
        raise NotImplementedError

    async def aclose(self) -> None:
        pass

    def cost_micro(self, reply: Reply) -> int:
        return round(reply.tokens_in * self.price_in + reply.tokens_out * self.price_out)


class HttpProvider(Provider):
    def __init__(self, name: str, url: str, model: str, timeout: float, key: str | None = None):
        policy.check_provider(name, url)
        self.name, self.url, self.model, self.key = name, url, model, key
        self.client = llm_mod.LLM(url, model, timeout, key)

    async def available(self) -> bool:
        if self.name == "openai":
            return bool(self.key)               # never asked over the network just to say hello
        return await self.client.available()

    async def complete(self, purpose, messages, *, max_tokens=350, temperature=0.2, images=None) -> Reply:
        policy.check(self.name, self.url, purpose)
        extra = None
        if images:
            messages = with_images(messages, images)
            extra = {"store": False}
        text, used = await self.client.complete(messages, max_tokens, temperature, extra=extra)
        return Reply(text, used["in"], used["out"])

    async def aclose(self):
        await self.client.aclose()


def with_images(messages: list[dict], images: list[bytes]) -> list[dict]:
    """The messages with the pictures added to the last user message, in the chat API's parts: its text, then each
    picture as a JPEG data URI. Nothing is uploaded on its own; the bytes exist only in this request."""
    out = [dict(m) for m in messages]
    last = max((i for i, m in enumerate(out) if m.get("role") == "user"), default=None)
    if last is None:
        out.append({"role": "user", "content": []})
        last = len(out) - 1
    text = out[last].get("content")
    parts = [{"type": "text", "text": text}] if isinstance(text, str) and text else list(text or [])
    parts += [{"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(b).decode("ascii"),
                                                  "detail": "high"}} for b in images]
    out[last] = dict(out[last], content=parts)
    return out


def make_provider(cfg) -> Provider | None:
    """The provider TUTOR_AI_PROVIDER names (empty: `local` when TUTOR_LLM_URL is set, else none); None means no AI."""
    from .fake import FakeProvider
    name = (cfg.ai_provider or ("local" if cfg.llm_url else "off")).strip().lower()
    if name in ("off", "none"):
        return None
    if name == "fake":
        policy.check_provider("fake", None)
        return FakeProvider()
    if name == "local":
        if not cfg.llm_url:
            raise policy.PolicyError("the local provider needs TUTOR_LLM_URL")
        return HttpProvider("local", cfg.llm_url, cfg.llm_model, cfg.llm_timeout, cfg.llm_key)
    if name == "openai":
        return HttpProvider("openai", cfg.llm_url or policy.OPENAI_URL, cfg.llm_model, cfg.llm_timeout, cfg.llm_key)
    policy.check_provider(name, cfg.llm_url)     # raises: not a provider for learners
    raise policy.PolicyError(f"{name!r} is not a provider for learners")
