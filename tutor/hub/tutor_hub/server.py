"""The hub's web server: the app for phones, lessons, Ask, worksheets, printing and the teacher's page.

Every phone on the hub's Wi-Fi opens http://10.42.0.1 (or scans the hub card) and gets the app from here.
The API is small and plain JSON; docs/ARCHITECTURE.md lists every route.
"""
import asyncio
import hmac
import logging
import random
import secrets
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr

from . import __version__, events, flags, learners, modules, search, sheets
from .ai import Gateway, gateway as ai_gateway, make_provider
from .brain import Brain
from .config import Config
from .packs import Library, picture_file
from .packs import text as pick_text
from .printing import Printer, PrintQueue
from .stores import SqliteStore

log = logging.getLogger("tutor.hub")
LANGS = ("prs", "ps", "en")


class AskIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    lang: str = "prs"
    subject: str | None = None
    year: int | None = Field(None, ge=0, le=12)
    lesson: str | None = None


class ReviewIn(BaseModel):
    answer: str | None = Field(None, max_length=4000)
    approve: bool = True


class PrintIn(BaseModel):
    lesson: str
    kind: Literal["worksheet", "answers"] = "worksheet"
    copies: int = Field(1, ge=1, le=60)
    lang: str = "prs"
    seed: int | None = Field(None, ge=0, le=99999)
    name: str | None = Field(None, max_length=40)


class EventIn(BaseModel):
    """One event from a phone's queue: these four fields and nothing else (events.py checks what is in them)."""
    model_config = ConfigDict(extra="forbid")
    at: StrictStr = Field(..., max_length=16)
    verb: StrictStr = Field(..., max_length=32)
    object: StrictStr | None = Field(None, max_length=64)
    value: StrictInt | None = None


class ConsentIn(BaseModel):
    """A consent record: its kind, the text version shown and the minute; never who agreed."""
    model_config = ConfigDict(extra="forbid")
    kind: Literal["guardian-on-phone", "self", "partner-paper"]
    version: StrictStr = Field(..., max_length=40)
    at: StrictStr | None = Field(None, max_length=16)


class JoinIn(BaseModel):
    """Joining: a band, a language and an alias picture, a class code if she has one, consent if given. Nothing else."""
    model_config = ConfigDict(extra="forbid")
    cohort_code: StrictStr | None = Field(None, max_length=20)
    band: Literal["ey", "p1", "p2", "s1", "s2", "ad"]
    lang: Literal["prs", "ps", "en"]
    picture: StrictStr = Field(..., max_length=24)
    consent: ConsentIn | None = None


class MeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    band: Literal["ey", "p1", "p2", "s1", "s2", "ad"] | None = None
    consent: ConsentIn | None = None


class EventsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    events: list[EventIn] = Field(..., min_length=1, max_length=events.MAX_BATCH)


# after each round of five wrong PINs a phone waits longer: a minute, 15 minutes, then an hour each time
PIN_LOCKS = (60, 15 * 60, 60 * 60)


class Limit:
    """At most `n` requests in `per` seconds from one phone: on the hub known by its address on the hub's Wi-Fi;
    online by her learner token, since many phones reach the Worker from one address (`Hub.who`)."""

    def __init__(self, n: int, per: float):
        self.n, self.per = n, per
        self._seen: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def check(self, who: str):
        now = time.monotonic()
        with self._lock:
            recent = [t for t in self._seen.get(who, []) if now - t < self.per]
            if len(recent) >= self.n:
                self._seen[who] = recent
                raise HTTPException(429, "too many at once: wait a minute")
            self._seen[who] = recent + [now]


def teacher_pin(data: Path) -> str:
    """The teacher's PIN: made on first start, kept in the data folder, shown by `python -m tutor_hub pin`."""
    f = data / "teacher-pin.txt"
    if not f.exists():
        data.mkdir(parents=True, exist_ok=True)
        f.write_text(f"{secrets.randbelow(900000) + 100000}\n", encoding="utf-8")
        f.chmod(0o600)
        log.warning("a new teacher PIN was made: run `python -m tutor_hub pin` on the hub to see it")
    return f.read_text(encoding="utf-8").strip()


class Hub:
    """Everything the routes share. Making one touches no database: `start()` does that, from the app's lifespan.

    `store`: SQLite in the data folder unless another is given (the Worker gives `D1Store(env.DB)`)."""

    def __init__(self, cfg: Config, store=None):
        self.cfg = cfg
        if store is None:
            cfg.data.mkdir(parents=True, exist_ok=True)
            store = SqliteStore(cfg.data / "hub.db")
        self.store = store
        self.library = Library(cfg.packs, release=cfg.release)
        self.modules, self.module_problems = modules.load(cfg.modules)
        self.seeds, self.seed_problems = flags.load_seeds(cfg.cohorts)
        self.cohort_id = cfg.cohort or (self.seeds.get("hub") or {}).get("id")
        # the AI gateway: a provider the policy refuses stops the hub here, before it serves anyone
        self.gateway = Gateway(make_provider(cfg), store=self.store, manifests=self.modules, ai_langs=cfg.ai_langs,
                               budget=cfg.ai_budget, timeout=cfg.llm_timeout, cohort=self.cohort_id)
        self._ix_lock = asyncio.Lock()
        self.brain = Brain(None, self.gateway)     # the search index is built in start()
        self.printer = Printer("off" if "printer" in cfg.lacks else cfg.print_backend, cfg.printer,
                               cfg.data / "outbox")
        self.prints: PrintQueue | None = None
        self.pin = None if "pin" in cfg.lacks else teacher_pin(cfg.data)   # no PIN: the teacher module is off
        self._fails: dict[str, tuple[int, float, int, float]] = {}   # who -> wrong tries, locked until, rounds, last lock
        self._pin_lock = threading.Lock()
        self.clock = time.monotonic
        self.print_lock = asyncio.Lock()
        self.ask_limit = Limit(10, 60)
        self.pdf_limit = Limit(10, 60)
        self.event_limit = Limit(30, 60)
        self.join_limit = Limit(20, 3600)
        self.aliases = set(learners.load_aliases())
        self.consent_texts = learners.load_consent()
        self.consent_version = learners.CONSENT_VERSIONS[cfg.home]

    async def start(self):
        await self.store.open()
        if await self.store.seed_cohorts(flags.seed_rows(self.seeds)):
            log.info("cohorts seeded from %s", self.cfg.cohorts)
        if not self.cohort_id or not await self.store.cohort(self.cohort_id):
            log.error("this hub's cohort (TUTOR_COHORT=%s) does not exist: every module is off", self.cohort_id)
        await self.store.prune(self.cfg.keep_days)
        await self.store.prune_events(events.KEEP_DAYS)
        await self.store.prune_ai_usage(ai_gateway.KEEP_DAYS)
        await self.store.prune_learners(learners.IDLE_DAYS)
        await self.store.fail_unfinished_prints()
        await self.reindex()
        if "printer" not in self.cfg.lacks:       # the queue's thread is the hub's; the Worker has no printer
            self.prints = PrintQueue(self.store.sync, self.printer, self.render_pdf)

    async def stop(self):
        await self.gateway.aclose()
        await self.store.close()

    def check_pin(self, pin: str | None, who: str):
        with self._pin_lock:
            now = self.clock()
            n, until, rounds, last = self._fails.get(who, (0, 0.0, 0, 0.0))
            if now < until:
                raise HTTPException(429, "too many wrong PINs: wait and try again later")
            if rounds and now - last > 24 * 3600:         # a quiet day: back to a one-minute wait
                rounds = 0
            if pin and self.pin and hmac.compare_digest(pin.strip().encode(), self.pin.encode()):
                self._fails.pop(who, None)
                return
            n += 1
            if n >= 5:
                wait = PIN_LOCKS[min(rounds, len(PIN_LOCKS) - 1)]
                self._fails[who] = (0, now + wait, rounds + 1, now)
                log.warning("teacher PIN: 5 wrong tries from %s, locked for %d minutes", who, wait // 60)
            else:
                self._fails[who] = (n, 0.0, rounds, last)
            raise HTTPException(401, "teacher PIN needed")

    async def record(self, verb: str, obj=None, value=None, cohort_id: str | None = None):
        """An event the hub writes itself (Ask, printing, a sheet key, the teacher's review). It never breaks the
        route that made it: a problem is logged and the route carries on."""
        e = {"at": events.minute(), "verb": verb, "object": obj, "value": value}
        problems = events.check(e, phone=False)
        cid = cohort_id or self.cohort_id
        if problems or not cid:
            log.warning("event %s not kept: %s", verb, "; ".join(problems) or "no cohort")
            return
        try:
            await self.store.add_events([events.row(e, cohort=cid)])
        except Exception:
            log.exception("event %s not kept", verb)

    async def learner(self, request: Request, required: bool = True):
        """The learner whose token the request carries (X-Learner-Token), with today as her last day seen; None
        without one, or 401 when `required`."""
        token = request.headers.get(learners.HEADER) or ""
        row = await self.store.learner(learners.token_hash(token)) if learners.TOKEN.match(token) else None
        if row is None:
            if required:
                raise HTTPException(401, "this learner is not known here: join again")
            return None
        today = learners.day()
        if row["last_seen"] != today:
            await self.store.update_learner(row["token_hash"], last_seen=today)
        return row

    def who(self, request: Request) -> str:
        """Whom a per-phone limit counts: online her learner token (by its hash) when the request carries one, since
        a Worker sees many phones behind one address; on the hub, and without a token, the address."""
        token = request.headers.get(learners.HEADER) or ""
        if self.cfg.home == "online" and learners.TOKEN.match(token):
            return "t:" + learners.token_hash(token)[:32]
        return _who(request)

    def consent_changes(self, c) -> dict:
        if c.version not in {v for (_, v) in self.consent_texts}:
            raise HTTPException(422, "unknown consent text version")
        return {"consent_kind": c.kind, "consent_version": c.version, "consent_at": learners.consent_at(c.at)}

    async def reindex(self):
        async with self._ix_lock:
            self.brain.index = search.build(self.library, await self.store.approved())

    def lesson(self, lid: str) -> dict:
        l = self.library.lessons.get(lid)
        if not l:
            raise HTTPException(404, "no such lesson")
        return l

    def sheet_html(self, lid, *, lang, seed, kind="worksheet", name=None, for_pdf=False):
        l = self.lesson(lid)
        if not l.get("sheet"):
            raise HTTPException(404, "this lesson has no sheet")
        fonts = (self.cfg.app / "fonts").resolve().as_uri() if for_pdf else "/fonts"
        return sheets.page(l, lang=lang, seed=seed, kind=kind, name=name, fonts=fonts,
                           picture_url=self.picture_url(lid, for_pdf), hub_name=self.cfg.name)

    def picture_url(self, lid: str, for_pdf: bool = False):
        """name -> the picture's address: a file:// path for the PDF maker, a web path for phones."""
        pdir, pid = self.library.pack_dir(lid), self.library.lesson_pack[lid]

        def url(name):
            f = picture_file(pdir, name)
            if not f:
                return ""
            return f.resolve().as_uri() if for_pdf else f"/packs/{pid}/pictures/{f.name}"
        return url

    def render_pdf(self, spec: dict):
        if spec.get("card"):
            html_text = sheets.hub_card(name=self.cfg.name, url=self.cfg.public_url, ssid=self.cfg.wifi_ssid,
                                        password=self.cfg.wifi_password,
                                        fonts=(self.cfg.app / "fonts").resolve().as_uri())
        else:
            html_text = self.sheet_html(spec["lesson"], lang=spec["lang"], seed=spec["seed"], kind=spec["kind"],
                                        name=spec.get("name"), for_pdf=True)
        return sheets.render_pdf(html_text, base_url=str(self.cfg.app))

    async def cohort_modules(self, cohort_id: str | None = None, band: str | None = None):
        """(the cohort, its flags, the ids of the modules on for it); the cohort is None if there is no such cohort.

        Read from the store on every call, so a switch the admin flips reaches the next request."""
        cohort = await self.store.cohort(cohort_id or self.cohort_id or "")
        if not cohort:
            return None, {}, []
        f = await self.store.flags(cohort["id"])
        return cohort, f, flags.enabled(self.modules, cohort, f, band, self.cfg.lacks)

    async def hello(self, cohort_id: str | None = None, band: str | None = None) -> dict:
        cohort, f, on = await self.cohort_modules(cohort_id, band)
        if cohort_id and not cohort:
            raise HTTPException(404, "no such cohort")
        ai_on = await self.gateway.available()
        mods = []
        for mid in on:
            m = self.modules[mid]
            mods.append({"id": mid, "version": m["version"], "slots": m["slots"], "bands": m["bands"],
                         "needs": m["needs"], "offline": m["offline"], "risk": modules.risk(m),
                         "settings": flags.module_settings(m, (f.get(mid) or {}).get("settings"))})
        return {"hub": self.cfg.name, "version": __version__, "core": __version__, "lessons": len(self.library.lessons),
                "ai": {"on": ai_on, "langs": list(self.cfg.ai_langs) if ai_on else []},
                "printer": self.printer.status(), "free_copies": self.cfg.free_copies,
                "url": self.cfg.public_url, "release": self.cfg.release, "consent": self.consent_version,
                "home": self.cfg.home,
                "cohort": {"id": cohort["id"], "label": cohort["label"]} if cohort else None,
                "modules": mods}


def _lang(lang: str) -> str:
    return lang if lang in LANGS else "prs"


def _who(request: Request) -> str:
    return request.client.host if request.client else "?"


def create_app(cfg: Config | None = None, store=None) -> FastAPI:
    """The app, the same on the hub (uvicorn, SQLite) and online (the Worker passes its D1 store and starts the hub
    itself, once per isolate, as tutor/worker/entry.py says)."""
    cfg = cfg or Config.from_env()
    hub = Hub(cfg, store)

    def needs(*mids):
        """A route guard: the route exists only while these modules are on for the cohort asking (`?cohort=`, else
        this hub's). A module that is off answers 404, exactly as a route that was never there."""
        async def guard(request: Request):
            _, _, on = await hub.cohort_modules(request.query_params.get("cohort"))
            if not all(m in on for m in mids):
                raise HTTPException(404, "Not Found")
        return [Depends(guard)]

    @asynccontextmanager
    async def lifespan(app):
        await hub.start()
        try:
            yield
        finally:
            await hub.stop()

    app = FastAPI(title=f"{cfg.name} hub", version=__version__, docs_url=None, redoc_url=None, openapi_url=None,
                  lifespan=lifespan)
    app.state.hub = hub
    # the Android app (another origin) talks to the hub too; online only the sites in TUTOR_ORIGINS may (the app's own
    # page is the same site and needs no CORS)
    app.add_middleware(CORSMiddleware, allow_origins=list(cfg.origins) if cfg.home == "online" else ["*"],
                       allow_methods=["GET", "POST", "DELETE"], allow_headers=["*"], expose_headers=["X-Sheet-Seed"])

    @app.get("/api/hello")
    async def hello(cohort: str | None = None, band: str | None = None):
        if band is not None and band not in modules.BANDS:
            raise HTTPException(400, "unknown band")
        return await hub.hello(cohort, band)

    @app.get("/api/packs", dependencies=needs("lessons"))
    async def packs():
        return {"packs": hub.library.summary()}

    @app.get("/api/lessons/{lid}", dependencies=needs("lessons"))
    async def lesson(lid: str):
        l = hub.library.lesson_for_app(lid)
        if not l:
            raise HTTPException(404, "no such lesson")
        return l

    @app.get("/packs/{pid}/pictures/{fname}", dependencies=needs("lessons"))
    async def picture(pid: str, fname: str):
        pack = hub.library.packs.get(pid)
        f = picture_file(pack["_dir"], Path(fname).stem) if pack else None
        if not f or f.name != fname:
            raise HTTPException(404, "no such picture")
        return FileResponse(f, headers={"Cache-Control": "public, max-age=86400"})

    @app.get("/packs/{pid}/audio/{lang}/{fname}", dependencies=needs("lessons"))
    async def clip(pid: str, lang: str, fname: str):
        """A recorded clip named in the pack's audio/<lang>/manifest.json (online: a static asset, like pictures)."""
        pack = hub.library.packs.get(pid)
        files = {c.get("file") for c in (pack or {}).get("_clips", {}).get(lang, {}).values()}
        f = pack["_dir"] / "audio" / lang / fname if pack and fname in files else None
        if not f or not f.is_file():
            raise HTTPException(404, "no such clip")
        return FileResponse(f, headers={"Cache-Control": "public, max-age=86400"})

    # link cards and credits: the licence data (licences.py); how they look is still to be designed (C2)
    @app.get("/api/links", dependencies=needs("lessons"))
    async def links(subject: str | None = None, year: int | None = None, lesson: str | None = None):
        return {"links": hub.library.link_cards(subject=subject, year=year, lesson=lesson)}

    @app.get("/api/credits")
    async def credits():
        return hub.library.credits()

    # learners: joining, her own record, the consent text (learners.py)
    @app.get("/api/consent")
    async def consent_text(lang: str = "prs", version: str | None = None):
        doc = hub.consent_texts.get((_lang(lang), version or hub.consent_version))
        if not doc:
            raise HTTPException(404, "no such consent text")
        return doc

    @app.post("/api/join")
    async def join(j: JoinIn, request: Request):
        hub.join_limit.check(_who(request))
        if j.cohort_code is not None:
            code = learners.normal_code(j.cohort_code)
            cohort = await hub.store.cohort_by_code(learners.code_hash(code)) if code else None
            if not cohort:
                raise HTTPException(404, "no class has this code")
        else:
            cohort = await hub.store.cohort(hub.cohort_id or "")
            if not cohort:
                raise HTTPException(404, "no such cohort")
        if j.band not in cohort["bands"] or j.lang not in cohort["langs"]:
            raise HTTPException(422, "this class is not for this year or language")
        if j.picture not in hub.aliases:
            raise HTTPException(422, "unknown picture")
        c = hub.consent_changes(j.consent) if j.consent else {}
        token = learners.new_token()
        number = await hub.store.add_learner(token_hash=learners.token_hash(token), cohort=cohort["id"],
                                             picture=j.picture, band=j.band, **c)
        return {"token": token, "number": number, "picture": j.picture,
                "cohort": {"id": cohort["id"], "label": cohort["label"]}}

    @app.get("/api/me")
    async def me(request: Request):
        row = await hub.learner(request)
        return learners.public(row, await hub.store.cohort(row["cohort"]))

    @app.post("/api/me")
    async def me_change(body: MeIn, request: Request):
        row = await hub.learner(request)
        changes = {}
        if body.band:
            cohort = await hub.store.cohort(row["cohort"])
            if body.band not in (cohort or {}).get("bands", ()):
                raise HTTPException(422, "this class is not for this year")
            changes["band"] = body.band
        if body.consent:
            changes.update(hub.consent_changes(body.consent))
        await hub.store.update_learner(row["token_hash"], **changes)
        return learners.public(await hub.store.learner(row["token_hash"]), await hub.store.cohort(row["cohort"]))

    @app.delete("/api/me")
    async def me_delete(request: Request):
        row = await hub.learner(request)
        await hub.store.delete_learner(row["token_hash"])
        return {"deleted": True}

    # Ask
    # Online a question may reach the AI provider, so it needs a learner whose guardian (or who herself) agreed (BUILD-PLAN 5.5);
    # on the hub nothing leaves the village and the phone asks for consent before its first question.
    @app.post("/api/ask", dependencies=needs("ask"))
    async def ask(a: AskIn, request: Request):
        who = await hub.learner(request, required=hub.cfg.home == "online")
        if hub.cfg.home == "online" and not who["consent_kind"]:
            raise HTTPException(403, "no consent: questions are not sent")
        hub.ask_limit.check(hub.who(request))
        lang = _lang(a.lang)
        cohort = request.query_params.get("cohort") or (who or {}).get("cohort") or hub.cohort_id
        ans = await hub.brain.answer(a.text, lang=lang, subject=a.subject, year=a.year, lesson=a.lesson, cohort=cohort)
        token = await hub.store.add_question(lang=lang, subject=a.subject, year=a.year, lesson_id=a.lesson,
                                             question=a.text.strip(),
                                             answer=None if ans.waiting and ans.source != "rules" else ans.text,
                                             source=ans.source, urgent=ans.urgent, waiting=ans.waiting)
        await hub.record("ask.answered", ans.source, cohort_id=request.query_params.get("cohort"))
        return dict(ans.dict(), id=token)

    @app.get("/api/ask/{token}", dependencies=needs("ask"))
    async def ask_status(token: str):
        q = await hub.store.question(token)
        if not q:
            raise HTTPException(404, "no such question")
        return {"id": token, "status": q["status"], "teacher_answer": q["teacher_answer"]}

    @app.post("/api/ask/{token}/teacher", dependencies=needs("ask"))
    async def ask_teacher(token: str, request: Request):
        if not await hub.store.send_to_teacher(token):
            raise HTTPException(404, "no such question")
        await hub.record("ask.to_teacher", cohort_id=request.query_params.get("cohort"))
        return {"ok": True}

    # events from the phones' queues: verbs and ids only (events.py)
    # A phone's events belong to a learner who has joined (her token) and whose guardian, or who herself, agreed:
    # without consent nothing of hers is kept (BUILD-PLAN 5.5). They go to her cohort, with her token's hash.
    @app.post("/api/events")
    async def post_events(body: EventsIn, request: Request):
        hub.event_limit.check(hub.who(request))
        who = await hub.learner(request)
        if not who["consent_kind"]:
            raise HTTPException(403, "no consent: events are not kept")
        items = [e.model_dump() for e in body.events]
        problems = [f"event {i + 1}: {p}" for i, e in enumerate(items) for p in events.check(e, phone=True)]
        if problems:
            raise HTTPException(422, "; ".join(problems[:10]))
        rows = [r for r in (events.row(e, cohort=who["cohort"], token_hash=who["token_hash"]) for e in items) if r]
        await hub.store.add_events(rows)
        return {"saved": len(rows), "expired": len(items) - len(rows)}

    # worksheets
    def _seed(lid, seed):
        if seed is not None:
            return seed
        return random.randint(1000, 9999) if sheets.needs_seed(hub.lesson(lid)) else 0

    @app.get("/api/sheets/{lid}.html", response_class=HTMLResponse, dependencies=needs("print"))
    async def sheet_page(lid: str, lang: str = "prs", seed: int | None = None, kind: str = "worksheet", name: str | None = None):
        seed = _seed(lid, seed)
        kind = "answers" if kind == "answers" else "worksheet"
        return HTMLResponse(hub.sheet_html(lid, lang=_lang(lang), seed=seed, kind=kind, name=(name or "")[:40] or None),
                            headers={"X-Sheet-Seed": str(seed)})

    @app.get("/api/sheets/{lid}.pdf", dependencies=needs("print"))
    async def sheet_pdf(lid: str, request: Request, lang: str = "prs", seed: int | None = None, kind: str = "worksheet"):
        hub.pdf_limit.check(_who(request))
        seed = _seed(lid, seed)
        kind = "answers" if kind == "answers" else "worksheet"
        try:
            # WeasyPrint keeps the processor busy for a while: it runs off the event loop
            pdf, _ = await run_in_threadpool(hub.render_pdf, {"lesson": lid, "lang": _lang(lang), "seed": seed,
                                                             "kind": kind})
        except RuntimeError as e:
            raise HTTPException(503, str(e))
        code = hub.lesson(lid)["sheet"]["code"] + (f"-{seed}" if seed else "")
        return Response(pdf, media_type="application/pdf",
                        headers={"Content-Disposition": f'inline; filename="{code}.pdf"', "X-Sheet-Seed": str(seed)})

    @app.get("/api/sheets/{lid}/key", dependencies=needs("check"))
    async def sheet_key(lid: str, seed: int = 0, lang: str = "prs"):
        l = hub.lesson(lid)
        if not l.get("sheet"):
            raise HTTPException(404, "this lesson has no sheet")
        return sheets.answer_key(l, seed, _lang(lang), hub.picture_url(lid))

    # printing
    @app.post("/api/print", dependencies=needs("print"))
    async def print_sheet(p: PrintIn, request: Request, x_teacher_pin: str | None = Header(None)):
        l = hub.lesson(p.lesson)
        if not l.get("sheet"):
            raise HTTPException(404, "this lesson has no sheet")
        who = _who(request)          # each phone has its own address on the hub's Wi-Fi; the phone can't choose it
        teacher = p.kind == "answers" or p.copies > cfg.free_copies
        if teacher:
            hub.check_pin(x_teacher_pin, who)
        seed = _seed(p.lesson, p.seed)
        async with hub.print_lock:   # count and add together, so two quick taps can't both slip under the limit
            if not teacher and await hub.store.copies_last_hour(who) + p.copies > cfg.copies_per_hour:
                raise HTTPException(429, "enough printing for now: ask the teacher")
            jid = await hub.store.add_print(lesson_id=p.lesson, kind=p.kind, copies=p.copies, lang=_lang(p.lang), seed=seed,
                                      device="teacher" if teacher else who)
        hub.prints.add(jid, {"lesson": p.lesson, "kind": p.kind, "copies": p.copies, "lang": _lang(p.lang),
                             "seed": seed, "name": (p.name or "").strip() or None,
                             "title": f"{l['sheet']['code']}-{seed}" if seed else l["sheet"]["code"]})
        await hub.record("print.queued", events.lesson_id(p.lesson), p.copies,
                         cohort_id=request.query_params.get("cohort"))
        return {"id": jid, "status": "queued", "seed": seed, "printer": hub.printer.status()}

    @app.get("/api/print/{jid}", dependencies=needs("print"))
    async def print_status(jid: int):
        j = await hub.store.print_job(jid)
        if not j:
            raise HTTPException(404, "no such print job")
        return {"id": jid, "status": j["status"], "detail": j["detail"] if j["status"] == "failed" else None}

    # the teacher's page
    @app.get("/api/teacher/summary", dependencies=needs("teacher"))
    async def teacher_summary(request: Request, x_teacher_pin: str | None = Header(None)):
        hub.check_pin(x_teacher_pin, _who(request))
        return {"counts": await hub.store.counts(), "hello": await hub.hello(),
                "pack_problems": hub.library.problems[:50]}

    @app.get("/api/teacher/queue", dependencies=needs("teacher"))
    async def teacher_queue(request: Request, x_teacher_pin: str | None = Header(None)):
        hub.check_pin(x_teacher_pin, _who(request))
        rows = await hub.store.queue()
        for r in rows:
            r.pop("token", None)
            l = hub.library.lessons.get(r.get("lesson_id") or "")
            r["lesson_title"] = pick_text(l["title"], r.get("lang") or "prs") if l else None
        return {"questions": rows}

    @app.post("/api/teacher/answer/{qid}", dependencies=needs("teacher"))
    async def teacher_answer(qid: int, body: ReviewIn, request: Request, x_teacher_pin: str | None = Header(None)):
        hub.check_pin(x_teacher_pin, _who(request))
        q = await hub.store.review(qid, answer=body.answer, approve=body.approve)
        if not q:
            raise HTTPException(404, "no such question")
        await hub.record("review.approved" if q["status"] == "reviewed" else "review.rejected",
                         events.lesson_id(q.get("lesson_id")), cohort_id=request.query_params.get("cohort"))
        if body.approve:
            await hub.reindex()
        q.pop("token", None)
        return q

    @app.get("/api/teacher/prints", dependencies=needs("teacher"))
    async def teacher_prints(request: Request, x_teacher_pin: str | None = Header(None)):
        hub.check_pin(x_teacher_pin, _who(request))
        return {"printer": hub.printer.status(), "jobs": [{k: v for k, v in j.items() if k != "device"}
                                                     for j in await hub.store.prints()]}

    @app.post("/api/teacher/hub-card", dependencies=needs("teacher", "print"))
    async def teacher_card(request: Request, x_teacher_pin: str | None = Header(None)):
        hub.check_pin(x_teacher_pin, _who(request))
        jid = await hub.store.add_print(lesson_id=None, kind="card", copies=1, lang="prs", seed=0, device="teacher")
        hub.prints.add(jid, {"card": True, "copies": 1, "title": "hub-card"})
        return {"id": jid, "status": "queued"}

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        return JSONResponse({"error": exc.detail}, status_code=exc.status_code)

    # online the app's files are the Worker's static assets, served before the Worker, so there is no folder here
    if cfg.app.is_dir():
        app.mount("/fonts", StaticFiles(directory=cfg.app / "fonts"), name="fonts")
        app.mount("/", StaticFiles(directory=cfg.app, html=True), name="app")
    return app
