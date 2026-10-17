"""Her own questions (P32, C4.8; module `made`, off everywhere until an admin turns it on).

Layer 1 lives on her phone: a question, its answer and an optional why, each at most 300 characters, in her language,
text only, at most 50, joining her warm-ups where she marks herself. Nothing of it reaches the hub.
Layer 2, where `teacher` is on too: "Ask my teacher to check" sends one item here.

- `POST /api/m/made` `{kind: "question", body: {q, a, why}, lang}` with her token: the words pass `rules.py` (distress
  goes to the teacher's Needs care, as a question does, and she reads the kind message; anything else the rules stop
  is refused with its message) and the identifier filter (a name she gave, a run of seven digits, an email or a web
  address is refused, so she takes it out herself), at most `per_day` a day. Answers `{id}`.
- `GET /api/m/made/mine` with her token: her items' verdicts, `{id, status, chips, reply}`.
The teacher's side is in mods/teacher.py: To do's last kind, "Made by a learner", and `POST
/api/m/teacher/made/{id}`. `share.cohort` (sharing with the class) is registered and blocked in modules.py, with no
route or screen behind it in 2027. Learner items never become pack content.
"""
import re

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from .. import flags, rules
from ..ai import filters
from ..stores.base import MADE_MAX

MODULE = "made"
URL = re.compile(r"(?i)(https?://|www\.|\b[a-z0-9-]+\.(com|org|net|af|edu|gov|io|me|info)\b)")


class Body(BaseModel):
    model_config = ConfigDict(extra="forbid")
    q: str = Field(min_length=1, max_length=MADE_MAX)
    a: str = Field(min_length=1, max_length=MADE_MAX)
    why: str = Field("", max_length=MADE_MAX)


class MadeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: str = Field(pattern="^question$")
    body: Body
    lang: str = Field(pattern="^(prs|ps|en)$")


REFUSE = {
    "prs": "نام، شماره، ایمیل یا آدرس ویب را بردار و دوباره بفرست.",
    "ps": "نوم، شمېره، برېښنالیک یا د ویب پته لرې کړه او بیا یې ولېږه.",
    "en": "Take out any name, number, email or web address, then send it again.",
}


def identifiers(text: str) -> list[str]:
    """What the identifier filter finds in her words: a name she gave, a run of seven digits, an email, an address."""
    found = set(filters.find(text))
    if URL.search(text):
        found.add("url")
    return sorted(found)


def router(hub, needs) -> APIRouter:
    r = APIRouter(prefix="/api/m/made")

    @r.post("", dependencies=needs(MODULE))
    async def send(body: MadeIn, request: Request):
        who = await hub.learner(request)                         # 401 without her token
        # her own class only: what she sends goes to the teacher of the cohort she joined, never one a link names
        cohort, f, on = await hub.cohort_modules(who["cohort"] or hub.cohort_id, who["band"])
        if not cohort or MODULE not in on or "teacher" not in on:
            raise HTTPException(404, "Not Found")                # layer 2 only where a teacher reads To do
        parts = {"q": body.body.q.strip(), "a": body.body.a.strip(), "why": body.body.why.strip()}
        if not parts["q"] or not parts["a"]:
            raise HTTPException(422, "a question and its answer")
        text = "\n".join(x for x in parts.values() if x)
        hit = rules.screen(text)
        if hit and hit[0] == "distress":                         # as a question would: to Needs care, kindly
            await hub.store.add_question(lang=body.lang, subject=None, year=None, lesson_id=None, question=text,
                                         answer=rules.message(text, "distress", body.lang), source="rules",
                                         urgent=True, waiting=True, cohort=cohort["id"])
            await hub.record("safety.flag", "distress", cohort_id=cohort["id"])
            return {"id": None, "care": True, "message": rules.message(text, "distress", body.lang)}
        if hit:
            raise HTTPException(422, rules.message(text, hit[0], body.lang))
        if identifiers(text):
            raise HTTPException(422, REFUSE[body.lang])
        per_day = flags.module_settings(hub.modules[MODULE], (f.get(MODULE) or {}).get("settings"))["per_day"]
        if await hub.store.count_today(who["token_hash"], MODULE) > per_day:
            raise HTTPException(429, "enough for today")
        mid = await hub.store.add_made(cohort=cohort["id"], token_hash=who["token_hash"], kind=body.kind,
                                       body=parts, lang=body.lang)
        return {"id": mid}

    @r.get("/mine", dependencies=needs(MODULE))
    async def mine(request: Request):
        who = await hub.learner(request)
        return {"items": [{"id": x["id"], "status": x["status"], "chips": x["chips"], "reply": x["reply"]}
                          for x in await hub.store.made_mine(who["token_hash"])]}

    return r
