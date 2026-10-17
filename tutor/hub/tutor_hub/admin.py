"""The admin panel's routes (P21, C3.3 and DESIGN-C2C3-SPECS.md item 12). The page is `app/admin/` at `/admin/`; it
keeps nothing in the browser. The panel is the core's, not a module: it is what switches modules on and off.

Every route asks the staff gate for an admin first (staff.py `Gate.admin`): online a `staff` row whose role is admin,
behind Cloudflare Access; on the village hub the admin PIN (`X-Admin-Pin`), separate from the teacher's. No name
anywhere: cohorts have neutral labels (the label filter, F4), learners are counted, never listed, staff are labels,
and an email is typed only to add someone, then hashed with the pepper and dropped (C3.2).

Every change is logged with the admin's label: a module switch in `flag_log` (as `admin:<label>`), anything else in
`admin_log`. Phones see a change at their next `/api/hello`, within a minute.

- `GET  /api/m/admin/me`: her label and how she came in.
- `GET  /api/m/admin/cohorts`; `POST /api/m/admin/cohorts` `{label, langs, bands}`: a new cohort, with a random id,
  every module off but `recall` and `cert` (C4.1, C4.2) and a class code shown once.
- `GET  /api/m/admin/cohorts/{id}`: the cohort, its learner count, the kill switches, its settings, today's AI, and
  the module table (risk and the core's sentence, maturity, bands, on, settings and their schema, what locks it).
- `POST /api/m/admin/cohorts/{id}/kill` `{switch: ai|day, on, all?}`: the two kill switches (BUILD-PLAN 3.3).
- `POST /api/m/admin/cohorts/{id}/flags/{module}` `{enabled, settings?, confirm?, both?}`: a module on or off and its
  settings. A medium- or high-risk module needs `confirm`; a module whose dependencies are off needs `both`; a
  blocked capability needs paid-human moderation; a maturity the cohort does not take is refused. 409 says which.
- `POST /api/m/admin/cohorts/{id}/settings` `{settings}`: the cohort's settings (budget, moderation, maturity, the
  school day's timetable: "default" or the cohort's own template, checked by timetable.check; and its AI provider
  and model, `ai_provider` and `ai_model`, used from the next request). The cohort's page says which providers have
  their key set, as true or false: a key is a Worker secret or an environment variable, never shown or stored.
- `POST /api/m/admin/cohorts/{id}/code`: a new class code, shown once (the old one stops working);
  `POST .../cards` `{code}`: the class cards' address and QR (eight to an A4 page, nothing else on them).
- `GET  /api/m/admin/content`: packs, their lessons' sign-offs per role, what blocks a release, each cohort's
  release; the open review notes. `POST /api/m/admin/content/{pack}/publish|rollback` `{cohort}`.
- `GET  /api/m/admin/wishes`: the wishlist across cohorts; `POST` `{wkey, status: new|planned|not_for_qalam}`.
- `GET  /api/m/admin/spend`: per cohort and day, tokens, estimated cost, calls by purpose and held answers, against
  the cap (14 days); and the AI price table. `POST /api/m/admin/prices` `{provider, model, usd_in, usd_out}`: US
  dollars per million input and output tokens for a provider's model ('' for any of its models); both null removes it.
- `GET  /api/m/admin/safety`: per cohort and day, rules hits by kind; the oldest held item; leak and maths drops;
  disputes per sheet item. Counts only: the words stay with the teacher.
- `GET  /api/m/admin/staff`, `POST` `{email, label, role, cohorts, initials}`, `DELETE /staff/{id}`: labels, roles
  and cohorts; online only (on the hub the PINs are the staff gate).
- `GET  /api/m/admin/log[?cohort=]`: every change, newest first (kept two years).
"""
import hashlib
import json
import secrets
import string
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from . import flags, gates, learners, modules, packs, qr, timetable
from .ai import policy
from .ai.providers import keys_set
from .modules import BANDS
from .staff import id_hash, refuse
from .stores.base import WISH_STATUS

DAYS = 14                                    # AI spend and safety counts: two weeks
WARN = 80                                    # the spend bar turns warm at 80% of the cap
ROLES = ("teacher", "admin")                 # and every reviewer role a lesson names
KILLS = ("ai", "day")
ID_CHARS = string.ascii_lowercase + string.digits


class NewCohortIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: str = Field(min_length=1, max_length=40)
    langs: list[str] = Field(min_length=1, max_length=3)
    bands: list[str] = Field(min_length=1, max_length=6)


class KillIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    switch: str = Field(pattern="^(ai|day)$")
    on: bool
    all: bool = False


class FlagIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool
    settings: dict | None = None
    confirm: bool = False
    both: bool = False


class SettingsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    settings: dict


class CodeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=4, max_length=20)


class CohortIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cohort: str = Field(min_length=8, max_length=32)


class WishIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    wkey: str = Field(min_length=1, max_length=200)
    status: str = Field(pattern="^(new|planned|not_for_qalam)$")


class PriceIn(BaseModel):
    """One row of the AI price table (owner's decision, C5): US dollars per million tokens; both null removes it."""
    model_config = ConfigDict(extra="forbid")
    provider: str = Field(min_length=1, max_length=20)
    model: str = Field("", max_length=80)
    usd_in: float | None = Field(None, ge=0, le=10_000)
    usd_out: float | None = Field(None, ge=0, le=10_000)


class StaffIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(min_length=3, max_length=200)
    label: str = Field(min_length=1, max_length=40)
    role: str = Field(min_length=1, max_length=40)
    cohorts: list[str] = Field(default_factory=list, max_length=50)
    initials: str = Field("", max_length=4)


def new_id() -> str:
    return "".join(secrets.choice(ID_CHARS) for _ in range(10))


def module_settings_problems(m: dict, chosen) -> list[str]:
    """What is wrong with settings the admin typed for a module: unknown names, wrong types, out of range."""
    if chosen is None:
        return []
    if not isinstance(chosen, dict):
        return ["settings are an object"]
    spec = m.get("settings", {})
    p = [f"{k}: not a setting of {m['id']}" for k in chosen if k not in spec]
    for k, v in chosen.items():
        s = spec.get(k)
        if s is None:
            continue
        if type(v) is not type(s["default"]):
            p.append(f"{k}: must be {s['type']}")
        elif s["type"] == "int" and not s.get("min", v) <= v <= s.get("max", v):
            p.append(f"{k}: from {s.get('min')} to {s.get('max')}")
    return p


def diff_line(old: dict, new: dict) -> str:
    """'ai_budget 300000 -> 500000; moderation teacher -> paid-human': what a save changed, for the log."""
    keys = sorted(set(old) | set(new))
    def show(v):
        if v is None:
            return "unset"
        if isinstance(v, bool):
            return "on" if v else "off"
        if isinstance(v, dict):             # a timetable template: too long for a line, so its fingerprint
            return "template " + hashlib.sha256(json.dumps(v, sort_keys=True).encode()).hexdigest()[:8]
        return str(v)
    return "; ".join(f"{k} {show(old.get(k))} -> {show(new.get(k))}" for k in keys if old.get(k) != new.get(k))[:300]


def days_back(n: int) -> list[str]:
    today = datetime.now(timezone.utc).date()
    return [(today - timedelta(days=i)).isoformat() for i in range(n - 1, -1, -1)]


def router(hub) -> APIRouter:
    r = APIRouter(prefix="/api/m/admin")

    async def admin(request: Request) -> dict:
        return await hub.staff.admin(request)

    def by(me: dict) -> str:
        return f"admin:{me['label']}"[:60]

    async def cohort_or_404(cid: str) -> dict:
        c = await hub.store.cohort(cid)
        if not c:
            raise refuse(404, "no_cohort", "no such cohort")
        return c

    async def log(me, what, detail="", cohort=None):
        await hub.store.add_admin_log(cohort=cohort, what=what, detail=detail, changed_by=by(me))

    def base_url(request: Request) -> str:
        return hub.cfg.public_url if hub.cfg.home == "hub" else f"{request.url.scheme}://{request.url.netloc}"

    def open_id() -> str | None:
        return (hub.seeds.get("open") or {}).get("id")

    def lock_of(m: dict, cohort: dict) -> str | None:
        """Why a module cannot be switched on in this cohort: blocked without paid-human moderation, or a maturity
        the cohort does not take (drafts only where the cohort takes drafts: staging)."""
        if modules.risk(m) == "blocked" and not flags.paid_human(cohort):
            return "moderation"
        if m["id"] == "quran" and not (hub.library.quran is not None and hub.library.quran.signed):
            return "scholar"                           # C4.7: locked until a Hanafi scholar signs the set
        if m["id"] == "university" and not hub.library.university_ready():
            return "adviser"                           # C4.6: locked until the first card set is signed
        if cohort["id"] == open_id():                  # C4.9: the pilot's gate for photo; no Homework help in 2027
            if m["id"] in gates.OFF_IN_OPEN:
                return "open"
            if m["id"] == "photo" and gates.photo_open(hub.cfg.cohorts)[0]:
                return "gate"
        maturity = set((cohort.get("settings") or {}).get("maturity") or flags.DEFAULT_MATURITY)
        if m["maturity"] not in maturity:
            return "maturity"
        return None

    def photo_gate() -> dict:
        """The `open` recipe in the admin's hands (C4.9): the gate's problems, or its numbers and the budget rule."""
        problems, g = gates.photo_open(hub.cfg.cohorts)
        return {"open": not problems, "problems": problems,
                "tokens_per_mark": None if problems else g["tokens_per_mark"]}

    async def day_spend(cid: str) -> dict:
        today = days_back(1)[0]
        rows = await hub.store.ai_usage(cid, today)
        by_purpose = defaultdict(int)
        for x in rows:
            by_purpose[x["purpose"]] += x["calls"]
        return {"tokens": sum(x["tokens"] for x in rows), "calls": sum(x["calls"] for x in rows),
                "cost_micro": sum(x["cost_micro"] for x in rows), "held": sum(x["held"] for x in rows),
                "by_purpose": dict(by_purpose)}

    def pct(tokens: int, cap: int | None) -> int | None:
        if cap is None:
            return None
        return 100 if cap == 0 else min(999, round(100 * tokens / cap))

    @r.get("/me")
    async def me_(request: Request):
        me = await admin(request)
        return {"label": me["label"], "via": me["via"], "home": hub.cfg.home, "staff": hub.staff.mode == "access"}

    # --- cohorts ---

    @r.get("/cohorts")
    async def cohorts(request: Request):
        await admin(request)
        counts = await hub.store.learner_counts()
        out = []
        for c in await hub.store.cohorts():
            f = await hub.store.flags(c["id"])
            out.append({"id": c["id"], "label": c["label"], "langs": c["langs"], "bands": c["bands"],
                        "learners": counts.get(c["id"], 0), "ai": flags.ai_on(c),
                        "day": bool((f.get("timetable") or {}).get("enabled")), "own": c["id"] == hub.cohort_id})
        return {"cohorts": out}

    @r.post("/cohorts")
    async def new_cohort(body: NewCohortIn, request: Request):
        me = await admin(request)
        if (why := flags.label_problem(body.label)):
            raise HTTPException(422, why)
        if any(x not in flags.LANGS for x in body.langs) or any(x not in BANDS for x in body.bands):
            raise HTTPException(422, "unknown language or band")
        if any(c["label"].casefold() == body.label.strip().casefold() for c in await hub.store.cohorts()):
            raise HTTPException(409, "a cohort already has that label")
        settings = {"maturity": ["pilot", "stable"], "timetable": "default"}
        for _ in range(5):
            cid = new_id()
            if await hub.store.add_cohort(id=cid, label=body.label.strip(), langs=sorted(set(body.langs)),
                                          bands=[b for b in BANDS if b in body.bands], settings=settings):
                break
        else:
            raise HTTPException(503, "try again")
        # spaced review is on in new cohorts (C4.1): no AI, no free text, only its event leaves the phone; it shows
        # once the admin turns `lessons` on;
        # and certificates (C4.2): no AI, no free text, no name sent; they show where a pathway has one
        for mid in ("recall", "cert"):
            if mid in hub.modules:
                await hub.store.set_flag(cid, mid, enabled=True, settings={}, changed_by=by(me))
        code = learners.new_class_code()
        await hub.store.set_class_code(cid, learners.code_hash(learners.normal_code(code)))
        await log(me, "cohort.new", f"{body.label.strip()} ({', '.join(body.bands)}; {', '.join(body.langs)})", cid)
        await log(me, "cohort.code", "a new class code", cid)
        return {"id": cid, "label": body.label.strip(), "code": code}

    @r.get("/cohorts/{cid}")
    async def cohort(cid: str, request: Request):
        await admin(request)
        c = await cohort_or_404(cid)
        f = await hub.store.flags(cid)
        on = set(flags.enabled(hub.modules, c, f, None, hub.cfg.lacks, hub.held()))
        rows = []
        for mid in sorted(hub.modules):
            m = hub.modules[mid]
            flag = f.get(mid) or {}
            rows.append({"id": mid, "version": m["version"], "maturity": m["maturity"], "bands": m["bands"],
                         "capabilities": m.get("capabilities", []),
                         "depends": m["depends"], "needs": m["needs"], "risk": modules.risk(m),
                         "sentence": modules.risk_sentence(m), "enabled": bool(flag.get("enabled")), "on": mid in on,
                         "host": sorted(set(m["needs"]) & set(hub.cfg.lacks)),
                         "settings": flags.module_settings(m, flag.get("settings")), "schema": m["settings"],
                         "lock": lock_of(m, c), "changed_by": flag.get("changed_by"),
                         "changed_at": flag.get("changed_at")})
        spend = await day_spend(cid)
        cap = hub.gateway.cap(c["settings"])
        counts = await hub.store.learner_counts()
        # since when, and by whom, a kill switch is off (C5.2: "AI is off for this class since 14:30 (Teacher A)"),
        # from the Log; nothing new is stored
        since = {"ai": None, "day": None}
        for x in await hub.store.admin_log(cid, limit=200):
            if x["what"] != "cohort.kill":
                continue
            sw = "ai" if x["detail"].startswith("AI") else "day"
            if sw in since and since[sw] is None:
                since[sw] = {"off": x["detail"].endswith("off"), "at": x["at"], "by": x["changed_by"]}
        since = {k: ({"at": v["at"], "by": v["by"]} if v and v["off"] else None) for k, v in since.items()}
        return {"id": c["id"], "label": c["label"], "langs": c["langs"], "bands": c["bands"], "since": since,
                "learners": counts.get(cid, 0), "settings": c["settings"], "ai": flags.ai_on(c),
                "day": bool((f.get("timetable") or {}).get("enabled")), "own": cid == hub.cohort_id,
                "budget": hub.gateway.budget, "cap": cap, "spend": dict(spend, pct=pct(spend["tokens"], cap)),
                "gate": photo_gate() if cid == open_id() else None,
                "modules": rows, "moderation": flags.MODERATION, "maturities": modules.MATURITY,
                "ai_choice": ai_choice(),
                "timetable": {"default": timetable.DEFAULT, "days": timetable.DAYS, "kinds": timetable.KINDS,
                              "bands": timetable.BANDS, "subjects": timetable.SUBJECTS}}

    def ai_choice() -> dict:
        """The AI provider switch: the providers, the hub's default, each provider's default model, and which keys
        are set (true or false, never a key)."""
        p, cfg = hub.gateway.provider, hub.cfg
        return {"providers": list(policy.PROVIDERS), "default": p.name if p is not None else "off",
                "models": {"openai": cfg.openai_model or cfg.llm_model, "anthropic": cfg.anthropic_model,
                           "gemini": cfg.gemini_model, "openai_compat": cfg.compat_model, "local": cfg.llm_model,
                           "fake": "fake"},
                "keys": keys_set(cfg), "compat_host": policy.host_of(cfg.compat_url) if cfg.compat_url else None}

    async def kill_one(me, c: dict, switch: str, on: bool):
        if switch == "ai":
            s = dict(c["settings"])
            if on:
                s.pop("ai", None)                     # unset counts as on
            else:
                s["ai"] = False
            await hub.store.set_cohort_settings(c["id"], s)
            await log(me, "cohort.kill", "AI on" if on else "AI off", c["id"])
        else:
            f = (await hub.store.flags(c["id"])).get("timetable") or {}
            await hub.store.set_flag(c["id"], "timetable", enabled=on, settings=f.get("settings") or {},
                                     changed_by=by(me))
            await log(me, "cohort.kill", "school day and bells on" if on else "school day and bells off", c["id"])

    @r.post("/cohorts/{cid}/kill")
    async def kill(cid: str, body: KillIn, request: Request):
        me = await admin(request)
        targets = await hub.store.cohorts() if body.all else [await cohort_or_404(cid)]
        for c in targets:
            await kill_one(me, c, body.switch, body.on)
        return {"ok": True, "cohorts": len(targets)}

    @r.post("/cohorts/{cid}/flags/{mid}")
    async def set_flag(cid: str, mid: str, body: FlagIn, request: Request):
        me = await admin(request)
        c = await cohort_or_404(cid)
        m = hub.modules.get(mid)
        if not m:
            raise HTTPException(404, "no such module")
        if p := module_settings_problems(m, body.settings):
            raise HTTPException(422, "; ".join(p))
        f = await hub.store.flags(cid)
        settings = dict((f.get(mid) or {}).get("settings") or {}, **(body.settings or {}))
        if not body.enabled:
            await hub.store.set_flag(cid, mid, enabled=False, settings=settings, changed_by=by(me))
            return {"ok": True, "turned_on": []}
        # switching on: this module and every dependency that is off, deepest first
        todo, seen = [], set()

        def walk(x):
            if x in seen:
                return
            seen.add(x)
            for d in hub.modules[x]["depends"]:
                walk(d)
            if x == mid or not (f.get(x) or {}).get("enabled"):
                todo.append(x)
        walk(mid)
        for x in todo:
            why = lock_of(hub.modules[x], c)
            if why == "moderation":
                raise refuse(403, "locked", f"{x} needs paid human moderation")
            if why == "maturity":
                raise refuse(409, "locked", f"this cohort does not take {hub.modules[x]['maturity']} modules ({x})")
            if why == "open":
                raise refuse(409, "locked", f"{x} stays off in open in 2027 (C4.9)")
            if why == "scholar":
                raise refuse(409, "locked", "the Quran reader stays off until a Hanafi scholar has signed the Quran set "
                                    "(content/quran) at its current hash")
            if why == "adviser":
                raise refuse(409, "locked", "university preparation stays off until its first card set (the checklist "
                                    "and a card) is signed by an adviser and the Dari and Pashto readers")
            if why == "gate":
                raise refuse(409, "photo_gate", "photo marking waits for the pilot's four numbers: "
                                    + "; ".join(gates.photo_open(hub.cfg.cohorts)[0]))
        missing = [x for x in todo if x != mid]
        risky = [x for x in todo if modules.risk(hub.modules[x]) in ("medium", "high")
                 and not (x == mid and (f.get(x) or {}).get("enabled"))]
        need = (["both"] if missing and not body.both else []) + (["confirm"] if risky and not body.confirm else [])
        if need:
            return JSONResponse({"error": "confirm first", "code": "confirm_first", "need": need, "missing": missing,
                                 "risks": [{"id": x, "risk": modules.risk(hub.modules[x]),
                                            "capabilities": hub.modules[x].get("capabilities", []),
                                            "sentence": modules.risk_sentence(hub.modules[x])} for x in risky]},
                                status_code=409)
        for x in todo:
            keep = settings if x == mid else (f.get(x) or {}).get("settings") or {}
            await hub.store.set_flag(cid, x, enabled=True, settings=keep, changed_by=by(me))
        return {"ok": True, "turned_on": todo}

    @r.post("/cohorts/{cid}/settings")
    async def settings_(cid: str, body: SettingsIn, request: Request):
        me = await admin(request)
        c = await cohort_or_404(cid)
        new = dict(c["settings"])
        for k, v in body.settings.items():
            if v is None:
                new.pop(k, None)
            else:
                new[k] = v
        if p := flags.settings_problems(new):
            if any(x.startswith("settings.ai_budget") for x in p):
                raise refuse(422, "budget", "; ".join(p))
            raise HTTPException(422, "; ".join(p))
        try:
            hub.gateway.provider_for(new)             # a provider this hub cannot make is refused here, not at a call
        except policy.PolicyError as e:
            raise HTTPException(422, str(e)) from None
        line = diff_line(c["settings"], new)
        if line:
            await hub.store.set_cohort_settings(cid, new)
            await log(me, "cohort.settings", line, cid)
        return {"ok": True, "settings": new, "changed": line}

    @r.post("/cohorts/{cid}/code")
    async def new_code(cid: str, request: Request):
        me = await admin(request)
        await cohort_or_404(cid)
        code = learners.new_class_code()
        await hub.store.set_class_code(cid, learners.code_hash(learners.normal_code(code)))
        await log(me, "cohort.code", "a new class code (the old one stopped working)", cid)
        return {"code": code, "url": base_url(request).rstrip("/") + "/?join=" + learners.normal_code(code)}

    @r.post("/cohorts/{cid}/cards")
    async def cards(cid: str, body: CodeIn, request: Request):
        await admin(request)
        c = await cohort_or_404(cid)
        code = learners.normal_code(body.code)
        found = await hub.store.cohort_by_code(learners.code_hash(code)) if code else None
        if not found or found["id"] != c["id"]:
            raise HTTPException(404, "this is not this cohort's code")
        url = base_url(request).rstrip("/") + "/?join=" + code
        return {"code": code[:4] + "-" + code[4:], "url": url, "svg": qr.svg(url, 34, url=True)}

    # --- content ---

    def signed_roles(lid: str, signs: list[dict]) -> dict[str, bool]:
        lib = hub.library
        raw = lib.lessons[lid]
        needs = (raw.get("review") or {}).get("needs") or []
        h = lib.hashes[lid]
        offs = {(s["role"], s["content_hash"]) for s in signs if s["lesson"] == lid}
        offs |= {(s.get("role"), s.get("hash")) for s in (raw.get("review") or {}).get("signoffs") or []
                 if isinstance(s, dict)}
        return {role: (role, h) in offs for role in needs}

    def pack_view(pid: str, signs: list[dict]) -> dict:
        lib = hub.library
        pack = lib.packs[pid]
        clips = pack.get("_clips", {})
        roles: dict[str, list[int]] = defaultdict(lambda: [0, 0])
        lessons, problems = [], []
        for lid in pack["lessons"]:
            if lid not in lib.lessons:
                continue
            raw = lib.lessons[lid]
            got = signed_roles(lid, signs)
            for role, ok in got.items():
                roles[role][1] += 1
                roles[role][0] += int(ok)
            state = "signed" if got and all(got.values()) else lib.states.get(lid, "draft")
            problems += packs.release_problems(raw, state, pack, clips)
            lessons.append({"id": lid, "title": raw.get("title"), "state": state, "roles": got})
        return {"id": pid, "title": pack.get("title"), "version": pack.get("version"), "hash": lib.pack_hash(pid),
                "lessons": lessons, "roles": {k: {"signed": v[0], "of": v[1]} for k, v in sorted(roles.items())},
                "problems": problems[:50], "publishable": bool(lessons) and not problems}

    @r.get("/content")
    async def content(request: Request):
        await admin(request)
        lib = hub.library
        signs = await hub.store.all_signoffs()
        cohorts = await hub.store.cohorts()
        out = []
        for pid in lib.packs:
            v = pack_view(pid, signs)
            v["releases"] = {}
            for c in cohorts:
                rel = [x for x in await hub.store.releases(c["id"]) if x["pack"] == pid]
                if rel:
                    v["releases"][c["id"]] = {"version": rel[0]["version"], "short": rel[0]["content_hash"][7:15],
                                              "at": rel[0]["released_at"], "current": rel[0]["content_hash"] == v["hash"],
                                              "earlier": len({x["content_hash"] for x in rel}) > 1}
            out.append(v)
        latest = {}
        for n in await hub.store.review_notes(None):
            latest[(n["lesson"], n["step"], n["role"])] = n
        notes = [{"lesson": n["lesson"], "title": (lib.lessons.get(n["lesson"]) or {}).get("title"), "step": n["step"],
                  "role": n["role"], "chips": n["chips"], "text": n["text"], "at": n["at"]}
                 for n in latest.values() if n["status"] == "change"]
        notes.sort(key=lambda n: n["at"], reverse=True)
        return {"packs": out, "notes": notes[:200], "cohorts": [{"id": c["id"], "label": c["label"]} for c in cohorts],
                "release_mode": hub.cfg.release}

    @r.post("/content/{pid}/publish")
    async def publish(pid: str, body: CohortIn, request: Request):
        me = await admin(request)
        if pid not in hub.library.packs:
            raise HTTPException(404, "no such pack")
        await cohort_or_404(body.cohort)
        v = pack_view(pid, await hub.store.all_signoffs())
        if not v["publishable"]:
            return JSONResponse({"error": "not every lesson is signed for this content", "problems": v["problems"]},
                                status_code=409)
        await hub.store.add_release(pack=pid, version=str(v["version"]), content_hash=v["hash"], cohort=body.cohort,
                                    released_by="admin")
        await log(me, "release", f"{pid} {v['version']} ({v['hash'][7:15]})", body.cohort)
        return {"ok": True, "version": v["version"], "short": v["hash"][7:15]}

    @r.post("/content/{pid}/rollback")
    async def rollback(pid: str, body: CohortIn, request: Request):
        me = await admin(request)
        if pid not in hub.library.packs:
            raise HTTPException(404, "no such pack")
        await cohort_or_404(body.cohort)
        rel = [x for x in await hub.store.releases(body.cohort) if x["pack"] == pid]
        prev = next((x for x in rel if rel and x["content_hash"] != rel[0]["content_hash"]), None)
        if prev is None:
            raise HTTPException(409, "no earlier release to go back to")
        await hub.store.add_release(pack=pid, version=prev["version"], content_hash=prev["content_hash"],
                                    cohort=body.cohort, released_by="admin")
        await log(me, "rollback", f"{pid} back to {prev['version']} ({prev['content_hash'][7:15]})", body.cohort)
        return {"ok": True, "version": prev["version"], "short": prev["content_hash"][7:15],
                "current_files": prev["content_hash"] == hub.library.pack_hash(pid)}

    # --- the wishlist across cohorts ---

    @r.get("/wishes")
    async def wishes(request: Request):
        await admin(request)
        labels = {c["id"]: c["label"] for c in await hub.store.cohorts()}
        out: dict[str, dict] = {}
        for w in await hub.store.wishes(None, limit=1000):
            x = out.setdefault(w["wkey"], {"wkey": w["wkey"], "text": w["wish"], "count": 0, "bands": set(),
                                           "langs": set(), "cohorts": set(), "first_day": w["first_day"],
                                           "last_day": w["last_day"], "status": "new"})
            x["count"] += w["count"]
            x["bands"].add(w["band"])
            x["langs"].add(w["lang"])
            x["cohorts"].add(labels.get(w["cohort"], "?"))
            x["first_day"], x["last_day"] = min(x["first_day"], w["first_day"]), max(x["last_day"], w["last_day"])
            if w.get("status") and w["status"] != "new":
                x["status"] = w["status"]
        rows = [dict(x, bands=[b for b in BANDS if b in x["bands"]], langs=sorted(x["langs"]),
                     cohorts=sorted(x["cohorts"])) for x in out.values()]
        rows.sort(key=lambda x: x["last_day"], reverse=True)
        rows.sort(key=lambda x: -x["count"])
        return {"wishes": rows[:300], "statuses": WISH_STATUS}

    @r.post("/wishes")
    async def wish(body: WishIn, request: Request):
        me = await admin(request)
        n = await hub.store.set_wish_status(body.wkey, body.status)
        if not n:
            raise HTTPException(404, "no such wish")
        await log(me, "wish", f"a wish marked {body.status.replace('_', ' ')}")
        return {"ok": True}

    # --- AI spend and safety, counts only ---

    @r.get("/spend")
    async def spend(request: Request):
        await admin(request)
        days = days_back(DAYS)
        out = []
        for c in await hub.store.cohorts():
            rows = await hub.store.ai_usage(c["id"], days[0])
            per = {d: {"day": d, "tokens": 0, "cost_micro": 0, "calls": 0, "held": 0} for d in days}
            purposes = defaultdict(int)
            for x in rows:
                if x["day"] in per:
                    for k in ("tokens", "cost_micro", "calls", "held"):
                        per[x["day"]][k] += x[k]
                    purposes[x["purpose"]] += x["calls"]
            cap = hub.gateway.cap(c["settings"])
            today = per[days[-1]]
            p = pct(today["tokens"], cap)
            out.append({"id": c["id"], "label": c["label"], "ai": flags.ai_on(c), "cap": cap, "days": list(per.values()),
                        "today": dict(today, pct=p, warn=p is not None and p >= WARN),
                        "by_purpose": dict(purposes),
                        "cost_micro": sum(x["cost_micro"] for x in per.values())})
        return {"cohorts": out, "days": days, "prices": await hub.store.ai_prices(), "providers": list(policy.PROVIDERS)}

    @r.post("/prices")
    async def price(body: PriceIn, request: Request):
        """The AI price table (empty by default, so every estimate is $0 until the admin types a price): one
        provider and model, or '' for any model of that provider; from the next call on, in the Log."""
        me = await admin(request)
        if (body.usd_in is None) != (body.usd_out is None):
            raise HTTPException(422, "both prices, or neither to remove the row")
        try:
            await hub.store.set_ai_price(provider=body.provider, model=body.model.strip(), usd_in=body.usd_in,
                                         usd_out=body.usd_out)
        except ValueError as e:
            raise HTTPException(422, str(e)) from None
        hub.gateway._prices = None                    # this isolate prices the next call at once; others within a minute
        name = f"{body.provider} {body.model.strip() or '(any model)'}"
        await log(me, "prices", f"{name}: removed" if body.usd_in is None
                  else f"{name}: ${body.usd_in:g} in, ${body.usd_out:g} out per million tokens")
        return {"ok": True, "prices": await hub.store.ai_prices()}

    @r.get("/safety")
    async def safety(request: Request):
        await admin(request)
        days = days_back(DAYS)
        now = datetime.now(timezone.utc)
        out = []
        for c in await hub.store.cohorts():
            evs = await hub.store.events_since(c["id"], days[0] + "T00:00")
            per = {d: {"day": d, "distress": 0, "health": 0, "off_limits": 0} for d in days}
            drops = {"leak": 0, "maths": 0}
            disputes = defaultdict(int)
            for e in evs:
                if e["verb"] == "safety.flag":
                    d = per.get(e["at"][:10])
                    if e["object"] in drops:
                        drops[e["object"]] += 1
                    elif d is not None and e["object"] in d:
                        d[e["object"]] += 1
                elif e["verb"] == "check.dispute":
                    disputes[e["object"]] += 1
            held = [q for q in await hub.store.queue(limit=200, cohort=c["id"], own=c["id"] == hub.cohort_id)
                    if q["status"] == "held"]
            oldest = min((q["created"] for q in held), default=None)
            hours = int((now - datetime.fromisoformat(oldest)).total_seconds() // 3600) if oldest else None
            top = sorted(disputes.items(), key=lambda x: (-x[1], x[0]))[:10]
            out.append({"id": c["id"], "label": c["label"], "days": list(per.values()), "held": len(held),
                        "oldest_held_hours": hours, "drops": drops,
                        "disputes": [{"item": k, "n": n} for k, n in top]})
        return {"cohorts": out, "days": days, "kinds": ["distress", "health", "off_limits"]}

    # --- staff (online only: on the hub the PINs are the gate) ---

    def staff_online():
        if hub.staff.mode != "access":
            raise HTTPException(409, "on the hub the PINs open the staff pages: there is no staff list")

    def roles() -> list[str]:
        lib = hub.library                 # every reviewer role a lesson, graph, the Quran set or a card set names
        q = lib.quran.index if lib.quran is not None and lib.quran.ok and lib.quran.index else None
        pages = [*lib.lessons.values(), *lib.graphs.values(), *([q] if q else []),
                 *[x for pid in lib.packs for x in lib.card_set(pid)]]
        lesson_roles = {x for l in pages for x in (l.get("review") or {}).get("needs") or []}
        return list(ROLES) + sorted(lesson_roles)

    @r.get("/staff")
    async def staff_(request: Request):
        await admin(request)
        staff_online()
        labels = {c["id"]: c["label"] for c in await hub.store.cohorts()}
        rows = [{"id": s["id_hash"], "label": s["label"], "role": s["role"], "initials": s["initials"],
                 "cohorts": [{"id": x, "label": labels.get(x, "?")} for x in s["cohorts"]], "added": s["added_at"][:10]}
                for s in await hub.store.staff_list()]
        return {"staff": rows, "roles": roles()}

    @r.post("/staff")
    async def staff_add(body: StaffIn, request: Request):
        me = await admin(request)
        staff_online()
        email = body.email.strip()
        if "@" not in email or " " in email:
            raise HTTPException(422, "an email, as Cloudflare Access knows it")
        h = id_hash(hub.cfg.staff_pepper, email)
        del email                                       # hashed with the pepper: the email is not kept anywhere
        body.email = ""
        if "@" in body.label or flags.label_problem(body.label):
            raise HTTPException(422, "a neutral label, like 'Teacher A'")
        known = {c["id"] for c in await hub.store.cohorts()}
        if any(x not in known for x in body.cohorts):
            raise HTTPException(422, "unknown cohort")
        if body.role not in roles():
            raise HTTPException(422, f"a role: {', '.join(roles())}")
        try:
            await hub.store.add_staff(id_hash=h, label=body.label.strip(), role=body.role, cohorts=body.cohorts,
                                      initials=body.initials.strip().upper())
        except ValueError as e:
            raise HTTPException(422, str(e)) from None
        await log(me, "staff.add", f"{body.label.strip()} ({body.role})")
        return {"ok": True}

    @r.delete("/staff/{sid}")
    async def staff_remove(sid: str, request: Request):
        me = await admin(request)
        staff_online()
        rows = await hub.store.staff_list()
        row = next((s for s in rows if s["id_hash"] == sid), None)
        if row is None:
            raise HTTPException(404, "no such staff member")
        if row["role"] == "admin" and sum(1 for s in rows if s["role"] == "admin") == 1:
            raise refuse(409, "last_admin", "the last admin cannot be removed")
        await hub.store.remove_staff(sid)
        await log(me, "staff.remove", f"{row['label']} ({row['role']})")
        return {"ok": True}

    # --- the log ---

    @r.get("/log")
    async def log_(request: Request, cohort: str | None = None):
        await admin(request)
        labels = {c["id"]: c["label"] for c in await hub.store.cohorts()}
        ids = [cohort] if cohort else list(labels)
        rows = []
        for cid in ids:
            for x in await hub.store.flag_log(cid, limit=200):
                state = "on" if x["enabled"] else "off"
                extra = ", ".join(f"{k} {v}" for k, v in sorted((x["settings"] or {}).items()))
                rows.append({"at": x["changed_at"], "cohort": labels.get(cid, cid), "what": "module",
                             "detail": f"{x['module']} {state}" + (f" ({extra})" if extra else ""),
                             "by": x["changed_by"]})
        for x in await hub.store.admin_log(cohort, limit=300):
            rows.append({"at": x["at"], "cohort": labels.get(x["cohort"], "") if x["cohort"] else "",
                         "what": x["what"], "detail": x["detail"], "by": x["changed_by"]})
        rows.sort(key=lambda x: x["at"], reverse=True)
        return {"log": rows[:300]}

    return r
