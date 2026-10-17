"""The teacher dashboard's routes (P20, C3.2 and DESIGN-C2C3-SPECS.md item 11). The page is `app/teacher/` at
`/teacher/`; it keeps nothing in the browser.

Every route asks the staff gate first (staff.py): the teacher's PIN on the hub, Cloudflare Access online, where the
staff row's role must be teacher or admin. A teacher sees only her cohorts (online the staff row's; on the hub, the
hub's own), named by `?cohort=`. No name anywhere: learners are a picture and a number, questions are anonymous
(no learner is linked to a question), and replies pass the identifier filter before they are kept.

- `GET  /api/m/teacher/me`: her label, role, cohorts, and what the cohort allows (hold, lock codes, printer).
- `GET  /api/m/teacher/todo`: the To do queue, one card at a time on the page: needs care (rules flagged distress),
  held answers and ladders (the cohort's `hold` setting), questions sent to the teacher.
- `POST /api/m/teacher/todo/{id}`: `{action: send|edit|drop|reply|seen|dismiss, text?, hints?, reason?, reuse?}`.
- Since P32 (C4.8), where `made` is on: To do's last kind, "Made by a learner" (`kind: made`, `mid`): her question,
  its answer and why as she wrote them. `POST /api/m/teacher/made/{mid}`: `{verdict: ok|change, chips, reply?}`,
  "Looks right" or "Needs a change" with chips (spelling, answer_wrong, unclear, unsafe, not_school) and a short
  reply through the identifier filter and the leak check (a reply that hands her the answer is refused). The verdict
  reaches her phone at `#/made`.
- `GET  /api/m/teacher/class`: four counts for this week and the class list by picture and number.
- `GET  /api/m/teacher/class/{alias}`: her lessons with % right, hints used; `POST .../reset-code`: a lock reset code.
- `GET  /api/m/teacher/lessons`, `/lessons/{id}`: did it, mastered, the hardest item, disputes, hint rungs; bars per
  item. `GET /api/m/teacher/answers/{id}.html`: the answer sheet (C2.3: the answers are the teacher's).
- `GET  /api/m/teacher/wishes`: the cohort's screened wishlist (P22): text, count, bands, days; never who asked.
- `POST /api/m/teacher/class-card`: `{code}` -> the class card's address and QR for `?join=CODE`.
- `POST /api/m/teacher/hub-card`: the hub's Wi-Fi card, printed (the hub only).
"""
import hashlib
import json
import secrets
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, ConfigDict, Field

from .. import events, flags, learners, mathcheck, qr
from ..ai import filters
from ..brain import hints_leak
from ..packs import band_of_year
from ..packs import text as pick_text

MODULE = "teacher"
ROLES = ("teacher", "admin")
ACTIONS = ("send", "edit", "drop", "reply", "seen", "dismiss")
CODE_MINUTES = 15
CODE_TRIES = 5
MASTERED = 80                            # a lesson is mastered when her latest sheet is 80% right or more
NEEDS_HELP = 3                           # items still wrong after hints this week


class TodoIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: str = Field(pattern="^(send|edit|drop|reply|seen|dismiss)$")
    text: str | None = Field(None, max_length=1500)
    hints: list[str] | None = Field(None, min_length=3, max_length=3)
    reason: str | None = Field(None, max_length=20)
    reuse: bool = True


class VerdictIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    verdict: str = Field(pattern="^(ok|change)$")
    chips: list[str] = Field(default_factory=list, max_length=5)
    reply: str | None = Field(None, max_length=300)


class CardIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=4, max_length=20)


def code_hash(token_hash: str, code: str) -> str:
    return hashlib.sha256(f"{token_hash}:{code}".encode()).hexdigest()


def alias_of(r: dict) -> str:
    return f"{r['picture']}-{r['number']}"


def _days(a: str, b: str) -> int:
    return (date.fromisoformat(b[:10]) - date.fromisoformat(a[:10])).days


def _lesson_of(obj: str | None) -> str | None:
    return obj.split(":", 1)[0] if obj and ":" in obj else obj


def stuck_items(evs: list[dict]) -> int:
    """Items she opened a hint on whose latest mark is still wrong."""
    hinted, last = set(), {}
    for e in evs:
        if e["verb"] == "hint.rung":
            hinted.add(e["object"])
        elif e["verb"] == "check.item":
            last[e["object"]] = e["value"]
    return sum(1 for i in hinted if last.get(i) == 0)


def class_rows(rows: list[dict], week: list[dict], today: str) -> list[dict]:
    """The class list: by picture and number, never by score. `week` is this week's events, oldest first."""
    mine = defaultdict(list)
    for e in week:
        if e["token_hash"]:
            mine[e["token_hash"]].append(e)
    out = []
    for r in rows:
        evs = mine.get(r["token_hash"], [])
        sheets = [e["value"] for e in evs if e["verb"] == "check.done" and e["value"] is not None]
        out.append({"alias": alias_of(r), "picture": r["picture"], "number": r["number"], "band": r["band"],
                    "days": max(0, _days(r["last_seen"], today)),
                    "lessons": sum(1 for e in evs if e["verb"] == "lesson.done"),
                    "sheets": len(sheets), "average": round(sum(sheets) / len(sheets)) if sheets else None,
                    "needs_help": stuck_items(evs) >= NEEDS_HELP, "stuck": stuck_items(evs)})
    return out


def learner_view(evs: list[dict]) -> dict:
    """Her page: per lesson the latest sheet's % right and lessons finished; hints opened, by rung."""
    lessons: dict[str, dict] = {}
    rungs = {1: 0, 2: 0, 3: 0}
    for e in evs:
        if e["verb"] in ("lesson.done", "check.done"):
            x = lessons.setdefault(e["object"], {"done": 0, "pct": None})
            if e["verb"] == "lesson.done":
                x["done"] += 1
            else:
                x["pct"] = e["value"]
        elif e["verb"] == "hint.rung" and e["value"] in rungs:
            rungs[e["value"]] += 1
    return {"lessons": lessons, "hints": rungs, "needs_help": stuck_items(evs) >= NEEDS_HELP, "stuck": stuck_items(evs)}


def lesson_stats(evs: list[dict]) -> dict[str, dict]:
    """Per lesson: learners who finished it, learners who mastered it (latest sheet 80% or more), each item's marks,
    disputes and hint rungs opened."""
    did, latest = defaultdict(set), defaultdict(dict)
    items = defaultdict(lambda: defaultdict(lambda: {"right": 0, "wrong": 0, "disputes": 0, "hints": 0}))
    rungs = defaultdict(lambda: {1: 0, 2: 0, 3: 0})
    for e in evs:
        v, o, who = e["verb"], e["object"], e["token_hash"] or ""
        if v == "lesson.done":
            did[o].add(who)
        elif v == "check.done":
            latest[o][who] = e["value"] or 0
        elif v in ("check.item", "check.dispute", "hint.rung"):
            lid, n = o.split(":", 1)
            it = items[lid][int(n)]
            if v == "check.item":
                it["right" if e["value"] else "wrong"] += 1
            elif v == "check.dispute":
                it["disputes"] += 1
            else:
                it["hints"] += 1
                if e["value"] in (1, 2, 3):
                    rungs[lid][e["value"]] += 1
    out = {}
    for lid in set(did) | set(latest) | set(items):
        its = items.get(lid, {})
        hard = max((n for n in its if its[n]["wrong"]), key=lambda n: (its[n]["wrong"], -n), default=None)
        out[lid] = {"did": len(did.get(lid, ())), "mastered": sum(1 for p in latest.get(lid, {}).values() if p >= MASTERED),
                    "hardest": hard, "disputes": sum(i["disputes"] for i in its.values()), "hints": rungs.get(lid, {1: 0, 2: 0, 3: 0}),
                    "items": {n: dict(its[n]) for n in sorted(its)}}
    return out


def wish_rows(rows: list[dict]) -> list[dict]:
    """The class's wishlist for the Wishes tab: one row a wish (the same words in any band or language), with its
    text as first typed, the count, the bands and the days; the most asked for first. Never who asked."""
    out: dict[str, dict] = {}
    for w in rows:
        x = out.setdefault(w["wkey"], {"text": w["wish"], "count": 0, "bands": [], "langs": [],
                                       "first_day": w["first_day"], "last_day": w["last_day"]})
        x["count"] += w["count"]
        x["bands"] = sorted(set(x["bands"]) | {w["band"]})
        x["langs"] = sorted(set(x["langs"]) | {w["lang"]})
        x["first_day"], x["last_day"] = min(x["first_day"], w["first_day"]), max(x["last_day"], w["last_day"])
    latest = sorted(out.values(), key=lambda x: x["last_day"], reverse=True)
    return sorted(latest, key=lambda x: -x["count"])[:200]


def router(hub, needs) -> APIRouter:
    r = APIRouter(prefix="/api/m/teacher")

    async def staff(request: Request) -> dict:
        me = await hub.staff.who(request)
        if me["via"] == "pin":
            me["cohorts"] = [hub.cohort_id] if hub.cohort_id else []
        elif me["role"] not in ROLES:
            raise HTTPException(403, "Ask the admin to add you")
        return me

    async def cohort(request: Request, me: dict):
        cid = request.query_params.get("cohort") or (me["cohorts"] or [None])[0]
        if not cid or cid not in me["cohorts"]:
            raise HTTPException(403, "not your class")
        c, f, on = await hub.cohort_modules(cid)
        if not c:
            raise HTTPException(404, "no such cohort")
        settings = flags.module_settings(hub.modules[MODULE], (f.get(MODULE) or {}).get("settings"))
        return c, settings, on

    def title(lid: str | None, lang: str) -> str | None:
        l = hub.library.lessons.get(lid or "")
        return pick_text(l["title"], lang) if l else None

    def lang_of(request: Request) -> str:
        x = request.query_params.get("lang") or "prs"
        return x if x in ("prs", "ps", "en") else "prs"

    def now():
        return datetime.now(timezone.utc)

    async def week_events(cid):
        return await hub.store.events_since(cid, events.minute(now() - timedelta(days=7)))

    async def all_events(cid):
        return await hub.store.events_since(cid, events.minute(now() - timedelta(days=events.KEEP_DAYS)))

    async def learner_by_alias(cid, alias):
        for row in await hub.store.learners_in(cid):
            if alias_of(row) == alias:
                return row
        raise HTTPException(404, "no such learner in this class")

    async def card(q: dict, lang: str) -> dict:
        kind = "care" if q["urgent"] else "held" if q["status"] == "held" else "question"
        item = {"id": q["id"], "kind": kind, "created": q["created"], "year": q["year"], "subject": q["subject"],
                "lang": q["lang"], "lesson": title(q["lesson_id"], lang), "question": q["question"],
                "shown": q["answer"], "source": q["source"]}
        if kind == "held":
            hints = json.loads(q["hints"]) if q["hints"] else None
            item["hints"] = [h["text"] for h in hints] if hints else None
            secret = await hub.store.ladder(q["token"])
            if secret:                   # for the teacher only: the answer behind the ladder
                item["private"] = {"answer": secret["solution"], "sure": secret["sure"]}
            item["checks"] = {
                "maths": mathcheck.check(q["answer"] or "").ok if not hints else None,
                "leak": (not any(hints_leak(h["text"], [secret["solution"]]) for h in hints)) if hints and secret
                else None}
        return item

    def mine(q: dict, cid: str) -> bool:
        return q["cohort"] == cid or (q["cohort"] is None and cid == hub.cohort_id)

    @r.get("/me", dependencies=needs(MODULE))
    async def me_(request: Request):
        me = await staff(request)
        cohorts = []
        for cid in me["cohorts"]:
            c = await hub.store.cohort(cid)
            if c:
                cohorts.append({"id": c["id"], "label": c["label"]})
        out = {"label": me["label"], "role": me["role"] or "teacher", "via": me["via"], "cohorts": cohorts}
        if cohorts:
            _, settings, on = await cohort(request, me)
            out.update(hold=settings["hold"], lock_codes=settings["lock_codes"], printer="print" in on,
                       sheets="sheets" in on)
        return out

    @r.get("/todo", dependencies=needs(MODULE))
    async def todo(request: Request):
        me = await staff(request)
        c, _, _ = await cohort(request, me)
        lang = lang_of(request)
        rows = await hub.store.queue(limit=200, cohort=c["id"], own=c["id"] == hub.cohort_id)
        groups = {"care": [], "held": [], "question": []}
        for q in rows:
            item = await card(q, lang)
            groups[item["kind"]].append(item)
        for g in groups.values():
            g.sort(key=lambda x: x["id"])            # oldest first within each group
        # P32 (C4.8): her own questions sent for a check, last in the order
        _, _, on = await hub.cohort_modules(c["id"])
        if "made" in on:
            groups["made"] = [{"id": f"m{m['id']}", "mid": m["id"], "kind": "made", "created": m["at"],
                               "lang": m["lang"], "made": m["body"], "year": None, "lesson": None,
                               "question": m["body"]["q"]} for m in await hub.store.made_waiting(c["id"])]
        items = groups["care"] + groups["held"] + groups["question"] + groups.get("made", [])
        # each group's count for the header (C4 look question 22): needs care first, then held answers oldest first,
        # then questions sent to her, then (P32) what learners made
        return {"count": len(items), "items": items, "groups": {k: len(v) for k, v in groups.items()}}

    @r.post("/made/{mid}", dependencies=needs(MODULE, "made"))
    async def made_verdict(mid: int, body: VerdictIn, request: Request):
        me = await staff(request)
        c, _, on = await cohort(request, me)
        if "made" not in on:
            raise HTTPException(404, "Not Found")
        m = await hub.store.made_row(mid)
        if not m or m["cohort"] != c["id"] or m["status"] != "waiting":
            raise HTTPException(404, "nothing waiting with this number")
        reply = filters.scrub((body.reply or "").strip())[0] or None
        if reply and filters.leaks(reply, [m["body"]["a"]]):
            raise HTTPException(422, "the reply gives her answer away: point her to where to look")
        try:
            await hub.store.decide_made(mid, status=body.verdict, chips=body.chips, reply=reply)
        except ValueError as e:
            raise HTTPException(422, str(e)) from None
        return {"ok": True}

    @r.post("/todo/{qid}", dependencies=needs(MODULE))
    async def act(qid: int, body: TodoIn, request: Request):
        me = await staff(request)
        c, _, _ = await cohort(request, me)
        q = await hub.store.question_row(qid)
        if not q or not mine(q, c["id"]) or q["status"] not in ("held", "answered", "waiting"):
            raise HTTPException(404, "nothing waiting with this number")
        kind = "care" if q["urgent"] else "held" if q["status"] == "held" else "question"
        allowed = {"held": ("send", "edit", "drop"), "care": ("reply", "seen"), "question": ("reply", "dismiss")}[kind]
        if body.action not in allowed:
            raise HTTPException(422, f"this card takes {', '.join(allowed)}")
        lid = events.lesson_id(q["lesson_id"])
        if body.action == "send":
            hints = json.loads(q["hints"]) if q["hints"] else None
            shown = "\n".join([q["answer"] or ""] + [f"{h['rung']}. {h['text']}" for h in hints]) if hints else None
            await hub.store.review(qid, answer=shown, approve=True, reuse=False)
            await hub.record("held.sent", cohort_id=c["id"])
        elif body.action == "edit":
            hints = json.loads(q["hints"]) if q["hints"] else None
            if hints:
                if not body.hints:
                    raise HTTPException(422, "three hints, please")
                new = [filters.scrub(t.strip())[0][:400] for t in body.hints]
                if not all(new):
                    raise HTTPException(422, "a hint is empty")
                secret = await hub.store.ladder(q["token"])
                answers = [secret["solution"]] if secret else []
                bad = [k for k, t in enumerate(new, 1) if hints_leak(t, answers)]
                if bad:
                    await hub.record("safety.flag", "leak", cohort_id=c["id"])     # the admin's Safety count (P21)
                    raise HTTPException(422, f"hint {bad[0]} gives the answer away")
                rungs = [dict(h, text=t) for h, t in zip(hints, new)]
                shown = "\n".join([q["answer"] or ""] + [f"{h['rung']}. {h['text']}" for h in rungs])
                await hub.store.review(qid, answer=shown, approve=True, hints=rungs, reuse=False)
            else:
                text = filters.scrub((body.text or "").strip())[0]
                if not text:
                    raise HTTPException(422, "write the answer, please")
                await hub.store.review(qid, answer=text, approve=True, reuse=False)
            await hub.record("held.edited", cohort_id=c["id"])
        elif body.action == "drop":
            if body.reason not in events.REASONS:
                raise HTTPException(422, f"a reason: {', '.join(events.REASONS)}")
            await hub.store.review(qid, approve=False)
            await hub.record("held.dropped", body.reason, cohort_id=c["id"])
        elif body.action == "reply":
            text = filters.scrub((body.text or "").strip())[0]
            if not text:
                raise HTTPException(422, "write the answer, please")
            await hub.store.review(qid, answer=text, approve=True, reuse=body.reuse and kind != "care")
            await hub.record("review.approved", lid, cohort_id=c["id"])
            if body.reuse and kind != "care":
                await hub.reindex()
        else:                                         # seen, dismiss
            await hub.store.review(qid, approve=False)
            await hub.record("review.rejected", lid, cohort_id=c["id"])
        return {"ok": True}

    @r.get("/class", dependencies=needs(MODULE))
    async def class_(request: Request):
        me = await staff(request)
        c, settings, _ = await cohort(request, me)
        rows = await hub.store.learners_in(c["id"])
        today = now().strftime("%Y-%m-%d")
        week = await week_events(c["id"])
        listed = class_rows(rows, week, today)
        since = (now() - timedelta(days=7)).isoformat(timespec="seconds")
        return {"active": sum(1 for x in listed if x["days"] < 7), "learners": len(listed),
                "lessons": sum(1 for e in week if e["verb"] == "lesson.done"),
                "sheets": sum(1 for e in week if e["verb"] == "check.done"),
                "questions": await hub.store.question_count(c["id"], since, own=c["id"] == hub.cohort_id),
                "rows": listed, "lock_codes": settings["lock_codes"]}

    @r.get("/class/{alias}", dependencies=needs(MODULE))
    async def learner(alias: str, request: Request):
        me = await staff(request)
        c, settings, _ = await cohort(request, me)
        row = await learner_by_alias(c["id"], alias)
        evs = [e for e in await all_events(c["id"]) if e["token_hash"] == row["token_hash"]]
        v = learner_view(evs)
        lang = lang_of(request)
        lessons = [{"id": lid, "title": title(lid, lang) or lid, **x} for lid, x in v["lessons"].items()]
        order = list(hub.library.lessons)
        lessons.sort(key=lambda x: order.index(x["id"]) if x["id"] in order else len(order))
        return {"alias": alias, "picture": row["picture"], "number": row["number"], "band": row["band"],
                "days": max(0, _days(row["last_seen"], now().strftime("%Y-%m-%d"))), "lessons": lessons,
                "hints": v["hints"], "needs_help": v["needs_help"], "stuck": v["stuck"], "lock_codes": settings["lock_codes"]}

    @r.post("/class/{alias}/reset-code", dependencies=needs(MODULE))
    async def reset_code(alias: str, request: Request):
        me = await staff(request)
        c, settings, _ = await cohort(request, me)
        if not settings["lock_codes"]:
            raise HTTPException(403, "lock reset codes are off for this class")
        row = await learner_by_alias(c["id"], alias)
        code = f"{secrets.randbelow(10 ** 6):06d}"
        expires = (now() + timedelta(minutes=CODE_MINUTES)).isoformat(timespec="seconds")
        await hub.store.set_reset_code(row["token_hash"], code_hash(row["token_hash"], code), expires)
        # the admin's Log keeps who made it and for which learner number, never the code (C5 L1)
        await hub.store.add_admin_log(cohort=c["id"], what="teacher.lock_code", detail=f"a lock reset code for {alias}",
                                      changed_by=f"teacher:{me['label']}"[:60])
        return {"code": code, "minutes": CODE_MINUTES}

    @r.get("/lessons", dependencies=needs(MODULE))
    async def lessons(request: Request):
        me = await staff(request)
        c, _, _ = await cohort(request, me)
        lang = lang_of(request)
        stats = lesson_stats(await all_events(c["id"]))
        out = []
        for lid in hub.library.lessons:
            l = hub.library.lessons[lid]
            if band_of_year(l.get("year", 12)) not in c["bands"] and lid not in stats:
                continue
            s = stats.get(lid) or {"did": 0, "mastered": 0, "hardest": None, "disputes": 0,
                                   "hints": {1: 0, 2: 0, 3: 0}}
            out.append({"id": lid, "title": title(lid, lang), "subject": l.get("subject"), "year": l.get("year"),
                        **{k: s[k] for k in ("did", "mastered", "hardest", "disputes", "hints")}})
        return {"lessons": out}

    @r.get("/lessons/{lid}", dependencies=needs(MODULE))
    async def lesson(lid: str, request: Request):
        me = await staff(request)
        c, _, on = await cohort(request, me)
        l = hub.library.lessons.get(lid)
        if not l:
            raise HTTPException(404, "no such lesson")
        s = lesson_stats(await all_events(c["id"])).get(lid) or {"did": 0, "mastered": 0, "hardest": None,
                                                                 "disputes": 0, "hints": {1: 0, 2: 0, 3: 0}, "items": {}}
        n = len((l.get("sheet") or {}).get("items") or [])
        items = [{"n": k, **s["items"].get(k, {"right": 0, "wrong": 0, "disputes": 0, "hints": 0})}
                 for k in range(1, max([n, *s["items"]] or [0]) + 1)]
        return {"id": lid, "title": title(lid, lang_of(request)), **{k: s[k] for k in ("did", "mastered", "hardest",
                                                                                         "disputes", "hints")},
                "items": items, "answers": bool(l.get("sheet")) and "sheets" in on}

    @r.get("/answers/{lid}.html", response_class=HTMLResponse, dependencies=needs(MODULE, "sheets"))
    async def answers(lid: str, request: Request, seed: int = Query(0, ge=0, le=9999)):
        me = await staff(request)
        await cohort(request, me)
        return HTMLResponse(hub.sheet_html(lid, lang=lang_of(request), seed=seed, kind="answers"))

    @r.get("/wishes", dependencies=needs(MODULE))
    async def wishes(request: Request):
        me = await staff(request)
        c, _, _ = await cohort(request, me)
        return {"wishes": wish_rows(await hub.store.wishes(c["id"], limit=500))}

    @r.post("/class-card", dependencies=needs(MODULE))
    async def class_card(body: CardIn, request: Request):
        me = await staff(request)
        c, _, _ = await cohort(request, me)
        code = learners.normal_code(body.code)
        found = await hub.store.cohort_by_code(learners.code_hash(code)) if code else None
        if not found or found["id"] != c["id"]:
            raise HTTPException(404, "this is not your class's code")
        base = hub.cfg.public_url if hub.cfg.home == "hub" else f"{request.url.scheme}://{request.url.netloc}"
        url = base.rstrip("/") + "/?join=" + code
        return {"code": code[:4] + "-" + code[4:], "url": url, "label": c["label"], "svg": qr.svg(url, 40, url=True)}

    @r.post("/hub-card", dependencies=needs(MODULE, "print"))
    async def hub_card(request: Request):
        me = await staff(request)
        await cohort(request, me)
        jid = await hub.store.add_print(lesson_id=None, kind="card", copies=1, lang="prs", seed=0, device="teacher")
        hub.prints.add(jid, {"card": True, "copies": 1, "title": "hub-card"})
        return {"id": jid, "status": "queued"}

    return r
