""""I want to learn this" (P22, C3.5, DESIGN-C2C3-SPECS item 14): her typed goal against the lessons this hub serves.

- `POST /api/m/plan` `{goal, lang, band}` (and `?cohort=`) -> one of
  - `{kind: "plan", label, lessons}`: every lesson whose title, unit or subject holds her words, with the rest of the
    best one's unit, in pack order (search.plan_for); else, since P25a, the lessons of the skills-graph node whose
    title holds half her words (graph.match). The phone builds the plan from them: the graph's `needs` she has not
    mastered first, marked "Learn first" (C4.1);
  - `{kind: "closest", lessons}`: three at most, when nothing matches well enough for a plan;
  - `{kind: "wish", saved}`: no lesson for it yet; the screened text joins the cohort's wishlist;
  - `{kind: "rules", reason, text}`: distress, health or off-limits words get the rules' kind message, and nothing
    is kept.

No token is kept (BUILD-PLAN 5.1: what is shared is screened wishlist text with counts, no token). Since C5 (H1) the
phone sends her token only so that her own class's switches, AI and wishlist apply, never a class a link names;
without one the hub's own cohort's do. The wishlist row holds the cohort, the band, the language, the text with identifiers replaced (ai/filters.scrub),
a count and two days. The goal is never logged. Typed only in 2027 (C3.5): browser speech input would send her voice
to a third party. The search is code over titles, units, subjects, lesson text and node titles.

AI (purpose `plan`, C4.1) only when all of that missed, the cohort's `plan_ai` setting is on (off by default and
everywhere so far; `open` has AI off) and her language is trusted (the gateway's check): the gateway gets the screened
goal and the ids and titles of her band's nodes, never her token, and at most three ids that exist are kept. Anything
else is a miss. The model never writes a word she sees: the label is the node's own title.
"""
import json

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, StrictStr

from .. import flags, graph, rules, search
from ..ai import filters
from ..packs import lesson_bands
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
    """The lessons this hub serves to her band, in pack order: adults from adult packs, children by year, and a pack
    with `bands` (P27a) to those bands."""
    return [(lid, l) for lid, l in library.lessons.items()
            if band in lesson_bands(l, library.packs.get(library.lesson_pack.get(lid)) or {})]


AI_PICKS = 3


def ai_messages(goal: str, nodes: list[tuple[dict, list[str]]], lang: str) -> list[dict]:
    """What the gateway sends for `plan`: the node list (ids and titles, nothing about her) and the screened goal."""
    listed = "\n".join(f"{n['id']}: {pick_text(n['title'], 'en')} / {pick_text(n['title'], lang)}" for n, _ in nodes)
    return [{"role": "system", "content": "A learner typed what she wants to learn. Pick the skills from this list "
             "that fit her goal best, at most three. Answer only with a JSON list of their ids, like [\"frac-add\"], "
             "or [] when none fits.\n" + listed},
            {"role": "user", "content": goal}]


def ai_picks(text: str | None, nodes: list[tuple[dict, list[str]]]) -> list[tuple[dict, list[str]]]:
    """The model's reply as nodes: a JSON list of ids from the list, three at most; anything else picks nothing."""
    try:
        ids = json.loads(text or "")
    except ValueError:
        return []
    if not isinstance(ids, list) or not all(isinstance(x, str) for x in ids):
        return []
    by_id = {n["id"]: (n, ls) for n, ls in nodes}
    out = []
    for x in ids:
        if x in by_id and by_id[x] not in out:
            out.append(by_id[x])
    return out[:AI_PICKS]


def wish_key(text: str) -> str:
    """The same wish typed twice counts once: its search words, in order."""
    return " ".join(tokens(text))


def router(hub, needs) -> APIRouter:
    r = APIRouter(prefix="/api/m/plan")

    @r.post("", dependencies=needs(MODULE))
    async def plan(body: PlanIn, request: Request):
        hub.plan_limit.check(hub.who(request))
        lang = body.lang if body.lang in LANGS else "prs"
        # her token, when the phone sends it, says only which class's switches, AI and wishlist apply (C5 H1); it is
        # never kept with the wish. Without one, this hub's own cohort, never one the request names
        who = await hub.learner(request, required=False)
        cohort, f, on = await hub.cohort_modules(hub.her_cohort(who), body.band if body.band in BANDS else None)
        if not cohort or body.band not in BANDS or MODULE not in on:
            raise HTTPException(404, "Not Found")
        goal = " ".join(body.goal.split())
        if not goal:
            raise HTTPException(422, "type what you want to learn")
        said = rules.screen(goal)
        if said:
            reason = said[0]
            text = HEALTH[lang] if reason == "health" else rules.message(goal, reason, lang)
            return {"kind": "rules", "reason": reason, "text": text}
        clean, _ = filters.scrub(goal)
        mine = lessons_for(hub.library, body.band)
        found = search.plan_for(clean, mine, SUBJECT_NAMES)
        if found["kind"] == "plan":
            label = pick_text(found.get("unit"), lang) or pick_text(found.get("title"), lang)
            return {"kind": "plan", "label": label, "lessons": found["lessons"]}
        ids = [lid for lid, _ in mine]
        node = graph.match(hub.library.graphs, clean, ids)
        if node:
            return {"kind": "plan", "label": pick_text(node[0]["title"], lang), "lessons": node[1]}
        if found["kind"] == "closest":
            return {"kind": "closest", "lessons": found["lessons"]}
        settings = flags.module_settings(hub.modules[MODULE], (f.get(MODULE) or {}).get("settings"))
        nodes = graph.band_nodes(hub.library.graphs, ids) if settings.get("plan_ai") else []
        if nodes:
            res = await hub.gateway.call("plan", ai_messages(clean, nodes, lang), module=MODULE, lang=lang,
                                         cohort=cohort["id"], max_tokens=60, temperature=0.0)
            picked = ai_picks(res.text, nodes)
            if picked:
                lessons = list(dict.fromkeys(lid for _, ls in picked for lid in ls))[:search.PLAN_MAX]
                return {"kind": "plan", "label": pick_text(picked[0][0]["title"], lang), "lessons": lessons}
        key = wish_key(clean)
        saved = bool(key)
        if saved:
            await hub.store.add_wish(cohort=cohort["id"], band=body.band, lang=lang, wish=clean, wkey=key)
        return {"kind": "wish", "saved": saved}

    return r
