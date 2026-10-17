""""I want to learn this" (P22, C3.5, DESIGN-C2C3-SPECS item 14): her typed goal against the lessons this hub serves.

- `POST /api/m/plan` `{goal, lang, band}` (and `?cohort=`) -> one of
  - `{kind: "plan", label, lessons}`: every lesson whose title, unit or subject holds her words, with the rest of the
    best one's unit, in pack order (search.plan_for); the phone keeps it as her plan;
  - `{kind: "closest", lessons}`: three at most, when nothing matches well enough for a plan;
  - `{kind: "wish", saved}`: no lesson for it yet; the screened text joins the cohort's wishlist;
  - `{kind: "rules", reason, text}`: distress, health or off-limits words get the rules' kind message, and nothing
    is kept.

No token is read and none is sent (BUILD-PLAN 5.1: what is shared is screened wishlist text with counts, no token):
the wishlist row holds the cohort, the band, the language, the text with identifiers replaced (ai/filters.scrub),
a count and two days. The goal is never logged. Typed only in 2027 (C3.5): browser speech input would send her voice
to a third party. No AI: the search is code over titles, units, subjects and lesson text.
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, StrictStr

from .. import rules, search
from ..ai import filters
from ..packs import band_of_year
from ..packs import text as pick_text
from ..sheets import SUBJECT_NAMES
from ..textnorm import tokens

MODULE = "plan"
BANDS = ("s1", "s2", "ad")          # not ad literacy (the phone shows the row only to adult readers): typed only
LANGS = ("prs", "ps", "en")
GOAL_MAX = 200

# health words: the rules' pointer to a health worker, without "your teacher will answer" (nothing goes to a teacher
# from here). Drafts, as rules.MESSAGES are, for a native speaker's check.
HEALTH = {
    "prs": "برای صحت خودت یا خانواده‌ات از کارمند صحی بپرس، یا برنامه‌ی «صحت» را باز کن.",
    "ps": "د خپل یا د کورنۍ د روغتیا لپاره له روغتیايي کارکوونکي وپوښته، یا د «صحت» پروګرام خلاص کړه.",
    "en": "For your own or your family's health, ask a health worker or open the Sehat app.",
}


class PlanIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    goal: StrictStr = Field(..., min_length=1, max_length=GOAL_MAX)
    lang: str = "prs"
    band: str


def lessons_for(library, band: str) -> list[tuple[str, dict]]:
    """The lessons this hub serves to her band, in pack order: adults from adult packs, children by year."""
    out = []
    for lid, l in library.lessons.items():
        adult = (library.packs.get(library.lesson_pack.get(lid)) or {}).get("audience", "child") == "adult"
        if (band == "ad") == adult and (adult or band_of_year(l["year"]) == band):
            out.append((lid, l))
    return out


def wish_key(text: str) -> str:
    """The same wish typed twice counts once: its search words, in order."""
    return " ".join(tokens(text))


def router(hub, needs) -> APIRouter:
    r = APIRouter(prefix="/api/m/plan")

    @r.post("", dependencies=needs(MODULE))
    async def plan(body: PlanIn, request: Request):
        hub.plan_limit.check(hub.who(request))
        lang = body.lang if body.lang in LANGS else "prs"
        cohort, _, on = await hub.cohort_modules(request.query_params.get("cohort"),
                                                 body.band if body.band in BANDS else None)
        if not cohort or body.band not in BANDS or MODULE not in on:
            raise HTTPException(404, "Not Found")
        goal = " ".join(body.goal.split())
        if not goal:
            raise HTTPException(422, "type what you want to learn")
        said = rules.screen(goal)
        if said:
            reason = said[0]
            text = HEALTH[lang] if reason == "health" else rules.MESSAGES[reason][lang]
            return {"kind": "rules", "reason": reason, "text": text}
        clean, _ = filters.scrub(goal)
        found = search.plan_for(clean, lessons_for(hub.library, body.band), SUBJECT_NAMES)
        if found["kind"] == "plan":
            label = pick_text(found.get("unit"), lang) or pick_text(found.get("title"), lang)
            return {"kind": "plan", "label": label, "lessons": found["lessons"]}
        if found["kind"] == "closest":
            return {"kind": "closest", "lessons": found["lessons"]}
        key = wish_key(clean)
        saved = bool(key)
        if saved:
            await hub.store.add_wish(cohort=cohort["id"], band=body.band, lang=lang, wish=clean, wkey=key)
        return {"kind": "wish", "saved": saved}

    return r
