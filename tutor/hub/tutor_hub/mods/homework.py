"""Homework help (P15, C2.3): "Check my answer" under a hint ladder in Ask, three tries a question.

Ask gives an exercise three hints, never the answer (brain.py). The answer behind the ladder (worked out by code,
or by the model twice) is kept on the hub beside the question's token (`ladders`, migrations/0009) and never sent
to a phone. Here she types her answer and hears only whether it is right: "Yes, that's right" or "Not yet: try the
next hint". When the model's two runs disagreed there is nothing sure to check against, and the reply says so ("I'm
not sure about this one. Ask your teacher."). After three checks the question takes no more.

Online the route needs her token and her consent, as Ask does; on the hub it needs neither. The module is
`homework` (bands p2, s1, s2), and Home's "Homework help" door (`#/ask?hw=1`) is its app part.
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from ..brain import same_answer

MODULE = "homework"
TRIES = 3


class CheckIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=16, max_length=16)        # the question's token, from /api/ask
    answer: str = Field(min_length=1, max_length=40)


def router(hub, needs) -> APIRouter:
    r = APIRouter(prefix="/api/m/homework")

    @r.post("/check", dependencies=needs(MODULE))
    async def check(body: CheckIn, request: Request):
        who = await hub.learner(request, required=hub.cfg.home == "online")
        if hub.cfg.home == "online" and not who["consent_kind"]:
            raise HTTPException(403, "no consent")
        hub.ask_limit.check(hub.who(request))
        row = await hub.store.use_check(body.id, TRIES)
        if row is None:
            raise HTTPException(404, "no hints to check against")
        if not row["sure"]:
            return {"result": "unsure", "left": 0}
        if not row["used"]:
            return {"result": "used_up", "left": 0}
        right = same_answer(body.answer, row["solution"])
        return {"result": "right" if right else "not_yet", "left": TRIES - row["checks"]}

    return r
