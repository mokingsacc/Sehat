"""The review screens' routes (P17, C3.4): reviewers read each lesson step in the learner's look, mark it OK or ask
for a change, and sign the lesson's content hash. The page is `app/review/` at `/review/`.

Every route asks the staff gate first (staff.py): the teacher's PIN on the hub, Cloudflare Access online. Online
the reviewer's role comes from her `staff` row; on the hub she names the role (one the lesson needs) and types her
initials when she signs. A signature is a `signoffs` row (initials only), for the lesson's current content hash;
`tools/pull_signoffs.py` copies the rows into the pack's review blocks, which is what release mode reads.

- `GET  /api/m/review/me`: who she is here: label, role, initials, how she came in.
- `GET  /api/m/review/queue[?role=]`: the lessons that need her role, by pack, each with its status: not started,
  step n of N, changes asked, signed, or changed since she signed.
- `GET  /api/m/review/lessons/{id}[?role=]`: the lesson as the app gets it, the content hash and each step's hash,
  her latest verdict per step ("OK last time", or changed since), which steps need a recording and lack one, the
  sheet's key with its hints (seed 0), the link cards and the sources.
- `POST /api/m/review/lessons/{id}/steps/{n}`: `{verdict: ok|change, chips, text, step_hash, role?}`.
- `POST /api/m/review/lessons/{id}/sign`: `{hash, role?, initials?}`: only when the hash is the current one, every
  step is OK for this role at its current hash, and no step that needs a recording lacks one.
- `GET  /api/m/review/signoffs`: every signoff, for `tools/pull_signoffs.py`.

Since P25a (C4.1) a skills graph is one more page type, kept under the name `graph:<subject>` in the same tables:
its nodes are its steps 1 to N (each with its needs and lessons), step 0 the rest (the pathways and the version).
The queue lists the graphs that need her role under `graphs`; the routes are the lessons' under
`/api/m/review/graphs/{subject}`: GET, `POST .../steps/{n}`, `POST .../sign`.

Since P29 (C4.7) the Quran set is one more, kept as `quran:set`, for the "Hanafi scholar" its review block needs:
step 0 is what the set is (the text's edition, each translation's version and credit, the reciter, Tanzil's notice),
steps 1 to 114 the surahs (each its verses' text, translations with their footnotes, and the listed recitation's
hash). The page reads each surah from `/quran/surah/<n>.json` as the reader does; OK on a surah waits until every
recitation it has here has played. `GET /api/m/review/quran`, `POST .../steps/{n}`, `POST .../sign`. Once pulled
into content/quran/index.json (tools/pull_signoffs.py), the admin may switch the reader on.

Since P28 (C4.6) a pack's card set is one more, kept as `cards:<pack>`: its checklist (if it has one) then its link
cards, one step each (steps 1 to N), signed as one hash over theirs. The queue lists the sets with an item that needs
her role under `cards`. `GET /api/m/review/cards/{pack}`, `POST .../steps/{n}`, `POST .../sign`. Pulled in, each item
that needs her role gets her signature at its own hash, so a later change to one card voids only that card's.

Since P31 (C6.5) a contest is one more, kept as `contest:<id>`: step 0 is the contest itself (title, subject, bands,
window, minutes, certificate), steps 1 to N its questions, each shown as the learner sees it with its answer and why
beside it for the reviewer, each hashed with its lesson's hash so an OK lasts only while that lesson is unchanged.
It needs a subject teacher and the Dari and Pashto readers. The queue lists the contests that need her role under
`contests`. `GET /api/m/review/contests/{id}`, `POST .../steps/{n}`, `POST .../sign`.
"""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from .. import contests, licences, packs, sheets
from ..ai import filters
from ..stores.base import REVIEW_CHIPS

MODULE = "review"
LANG_OF_ROLE = {"Dari reader": ("prs",), "Pashto reader": ("ps",)}


class NoteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    verdict: str = Field(pattern="^(ok|change)$")
    chips: list[str] = Field(default_factory=list, max_length=len(REVIEW_CHIPS))
    text: str = Field("", max_length=500)
    step_hash: str = Field(min_length=8, max_length=80)
    role: str | None = Field(None, max_length=40)


class SignIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    hash: str = Field(min_length=8, max_length=80)
    role: str | None = Field(None, max_length=40)
    initials: str | None = Field(None, max_length=4)


def _step_hashes(lib, lid: str) -> list[str]:
    """Each step's own hash (its text, pictures and clips), then the rest of the lesson (sheet, cards, sources) as
    step 0, so a reviewer sees which steps changed since she last looked."""
    raw = lib.lessons[lid]
    pid = lib.lesson_pack[lid]
    pdir, clips = lib.packs[pid]["_dir"], lib.packs[pid].get("_clips", {})
    rest = {k: v for k, v in raw.items() if k not in ("steps", "review") and not k.startswith("_")}
    return [packs.content_hash(rest, pdir, clips)] + [packs.content_hash({"step": st}, pdir, clips, lib.quran)
                                                      for st in raw.get("steps", [])]


def _missing_clips(lib, lid: str, role: str) -> list[int]:
    """Steps that need a recording in the role's language (years 0 to 3, an adult literacy pack, and every letter
    step) and lack one; for a subject teacher, also every English or Chinese word without its recording (P27a)."""
    raw = lib.lessons[lid]
    pack = lib.packs[lib.lesson_pack[lid]]
    clips = pack.get("_clips", {})
    langs = [x for x in pack.get("langs", ["prs", "ps"]) if x in LANG_OF_ROLE.get(role, ("prs", "ps"))]
    young = packs.reads_every_step(raw, pack)
    out = []
    for i, st in enumerate(raw.get("steps") or [], 1):
        if not (young or st.get("kind") == "letter"):
            continue
        for al in langs:
            clip = (st.get("audio") or {}).get(al)
            entry = clips.get(al, {}).get(clip) if clip else None
            if not entry or entry.get("placeholder"):
                out.append(i)
                break
    if role not in LANG_OF_ROLE:            # P27a: the subject teacher hears every English or Chinese word recorded
        for i, al in packs.studied_clip_steps(raw):
            entry = clips.get(al, {}).get((raw["steps"][i - 1].get("audio") or {}).get(al))
            if (not entry or entry.get("placeholder")) and i not in out:
                out.append(i)
    return sorted(out)


def _graph_hashes(g: dict) -> list[str]:
    """A graph's steps: the rest (pathways, version) as step 0, then each node."""
    def h(x):
        return licences.sha256_text(json.dumps(x, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
    rest = {k: v for k, v in g.items() if k not in ("nodes", "review") and not k.startswith("_")}
    return [h(rest)] + [h(n) for n in g["nodes"]]


def _graph_status(g, role, notes, signs) -> dict:
    mine = [s for s in signs if s["role"] == role]
    if any(s["content_hash"] == g["_hash"] for s in mine):
        return {"status": "signed"}
    if mine:
        return {"status": "changed"}
    latest = _latest(notes)
    if any(n["status"] == "change" for n in latest.values()):
        return {"status": "changes"}
    seen = [k for k in range(1, len(g["nodes"]) + 1) if k in latest]
    if not seen:
        return {"status": "not_started"}
    return {"status": "step", "step": min(max(seen) + 1, len(g["nodes"])), "of": len(g["nodes"])}


QURAN = "quran:set"
CARDS = "cards:"
CONTEST = "contest:"


def _quran_hashes(q) -> list[str]:
    """The set's steps: what it is as step 0 (index.json without its review: every file's hash), then each surah
    (its verses as an ayah step would show them)."""
    def h(x):
        return licences.sha256_text(json.dumps(x, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
    return [q.hash] + [h([q.verse_hash(s["n"], a) for a in range(1, s["ayas"] + 1)]) for s in q.surahs]


def _latest(notes: list[dict]) -> dict[int, dict]:
    out = {}
    for n in notes:
        out[n["step"]] = n
    return out


def _status(lib, lid, role, notes, signs) -> dict:
    h = lib.hashes[lid]
    steps = len(lib.lessons[lid].get("steps", []))
    mine = [s for s in signs if s["role"] == role]
    if any(s["content_hash"] == h for s in mine):
        return {"status": "signed"}
    if mine:
        return {"status": "changed"}
    latest = _latest(notes)
    if any(n["status"] == "change" for n in latest.values()):
        return {"status": "changes"}
    seen = [k for k in range(1, steps + 1) if k in latest]
    if not seen:
        return {"status": "not_started"}
    return {"status": "step", "step": min(max(seen) + 1, steps), "of": steps}


def router(hub, needs) -> APIRouter:
    r = APIRouter(prefix="/api/m/review")

    async def staff(request: Request) -> dict:
        return await hub.staff.who(request)

    def role_for(me: dict, lid: str | None, asked: str | None) -> str:
        """Online the staff row's role; on the hub the role she names. Either way one the lesson needs."""
        role = me["role"] or (asked or "").strip()
        if not role:
            raise HTTPException(422, "say which role you review for")
        if lid is not None and role not in ((hub.library.lessons[lid].get("review") or {}).get("needs") or []):
            raise HTTPException(403, "this lesson does not need your role")
        return role

    def quran_set():
        """The whole Quran set, when it is here and checked (the Worker keeps only its light copy: the text is
        static there, and the review reads it from /quran/surah/<n>.json all the same)."""
        q = hub.library.quran
        return q if q is not None and q.ok and q.index else None

    def lesson_or_404(lid: str):
        if lid not in hub.library.lessons:
            raise HTTPException(404, "no such lesson")
        return hub.library.lessons[lid]

    @r.get("/me", dependencies=needs(MODULE))
    async def me(request: Request):
        m = await staff(request)
        q = quran_set()
        sets = [x for pid in hub.library.packs for x in hub.library.card_set(pid)]
        roles = sorted({x for l in [*hub.library.lessons.values(), *hub.library.graphs.values(),
                                    *([q.index] if q else []), *sets, *hub.library.contests.values()]
                        for x in (l.get("review") or {}).get("needs") or []})
        return {"label": m["label"], "role": m["role"], "initials": m["initials"], "via": m["via"], "roles": roles}

    @r.get("/queue", dependencies=needs(MODULE))
    async def queue(request: Request, role: str | None = None):
        m = await staff(request)
        role = role_for(m, None, role)
        lib = hub.library
        out = []
        for pid, pack in lib.packs.items():
            rows = []
            for lid in pack["lessons"]:
                raw = lib.lessons.get(lid)
                if not raw or role not in ((raw.get("review") or {}).get("needs") or []):
                    continue
                notes = await hub.store.review_notes(lid, role)
                st = _status(lib, lid, role, notes, await hub.store.signoffs(lid))
                rows.append({"id": lid, "title": raw.get("title"), "code": (raw.get("sheet") or {}).get("code"),
                             "steps": len(raw.get("steps", [])), **st})
            if rows:
                out.append({"pack": pid, "title": pack.get("title"), "lessons": rows})
        graphs = []
        for sub, g in sorted(lib.graphs.items()):
            if role in ((g.get("review") or {}).get("needs") or []):
                key = "graph:" + sub
                st = _graph_status(g, role, await hub.store.review_notes(key, role), await hub.store.signoffs(key))
                graphs.append({"subject": sub, "version": g["version"], "nodes": len(g["nodes"]), **st})
        q = quran_set()
        qrow = None
        if q and role in ((q.index.get("review") or {}).get("needs") or []):
            st = _graph_status({"_hash": q.hash, "nodes": q.surahs}, role, await hub.store.review_notes(QURAN, role),
                               await hub.store.signoffs(QURAN))
            qrow = {"surahs": len(q.surahs), "short": q.hash[7:15], **st}
        cards = []
        for pid in sorted(lib.packs):
            items = lib.card_set(pid)
            if items and any(role in ((x.get("review") or {}).get("needs") or []) for x in items):
                key = CARDS + pid
                st = _graph_status({"_hash": lib.card_set_hash(pid), "nodes": items}, role,
                                   await hub.store.review_notes(key, role), await hub.store.signoffs(key))
                cards.append({"pack": pid, "title": lib.packs[pid].get("title"), "items": len(items), **st})
        rows = []
        for cid, c in sorted(lib.contests.items()):
            if role in ((c.get("review") or {}).get("needs") or []):
                key = CONTEST + cid
                st = _graph_status({"_hash": c["_hash"], "nodes": c["items"]}, role,
                                   await hub.store.review_notes(key, role), await hub.store.signoffs(key))
                rows.append({"id": cid, "title": c["title"], "subject": c["subject"], "items": len(c["items"]), **st})
        return {"role": role, "packs": out, "graphs": graphs, "quran": qrow, "cards": cards, "contests": rows}

    @r.get("/lessons/{lid}", dependencies=needs(MODULE))
    async def lesson(lid: str, request: Request, role: str | None = None):
        m = await staff(request)
        raw = lesson_or_404(lid)
        role = role_for(m, lid, role)
        lib = hub.library
        hashes = _step_hashes(lib, lid)
        latest = _latest(await hub.store.review_notes(lid, role))
        steps = [{"n": k, "hash": hashes[k],
                  "last": (latest[k]["status"] if k in latest else None),
                  "changed": k in latest and latest[k]["step_hash"] != hashes[k],
                  "chips": latest[k]["chips"] if k in latest else [], "text": latest[k]["text"] if k in latest else ""}
                 for k in range(len(hashes))]
        key = None
        if raw.get("sheet"):
            lang = LANG_OF_ROLE.get(role, ("prs",))[0]
            key = sheets.answer_key(raw, 0, lang, lambda name: name)
        signs = await hub.store.signoffs(lid)
        return {"lesson": lib.lesson_for_app(lid), "hash": lib.hashes[lid], "short": lib.hashes[lid][7:15],
                "role": role, "needs": (raw.get("review") or {}).get("needs") or [], "steps": steps,
                "no_recording": _missing_clips(lib, lid, role), "key": key,
                "cards": lib.link_cards(lesson=lid), "sources": raw.get("sources", []),
                "signed": [{"role": s["role"], "initials": s["initials"], "date": s["signed_on"],
                            "current": s["content_hash"] == lib.hashes[lid]} for s in signs]}

    @r.post("/lessons/{lid}/steps/{n}", dependencies=needs(MODULE))
    async def note(lid: str, n: int, body: NoteIn, request: Request):
        m = await staff(request)
        lesson_or_404(lid)
        role = role_for(m, lid, body.role)
        hashes = _step_hashes(hub.library, lid)
        if not 0 <= n < len(hashes):
            raise HTTPException(404, "no such step")
        if body.step_hash != hashes[n]:
            raise HTTPException(409, "this step changed: open it again")
        if any(c not in REVIEW_CHIPS for c in body.chips):
            raise HTTPException(422, f"chips come from {', '.join(REVIEW_CHIPS)}")
        text = filters.scrub(body.text.strip())[0] if body.verdict == "change" else ""
        await hub.store.add_review_note(lesson=lid, step=n, role=role, step_hash=hashes[n], status=body.verdict,
                                        chips=body.chips if body.verdict == "change" else [], text=text)
        return {"ok": True}

    @r.post("/lessons/{lid}/sign", dependencies=needs(MODULE))
    async def sign(lid: str, body: SignIn, request: Request):
        m = await staff(request)
        raw = lesson_or_404(lid)
        role = role_for(m, lid, body.role)
        lib = hub.library
        if body.hash != lib.hashes[lid]:
            raise HTTPException(409, "the lesson changed: open it again")
        hashes = _step_hashes(lib, lid)
        latest = _latest(await hub.store.review_notes(lid, role))
        todo = [k for k in range(0, len(raw.get("steps", [])) + 1)
                if k not in latest or latest[k]["status"] != "ok" or latest[k]["step_hash"] != hashes[k]]
        if todo:
            raise HTTPException(409, f"steps not OK yet: {', '.join(map(str, todo))}")
        if lack := _missing_clips(lib, lid, role):
            raise HTTPException(409, f"no recording yet: steps {', '.join(map(str, lack))}")
        initials = m["initials"] or (body.initials or "").strip().upper()
        try:
            new = await hub.store.add_signoff(lesson=lid, content_hash=lib.hashes[lid], role=role, initials=initials,
                                              signed_on=datetime.now(timezone.utc).strftime("%Y-%m-%d"), via=m["via"])
        except ValueError as e:
            raise HTTPException(422, str(e)) from None
        return {"signed": True, "new": new, "role": role, "short": lib.hashes[lid][7:15]}

    def graph_or_404(sub: str) -> dict:
        if sub not in hub.library.graphs:
            raise HTTPException(404, "no such graph")
        return hub.library.graphs[sub]

    def graph_role(me: dict, g: dict, asked: str | None) -> str:
        role = me["role"] or (asked or "").strip()
        if not role:
            raise HTTPException(422, "say which role you review for")
        if role not in ((g.get("review") or {}).get("needs") or []):
            raise HTTPException(403, "this graph does not need your role")
        return role

    @r.get("/graphs/{sub}", dependencies=needs(MODULE))
    async def graph_page(sub: str, request: Request, role: str | None = None):
        m = await staff(request)
        g = graph_or_404(sub)
        role = graph_role(m, g, role)
        lib = hub.library
        hashes = _graph_hashes(g)
        latest = _latest(await hub.store.review_notes("graph:" + sub, role))
        steps = [{"n": k, "hash": hashes[k], "last": (latest[k]["status"] if k in latest else None),
                  "changed": k in latest and latest[k]["step_hash"] != hashes[k],
                  "chips": latest[k]["chips"] if k in latest else [], "text": latest[k]["text"] if k in latest else ""}
                 for k in range(len(hashes))]
        titles = {lid: {"title": l.get("title"), "year": l.get("year"),
                        "audience": lib.packs[lib.lesson_pack[lid]].get("audience", "child")}
                  for lid, l in lib.lessons.items()}
        signs = await hub.store.signoffs("graph:" + sub)
        return {"graph": {k: v for k, v in g.items() if not k.startswith("_") and k != "review"},
                "lessons": titles, "hash": g["_hash"], "short": g["_hash"][7:15], "role": role,
                "needs": (g.get("review") or {}).get("needs") or [], "steps": steps,
                "signed": [{"role": s["role"], "initials": s["initials"], "date": s["signed_on"],
                            "current": s["content_hash"] == g["_hash"]} for s in signs]}

    @r.post("/graphs/{sub}/steps/{n}", dependencies=needs(MODULE))
    async def graph_note(sub: str, n: int, body: NoteIn, request: Request):
        m = await staff(request)
        g = graph_or_404(sub)
        role = graph_role(m, g, body.role)
        hashes = _graph_hashes(g)
        if not 0 <= n < len(hashes):
            raise HTTPException(404, "no such node")
        if body.step_hash != hashes[n]:
            raise HTTPException(409, "this node changed: open it again")
        if any(c not in REVIEW_CHIPS for c in body.chips):
            raise HTTPException(422, f"chips come from {', '.join(REVIEW_CHIPS)}")
        text = filters.scrub(body.text.strip())[0] if body.verdict == "change" else ""
        await hub.store.add_review_note(lesson="graph:" + sub, step=n, role=role, step_hash=hashes[n],
                                        status=body.verdict, chips=body.chips if body.verdict == "change" else [],
                                        text=text)
        return {"ok": True}

    @r.post("/graphs/{sub}/sign", dependencies=needs(MODULE))
    async def graph_sign(sub: str, body: SignIn, request: Request):
        m = await staff(request)
        g = graph_or_404(sub)
        role = graph_role(m, g, body.role)
        if body.hash != g["_hash"]:
            raise HTTPException(409, "the graph changed: open it again")
        hashes = _graph_hashes(g)
        latest = _latest(await hub.store.review_notes("graph:" + sub, role))
        todo = [k for k in range(len(hashes))
                if k not in latest or latest[k]["status"] != "ok" or latest[k]["step_hash"] != hashes[k]]
        if todo:
            raise HTTPException(409, f"nodes not OK yet: {', '.join(map(str, todo))}")
        initials = m["initials"] or (body.initials or "").strip().upper()
        try:
            new = await hub.store.add_signoff(lesson="graph:" + sub, content_hash=g["_hash"], role=role,
                                              initials=initials,
                                              signed_on=datetime.now(timezone.utc).strftime("%Y-%m-%d"), via=m["via"])
        except ValueError as e:
            raise HTTPException(422, str(e)) from None
        return {"signed": True, "new": new, "role": role, "short": g["_hash"][7:15]}

    def quran_role(me: dict, asked: str | None):
        q = quran_set()
        if q is None:
            raise HTTPException(404, "no Quran set here")
        role = me["role"] or (asked or "").strip()
        if not role:
            raise HTTPException(422, "say which role you review for")
        if role not in ((q.index.get("review") or {}).get("needs") or []):
            raise HTTPException(403, "the Quran set does not need your role")
        return q, role

    @r.get("/quran", dependencies=needs(MODULE))
    async def quran_page(request: Request, role: str | None = None):
        m = await staff(request)
        q, role = quran_role(m, role)
        hashes = _quran_hashes(q)
        latest = _latest(await hub.store.review_notes(QURAN, role))
        steps = [{"n": k, "hash": hashes[k], "last": (latest[k]["status"] if k in latest else None),
                  "changed": k in latest and latest[k]["step_hash"] != hashes[k],
                  "chips": latest[k]["chips"] if k in latest else [], "text": latest[k]["text"] if k in latest else ""}
                 for k in range(len(hashes))]
        idx = q.index
        signs = await hub.store.signoffs(QURAN)
        return {"set": {"text": idx.get("text"), "translations": idx.get("translations"), "audio": idx.get("audio"),
                        "credits": q.credits(), "surahs": q.summary()["surahs"]},
                "hash": q.hash, "short": q.hash[7:15], "role": role,
                "needs": (idx.get("review") or {}).get("needs") or [], "steps": steps,
                "signed": [{"role": s["role"], "initials": s["initials"], "date": s["signed_on"],
                            "current": s["content_hash"] == q.hash} for s in signs]}

    @r.post("/quran/steps/{n}", dependencies=needs(MODULE))
    async def quran_note(n: int, body: NoteIn, request: Request):
        m = await staff(request)
        q, role = quran_role(m, body.role)
        hashes = _quran_hashes(q)
        if not 0 <= n < len(hashes):
            raise HTTPException(404, "no such surah")
        if body.step_hash != hashes[n]:
            raise HTTPException(409, "this surah changed: open it again")
        if any(c not in REVIEW_CHIPS for c in body.chips):
            raise HTTPException(422, f"chips come from {', '.join(REVIEW_CHIPS)}")
        text = filters.scrub(body.text.strip())[0] if body.verdict == "change" else ""
        await hub.store.add_review_note(lesson=QURAN, step=n, role=role, step_hash=hashes[n], status=body.verdict,
                                        chips=body.chips if body.verdict == "change" else [], text=text)
        return {"ok": True}

    @r.post("/quran/sign", dependencies=needs(MODULE))
    async def quran_sign(body: SignIn, request: Request):
        m = await staff(request)
        q, role = quran_role(m, body.role)
        if body.hash != q.hash:
            raise HTTPException(409, "the Quran set changed: open it again")
        hashes = _quran_hashes(q)
        latest = _latest(await hub.store.review_notes(QURAN, role))
        todo = [k for k in range(len(hashes))
                if k not in latest or latest[k]["status"] != "ok" or latest[k]["step_hash"] != hashes[k]]
        if todo:
            raise HTTPException(409, f"not OK yet: {', '.join(map(str, todo[:20]))}" + (" ..." if len(todo) > 20 else ""))
        initials = m["initials"] or (body.initials or "").strip().upper()
        try:
            new = await hub.store.add_signoff(lesson=QURAN, content_hash=q.hash, role=role, initials=initials,
                                              signed_on=datetime.now(timezone.utc).strftime("%Y-%m-%d"), via=m["via"])
        except ValueError as e:
            raise HTTPException(422, str(e)) from None
        return {"signed": True, "new": new, "role": role, "short": q.hash[7:15]}

    def card_set_role(me: dict, pid: str, asked: str | None):
        lib = hub.library
        items = lib.card_set(pid) if pid in lib.packs else []
        if not items:
            raise HTTPException(404, "no such card set")
        role = me["role"] or (asked or "").strip()
        if not role:
            raise HTTPException(422, "say which role you review for")
        if not any(role in ((x.get("review") or {}).get("needs") or []) for x in items):
            raise HTTPException(403, "this card set does not need your role")
        return items, role

    @r.get("/cards/{pid}", dependencies=needs(MODULE))
    async def cards_page(pid: str, request: Request, role: str | None = None):
        m = await staff(request)
        items, role = card_set_role(m, pid, role)
        lib = hub.library
        latest = _latest(await hub.store.review_notes(CARDS + pid, role))
        steps = [{"n": k, "hash": x["_hash"], "last": (latest[k]["status"] if k in latest else None),
                  "changed": k in latest and latest[k]["step_hash"] != x["_hash"],
                  "chips": latest[k]["chips"] if k in latest else [], "text": latest[k]["text"] if k in latest else "",
                  "needs": (x.get("review") or {}).get("needs") or [],
                  "item": {**{k2: v for k2, v in x.items() if not k2.startswith("_") and k2 != "review"},
                           "type": "checklist" if "steps" in x else "card",
                           "owner": (lib.sources.get(x.get("source")) or {}).get("owner")}}
                 for k, x in enumerate(items, 1)]
        h = lib.card_set_hash(pid)
        signs = await hub.store.signoffs(CARDS + pid)
        return {"pack": pid, "title": lib.packs[pid].get("title"), "hash": h, "short": h[7:15], "role": role,
                "steps": steps, "today": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "signed": [{"role": s["role"], "initials": s["initials"], "date": s["signed_on"],
                            "current": s["content_hash"] == h} for s in signs]}

    @r.post("/cards/{pid}/steps/{n}", dependencies=needs(MODULE))
    async def cards_note(pid: str, n: int, body: NoteIn, request: Request):
        m = await staff(request)
        items, role = card_set_role(m, pid, body.role)
        if not 1 <= n <= len(items):
            raise HTTPException(404, "no such card")
        if body.step_hash != items[n - 1]["_hash"]:
            raise HTTPException(409, "this card changed: open it again")
        if any(c not in REVIEW_CHIPS for c in body.chips):
            raise HTTPException(422, f"chips come from {', '.join(REVIEW_CHIPS)}")
        text = filters.scrub(body.text.strip())[0] if body.verdict == "change" else ""
        await hub.store.add_review_note(lesson=CARDS + pid, step=n, role=role, step_hash=items[n - 1]["_hash"],
                                        status=body.verdict, chips=body.chips if body.verdict == "change" else [],
                                        text=text)
        return {"ok": True}

    @r.post("/cards/{pid}/sign", dependencies=needs(MODULE))
    async def cards_sign(pid: str, body: SignIn, request: Request):
        m = await staff(request)
        items, role = card_set_role(m, pid, body.role)
        h = hub.library.card_set_hash(pid)
        if body.hash != h:
            raise HTTPException(409, "the card set changed: open it again")
        latest = _latest(await hub.store.review_notes(CARDS + pid, role))
        todo = [k for k, x in enumerate(items, 1)
                if k not in latest or latest[k]["status"] != "ok" or latest[k]["step_hash"] != x["_hash"]]
        if todo:
            raise HTTPException(409, f"cards not OK yet: {', '.join(map(str, todo))}")
        initials = m["initials"] or (body.initials or "").strip().upper()
        try:
            new = await hub.store.add_signoff(lesson=CARDS + pid, content_hash=h, role=role, initials=initials,
                                              signed_on=datetime.now(timezone.utc).strftime("%Y-%m-%d"), via=m["via"])
        except ValueError as e:
            raise HTTPException(422, str(e)) from None
        return {"signed": True, "new": new, "role": role, "short": h[7:15]}

    def contest_role(me: dict, cid: str, asked: str | None):
        c = hub.library.contests.get(cid)
        if not c:
            raise HTTPException(404, "no such contest")
        role = me["role"] or (asked or "").strip()
        if not role:
            raise HTTPException(422, "say which role you review for")
        if role not in ((c.get("review") or {}).get("needs") or []):
            raise HTTPException(403, "this contest does not need your role")
        return c, role

    @r.get("/contests/{cid}", dependencies=needs(MODULE))
    async def contest_page(cid: str, request: Request, role: str | None = None):
        m = await staff(request)
        c, role = contest_role(m, cid, role)
        lib = hub.library
        hashes = contests.item_hashes(c, lib)
        latest = _latest(await hub.store.review_notes(CONTEST + cid, role))
        keys = contests.key(lib, c)
        steps = [{"n": k, "hash": hashes[k], "last": (latest[k]["status"] if k in latest else None),
                  "changed": k in latest and latest[k]["step_hash"] != hashes[k],
                  "chips": latest[k]["chips"] if k in latest else [], "text": latest[k]["text"] if k in latest else "",
                  **({"item": {**c["items"][k - 1], "title": lib.lessons[c["items"][k - 1]["lesson"]].get("title"),
                               "question": contests.question(lib, c["items"][k - 1]), "answer": keys[k - 1]["answer"],
                               "why": keys[k - 1]["why"]}} if k else {})}
                 for k in range(len(hashes))]
        signs = await hub.store.signoffs(CONTEST + cid)
        return {"contest": {k: v for k, v in c.items() if not k.startswith("_") and k not in ("review", "items")},
                "hash": c["_hash"], "short": c["_hash"][7:15], "role": role,
                "needs": (c.get("review") or {}).get("needs") or [], "steps": steps,
                "signed": [{"role": s["role"], "initials": s["initials"], "date": s["signed_on"],
                            "current": s["content_hash"] == c["_hash"]} for s in signs]}

    @r.post("/contests/{cid}/steps/{n}", dependencies=needs(MODULE))
    async def contest_note(cid: str, n: int, body: NoteIn, request: Request):
        m = await staff(request)
        c, role = contest_role(m, cid, body.role)
        hashes = contests.item_hashes(c, hub.library)
        if not 0 <= n < len(hashes):
            raise HTTPException(404, "no such question")
        if body.step_hash != hashes[n]:
            raise HTTPException(409, "this question changed: open it again")
        if any(x not in REVIEW_CHIPS for x in body.chips):
            raise HTTPException(422, f"chips come from {', '.join(REVIEW_CHIPS)}")
        text = filters.scrub(body.text.strip())[0] if body.verdict == "change" else ""
        await hub.store.add_review_note(lesson=CONTEST + cid, step=n, role=role, step_hash=hashes[n],
                                        status=body.verdict, chips=body.chips if body.verdict == "change" else [],
                                        text=text)
        return {"ok": True}

    @r.post("/contests/{cid}/sign", dependencies=needs(MODULE))
    async def contest_sign(cid: str, body: SignIn, request: Request):
        m = await staff(request)
        c, role = contest_role(m, cid, body.role)
        if body.hash != c["_hash"]:
            raise HTTPException(409, "the contest or one of its lessons changed: open it again")
        hashes = contests.item_hashes(c, hub.library)
        latest = _latest(await hub.store.review_notes(CONTEST + cid, role))
        todo = [k for k in range(len(hashes))
                if k not in latest or latest[k]["status"] != "ok" or latest[k]["step_hash"] != hashes[k]]
        if todo:
            raise HTTPException(409, f"not OK yet: {', '.join(map(str, todo))}")
        initials = m["initials"] or (body.initials or "").strip().upper()
        try:
            new = await hub.store.add_signoff(lesson=CONTEST + cid, content_hash=c["_hash"], role=role,
                                              initials=initials,
                                              signed_on=datetime.now(timezone.utc).strftime("%Y-%m-%d"), via=m["via"])
        except ValueError as e:
            raise HTTPException(422, str(e)) from None
        return {"signed": True, "new": new, "role": role, "short": c["_hash"][7:15]}

    @r.get("/signoffs", dependencies=needs(MODULE))
    async def all_signoffs(request: Request):
        await staff(request)
        return {"signoffs": [{"lesson": s["lesson"], "hash": s["content_hash"], "role": s["role"],
                              "initials": s["initials"], "date": s["signed_on"], "via": s["via"]}
                             for s in await hub.store.all_signoffs()]}

    return r
