"""The AI gateway: the only way any part of Qalam reaches a model (BUILD-PLAN 3.7).

Before a call, in order: the purpose must be one the module's manifest lists and the provider and host must pass the
policy (both raise PolicyError: a coding or configuration mistake, never a learner's); then, each a quiet "no AI
this time" that sends the question on to the next source: no provider or it is down, a language the AI is not
trusted in yet, the rules screen, the cohort's daily budget (tokens, UTC day). The learner's words lose any
identifier (filters.scrub) before they leave.

After a call: sums are recomputed (an answer with a wrong sum is dropped); a hint that gives away an answer is asked
for again once, then dropped; the call is counted in `ai_usage` (day, cohort, module, purpose, provider, model,
tokens, cost). A failed or timed-out call is logged and dropped. A dropped answer is never an error to the learner:
the brain goes on to lesson passages and the teacher.
"""
import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from .. import mathcheck, rules
from . import filters, policy
from .providers import Provider, ProviderError

log = logging.getLogger("tutor.ai")

KEEP_DAYS = 730                                  # ai_usage is kept 2 years (BUILD-PLAN 3.4)
MATHS_PURPOSES = ("explain", "hint")             # replies whose sums are recomputed
UNSCREENED = ("read_sheet",)                     # no learner words in the messages: nothing for the rules screen


@dataclass
class Result:
    text: str | None
    why: str                                     # ok, off, language, rules, budget, error, timeout, maths, leak
    maths_checked: int = 0
    held: bool = False                           # held for the teacher (cohort setting, with the dashboard, P20)


def _scrub(content, names):
    """A message's text without identifiers; in a message of parts (text and pictures), each text part."""
    if isinstance(content, str):
        return filters.scrub(content, names)[0]
    if isinstance(content, list):
        return [dict(x, text=filters.scrub(x["text"], names)[0]) if isinstance(x, dict) and isinstance(x.get("text"), str)
                else x for x in content]
    return content


def _text(content) -> str:
    if isinstance(content, list):
        return " ".join(x["text"] for x in content if isinstance(x, dict) and isinstance(x.get("text"), str))
    return str(content or "")


def today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


class Gateway:
    def __init__(self, provider: Provider | None, *, store=None, manifests: dict | None = None,
                 ai_langs=("prs", "en"), budget: int | None = None, timeout: float = 60.0, cohort: str | None = None):
        self.provider = provider
        self.store = store                       # None: no budget and no usage rows (unit tests)
        self.manifests = manifests               # None: every purpose allowed (unit tests)
        self.ai_langs = tuple(ai_langs)
        self.budget = budget                     # tokens per cohort per UTC day; None: no cap
        self.timeout = timeout
        self.cohort = cohort                     # the hub's own cohort, when a call names none

    async def available(self) -> bool:
        return self.provider is not None and await self.provider.available()

    async def aclose(self):
        if self.provider is not None:
            await self.provider.aclose()

    def _allowed(self, module: str, purpose: str):
        if purpose not in policy.PURPOSES:
            raise policy.PolicyError(f"unknown AI purpose {purpose!r}")
        if self.manifests is None:
            return
        m = self.manifests.get(module)
        if not m or purpose not in (m.get("ai") or {}).get("purposes", ()):
            raise policy.PolicyError(f"module {module!r} may not use the AI for {purpose!r}")

    async def over_budget(self, cohort: str | None) -> bool:
        if self.store is None or self.budget is None or not cohort:
            return False
        return (await self.store.ai_spent(cohort, today()))["tokens"] >= self.budget

    async def call(self, purpose: str, messages: list[dict], *, module: str, lang: str, cohort: str | None = None,
                   names=(), answers=None, images=None, max_tokens: int = 350, temperature: float = 0.2,
                   held: bool = False) -> Result:
        """`held`: the reply waits for the teacher before the learner sees it (the cohort's hold setting, P20); the
        call is counted in `ai_usage.held` as well as in calls."""
        self._allowed(module, purpose)
        p = self.provider
        if p is None:
            return Result(None, "off")
        policy.check(p.name, p.url, purpose)
        if lang not in self.ai_langs:
            return Result(None, "language")
        said = [m for m in messages if m.get("role") == "user"]
        # the rules screen is for a learner's words; a sheet's reading (read_sheet) carries only the hub's own list
        # of tiles, and the strip, which holds digits she wrote in boxes
        if purpose not in UNSCREENED and any(rules.screen(_text(m.get("content"))) for m in said):
            return Result(None, "rules")
        cohort = cohort or self.cohort
        if await self.over_budget(cohort):
            log.info("AI budget for today used up in cohort %s: checked answers and the teacher only", cohort)
            return Result(None, "budget")
        if not await p.available():
            return Result(None, "off")
        out = [dict(m, content=_scrub(m.get("content"), names)) if m.get("role") == "user" else dict(m)
               for m in messages]
        for attempt in range(2 if purpose == "hint" and answers else 1):
            r = await self._send(p, purpose, out, module=module, cohort=cohort, images=images,
                                 max_tokens=max_tokens, temperature=temperature, held=held)
            if isinstance(r, Result):
                return r
            if purpose == "hint" and filters.leaks(r, answers):
                log.info("a hint gave the answer away (try %d): dropped", attempt + 1)
                continue
            if purpose in MATHS_PURPOSES:
                c = mathcheck.check(r)
                if not c.ok:
                    return Result(None, "maths")       # a wrong sum: never shown
                return Result(mathcheck.mark(r), "ok", maths_checked=c.checked, held=held)
            return Result(r, "ok", held=held)
        return Result(None, "leak")

    async def _send(self, p, purpose, messages, *, module, cohort, images, max_tokens, temperature, held=False):
        """The reply's text, or a Result saying why there is none. Every reply is counted in ai_usage."""
        try:
            reply = await asyncio.wait_for(p.complete(purpose, messages, max_tokens=max_tokens,
                                                      temperature=temperature, images=images), self.timeout)
        except asyncio.TimeoutError:
            log.warning("AI %s for %s timed out after %s s", p.name, purpose, self.timeout)
            return Result(None, "timeout")
        except ProviderError as e:
            log.warning("AI %s for %s failed: %s", p.name, purpose, e)
            return Result(None, "error")
        if self.store is not None and cohort:
            try:
                await self.store.add_ai_usage(day=today(), cohort=cohort, module=module, purpose=purpose,
                                              provider=p.name, model=p.model,
                                              tokens=reply.tokens_in + reply.tokens_out, cost_micro=p.cost_micro(reply),
                                              held=held)
            except Exception:
                log.exception("AI usage not counted")
        if not reply.text:
            return Result(None, "error")
        return reply.text
