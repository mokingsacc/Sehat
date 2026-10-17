"""Contests (the `contest` module, P31; DESIGN-C6-SPECS.md C6.5; contests.py has the content rules).

A contest reaches a class only when the admin releases it there (a `releases` row, pack `contest:<id>`, at the
contest's current hash; a release with an empty version closes it again). Everything a learner sends is marked by
code here and kept as one number, the percent in her `contest.done` event: never an answer, never a place, never a
list sorted by score.

Learner routes (her token, her class from it only, `needs("contest")`; `?cohort=` is never read):
- `GET  /api/m/contest[?lang=]`: the contests released to her class for her band (and language, when the phone says
  it) that open within 7 days or are open: `{contests: [{id, title, subject, opens_at, closes_at, minutes, n,
  certificate, phase, mine: {percent} | null}]}`; 30 a minute a token.
- `GET  /api/m/contest/{id}`: inside the window only (404 before, 410 after): the questions as the lesson route serves
  a step, without `answer` and `why` (`contests.strip_key`); her consent needed; counted against `per_day` (3) in
  `daily_counts`, 429 `budget` beyond it.
- `POST /api/m/contest/{id}/answers` `{answers: [index | text | null], started}`: once a token (409 after), until 10
  minutes after the close (410 after), her consent needed: `{right, n, percent}`. `started` (the phone's own time) is
  read for its shape and kept nowhere.
- `GET  /api/m/contest/{id}/key`: from the close on (404 before): `{key: [{kind, answer, why}]}` in item order, for
  the phone to mark the answers it kept.

Teacher (`GET /api/m/teacher/contests?cohort=`; the staff gate, role teacher or admin, her own class): each contest
released to the class, "took part" against the learners of its bands, and who took part with their percent, by
alias picture and number: never sorted by percent.
"""
import re
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from .. import contests, events, flags
from ..staff import refuse

MODULE = "contest"
ROLES = ("teacher", "admin")
PACK = "contest:"
LANGS = ("prs", "ps", "en")
STARTED = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}")


class AnswersIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answers: list[int | str | None] = Field(max_length=contests.ITEMS[1])
    started: str | None = Field(None, max_length=40)


def now() -> datetime:
    return datetime.now(timezone.utc)


async def released(hub, cohort_id: str | None) -> dict:
    """The contests released to a class at their current hash: {id: contest}. The newest release of each counts; an
    empty version is a close."""
    if not cohort_id:
        return {}
    out, seen = {}, set()
    for rel in await hub.store.releases(cohort_id):           # newest first
        pack = rel["pack"]
        if not pack.startswith(PACK) or pack in seen:
            continue
        seen.add(pack)
        c = hub.library.contests.get(pack[len(PACK):])
        if c and rel["version"] and rel["content_hash"] == c["_hash"]:
            out[c["id"]] = c
    return out


def summary(hub, c: dict) -> dict:
    return {"id": c["id"], "title": c["title"], "subject": c["subject"], "bands": c["bands"], "langs": c["langs"],
            "opens_at": c["opens_at"], "closes_at": c["closes_at"], "minutes": c["minutes"], "n": len(c["items"]),
            "certificate": c["certificate"], "scope": c["scope"]}


async def took_part(hub, cohort_id: str, c: dict) -> dict:
    """{token_hash: percent} of the class's learners who sent this contest's answers."""
    return await hub.store.contest_takers(cohort_id, c["id"], c["opens_at"])


def router(hub, needs) -> APIRouter:
    from ..server import Limit               # server.py imports this module first

    r = APIRouter()
    list_limit = Limit(30, 60)

    async def her(request: Request, *, consent: bool) -> dict:
        who = await hub.learner(request)
        if consent and not who["consent_kind"]:
            raise HTTPException(403, "no consent: a contest's answers are kept with her token's hash")
        return who

    async def hers(cid: str, who: dict) -> tuple[dict, dict]:
        """A contest released to her class for her band, and the module's settings; 404 for any other."""
        cohort = hub.her_cohort(who)
        c = (await released(hub, cohort)).get(cid)
        if not c or who["band"] not in c["bands"]:
            raise HTTPException(404, "Not Found")
        _, f, _ = await hub.cohort_modules(cohort)
        return c, flags.module_settings(hub.modules[MODULE], (f.get(MODULE) or {}).get("settings"))

    @r.get("/api/m/contest", dependencies=needs(MODULE))
    async def mine(request: Request, lang: str | None = None):
        list_limit.check(hub.who(request))
        who = await her(request, consent=False)
        done = await hub.store.contests_done(who["token_hash"])
        t = now()
        out = []
        for c in (await released(hub, hub.her_cohort(who))).values():
            if who["band"] not in c["bands"] or (lang in LANGS and lang not in c["langs"]):
                continue
            ph = contests.phase(c, t)
            if ph in ("later", "closed"):
                continue
            out.append({**{k: v for k, v in summary(hub, c).items() if k not in ("bands", "langs", "scope")},
                        "phase": ph, "mine": {"percent": done[c["id"]]} if c["id"] in done else None})
        out.sort(key=lambda x: (x["opens_at"], x["id"]))
        return {"contests": out}

    @r.get("/api/m/contest/{cid}", dependencies=needs(MODULE))
    async def questions(cid: str, request: Request):
        who = await her(request, consent=True)
        c, settings = await hers(cid, who)
        ph = contests.phase(c, now())
        if ph in ("later", "soon"):
            raise HTTPException(404, "Not Found")
        if ph != "open":
            raise HTTPException(410, "the contest has closed")
        if cid in await hub.store.contests_done(who["token_hash"]):
            raise refuse(409, "contest_sent", "her answers are in already")
        if await hub.store.count_today(who["token_hash"], MODULE) > settings["per_day"]:
            raise refuse(429, "budget", "enough contests for today")
        return {"id": c["id"], "title": c["title"], "subject": c["subject"], "minutes": c["minutes"],
                "closes_at": c["closes_at"], "questions": [contests.question(hub.library, it) for it in c["items"]]}

    @r.post("/api/m/contest/{cid}/answers", dependencies=needs(MODULE))
    async def answers(cid: str, body: AnswersIn, request: Request):
        who = await her(request, consent=True)
        c, _ = await hers(cid, who)
        ph = contests.phase(c, now())
        if ph in ("later", "soon"):
            raise HTTPException(404, "Not Found")
        if ph == "closed":
            raise HTTPException(410, "the contest has closed")
        if len(body.answers) > len(c["items"]) or any(isinstance(a, str) and len(a) > 40 for a in body.answers):
            raise HTTPException(422, "one short answer a question, at most")
        if body.started is not None and not STARTED.match(body.started):
            raise HTTPException(422, "started is the phone's time, YYYY-MM-DDTHH:MM")
        if cid in await hub.store.contests_done(who["token_hash"]):
            raise refuse(409, "contest_sent", "her answers are in already")
        result = contests.mark(hub.library, c, body.answers)
        e = {"at": events.minute(), "verb": "contest.done", "object": cid, "value": result["percent"]}
        if events.check(e, phone=False):
            raise HTTPException(500, "the event could not be written")
        await hub.store.add_events([events.row(e, cohort=hub.her_cohort(who), token_hash=who["token_hash"])])
        return result

    @r.get("/api/m/contest/{cid}/key", dependencies=needs(MODULE))
    async def key(cid: str, request: Request):
        who = await her(request, consent=False)
        c, _ = await hers(cid, who)
        if now() < contests.when(c["closes_at"]):
            raise HTTPException(404, "Not Found")
        return {"id": c["id"], "key": contests.key(hub.library, c)}

    # --- the teacher ---

    async def staff(request: Request) -> dict:
        me = await hub.staff.who(request)
        if me["via"] == "pin":
            me["cohorts"] = [hub.cohort_id] if hub.cohort_id else []
        elif me["role"] not in ROLES:
            raise HTTPException(403, "Ask the admin to add you")
        return me

    @r.get("/api/m/teacher/contests", dependencies=needs(MODULE))
    async def teacher_contests(request: Request, cohort: str | None = None):
        me = await staff(request)
        cid = cohort or (me["cohorts"] or [None])[0]
        if not cid or cid not in me["cohorts"]:
            raise refuse(403, "not_your_class", "not your class")
        learners = await hub.store.learners_in(cid)                 # by picture and number
        t = now()
        out = []
        for c in sorted((await released(hub, cid)).values(), key=lambda x: (x["opens_at"], x["id"]), reverse=True):
            done = await took_part(hub, cid, c)
            of = [x for x in learners if x["band"] in c["bands"]]
            out.append({**summary(hub, c), "phase": contests.phase(c, t), "took_part": len(done), "of": len(of),
                        "learners": [{"picture": x["picture"], "number": x["number"], "band": x["band"],
                                      "percent": done[x["token_hash"]]} for x in learners if x["token_hash"] in done]})
        return {"contests": out}

    return r
