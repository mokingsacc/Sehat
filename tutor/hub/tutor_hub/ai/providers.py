"""Providers: what actually answers a gateway call. Each checks the policy again before anything leaves.

- `HttpProvider` speaks the OpenAI chat API: `local` (a model server on the hub), `openai`, `gemini` (the Gemini
  API's OpenAI-compatible endpoint) and `openai_compat` (any OpenAI-compatible server at TUTOR_COMPAT_URL). Pictures
  (`read_sheet`, P14) go inline in the last user message as JPEG data URIs, never through a files API; OpenAI is
  also asked not to keep the request (`store: false`).
- `AnthropicProvider` speaks Claude's Messages API over plain HTTPS with httpx, the client llm.py uses.
- `FakeProvider` (fake.py) answers from a script, for tests and for staging's default.
`make_provider(cfg)` picks the hub's default from TUTOR_AI_PROVIDER and refuses, at start-up, one the policy does not
allow; `make_provider(cfg, name, model)` makes a cohort's own choice (the admin panel's AI provider, P21). Keys come
only from cfg (Worker secrets or environment variables): a provider without its key is simply off, never pinged.
"""
import base64
from dataclasses import dataclass

import httpx

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
        if self.name == "local" or (self.name == "openai_compat" and policy.local_host(policy.host_of(self.url))):
            return await self.client.available()
        return bool(self.key)                   # online: never asked over the network just to say hello

    async def complete(self, purpose, messages, *, max_tokens=350, temperature=0.2, images=None) -> Reply:
        policy.check(self.name, self.url, purpose)
        extra = None
        if images:
            messages = with_images(messages, images)
            extra = {"store": False} if self.name == "openai" else None
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


ANTHROPIC_VERSION = "2023-06-01"
THINKING_ROOM = 1024                            # Claude may think before it answers: room for that above max_tokens


class AnthropicProvider(Provider):
    """Claude's Messages API (POST /v1/messages). System messages become `system`; pictures go in the last user
    message as base64 JPEG blocks. No sampling settings are sent (some models refuse them); effort is low."""
    name = "anthropic"

    def __init__(self, url: str, model: str, timeout: float, key: str | None = None):
        policy.check_provider("anthropic", url)
        self.url, self.model, self.timeout, self.key = url.rstrip("/"), model, timeout, key
        self._client: httpx.AsyncClient | None = None

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient()
        return self._client

    async def available(self) -> bool:
        return bool(self.key)

    async def complete(self, purpose, messages, *, max_tokens=350, temperature=0.2, images=None) -> Reply:
        policy.check(self.name, self.url, purpose)
        if not self.key:
            raise ProviderError("no key")
        body = anthropic_body(self.model, messages, max_tokens, images)
        try:
            r = await self._http().post(f"{self.url}/v1/messages", json=body, timeout=self.timeout,
                                        headers={"x-api-key": self.key, "anthropic-version": ANTHROPIC_VERSION})
            r.raise_for_status()
            data = r.json()
            blocks = data.get("content") or []
            text = "".join(b["text"] for b in blocks if isinstance(b, dict) and b.get("type") == "text"
                           and isinstance(b.get("text"), str)).strip()
        except httpx.HTTPStatusError as e:
            raise ProviderError(f"HTTP {e.response.status_code}") from None      # never the request or its key
        except (httpx.HTTPError, ValueError, TypeError, AttributeError) as e:
            raise ProviderError(type(e).__name__) from None
        usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
        n = [v if type(v) is int and v >= 0 else 0 for v in (usage.get("input_tokens"), usage.get("output_tokens"))]
        return Reply(text or None, n[0], n[1])

    async def aclose(self):
        if self._client is not None:
            await self._client.aclose()
            self._client = None


def anthropic_body(model: str, messages: list[dict], max_tokens: int, images: list[bytes] | None) -> dict:
    """The Messages API request: `system` from the system messages, the rest in order, pictures added."""
    def parts(content):
        if isinstance(content, list):
            return [{"type": "text", "text": x["text"]} for x in content
                    if isinstance(x, dict) and isinstance(x.get("text"), str) and x["text"]]
        return [{"type": "text", "text": str(content)}] if content else []

    system = "\n\n".join(str(m.get("content") or "") for m in messages if m.get("role") == "system")
    out = [{"role": m["role"], "content": parts(m.get("content"))} for m in messages
           if m.get("role") in ("user", "assistant")]
    if images:
        if not out or out[-1]["role"] != "user":
            out.append({"role": "user", "content": []})
        out[-1]["content"] += [{"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                                            "data": base64.b64encode(b).decode("ascii")}}
                               for b in images]
    body = {"model": model, "max_tokens": max_tokens + THINKING_ROOM, "messages": out,
            "output_config": {"effort": "low"}}
    if system:
        body["system"] = system
    return body


def make_provider(cfg, name: str | None = None, model: str | None = None) -> Provider | None:
    """The provider `name` names, with `model` (empty: that provider's default from cfg). Without a name, the hub's
    default: TUTOR_AI_PROVIDER, or `local` when TUTOR_LLM_URL is set, else none. None means no AI.
    TUTOR_AI_PROVIDER may list providers in order ("anthropic,fake", staging's): the first whose key is set, else
    the last."""
    from .fake import FakeProvider
    default = (cfg.ai_provider or ("local" if cfg.llm_url else "off")).strip().lower()
    if "," in default:
        names = [x.strip() for x in default.split(",") if x.strip()]
        keys = keys_set(cfg)
        default = next((x for x in names if keys.get(x, True)), names[-1])
    name = (name or default).strip().lower()
    t = cfg.llm_timeout
    if name in ("off", "none"):
        return None
    if name == "fake":
        policy.check_provider("fake", None)
        return FakeProvider()
    if name == "local":
        if not cfg.llm_url:
            raise policy.PolicyError("the local provider needs TUTOR_LLM_URL")
        return HttpProvider("local", cfg.llm_url, model or cfg.llm_model, t, cfg.llm_key)
    if name == "openai":
        url = cfg.llm_url if default == "openai" and cfg.llm_url else policy.OPENAI_URL
        return HttpProvider("openai", url, model or cfg.openai_model or cfg.llm_model, t,
                            cfg.openai_key or cfg.llm_key)
    if name == "anthropic":
        return AnthropicProvider(policy.ANTHROPIC_URL, model or cfg.anthropic_model, t, cfg.anthropic_key)
    if name == "gemini":
        return HttpProvider("gemini", policy.GEMINI_URL, model or cfg.gemini_model, t, cfg.gemini_key)
    if name == "openai_compat":
        if not (model or cfg.compat_model):
            raise policy.PolicyError("the openai_compat provider needs a model (TUTOR_COMPAT_MODEL, or the cohort's)")
        return HttpProvider("openai_compat", cfg.compat_url, model or cfg.compat_model, t, cfg.compat_key)
    policy.check_provider(name, None)            # raises: not a provider for learners
    raise policy.PolicyError(f"{name!r} is not a provider for learners")


def keys_set(cfg) -> dict[str, bool]:
    """Which providers have their key: true or false only, for the admin panel. Never a key itself."""
    return {"openai": bool(cfg.openai_key or cfg.llm_key), "anthropic": bool(cfg.anthropic_key),
            "gemini": bool(cfg.gemini_key), "openai_compat": bool(cfg.compat_key)}
