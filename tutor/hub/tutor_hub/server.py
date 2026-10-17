"""The hub's web server: the app for phones, lessons, Ask, worksheets, printing and the teacher's page.

Every phone on the hub's Wi-Fi opens http://10.42.0.1 (or scans the hub card) and gets the app from here.
The API is small and plain JSON; docs/ARCHITECTURE.md lists every route.
"""
import asyncio
import hmac
import json
import logging
import random
import secrets
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr

from . import __version__, admin, cert, events, flags, graph, learners, modules, rules, search, sheets, voicing
from .ai import Gateway, gateway as ai_gateway, make_provider
from .brain import WAITING, Answer, Brain
from .config import Config
from .mods import cert as cert_mod
from .mods import made as made_mod
from .mods import homework as homework_mod
from .mods import contest as contest_mod
from .mods import live as live_mod
from .mods import photo as photo_mod
from .mods import review as review_mod
from .mods import plan as plan_mod
from .mods import teacher as teacher_mod
from .mods import timetable as timetable_mod
from .staff import Gate, refuse
from .packs import Library, band_of_year, picture_file
from .textnorm import digits_to_latin
from .printing import Printer, PrintQueue
from .rtc import Realtime
from .stores import SqliteStore
from .stores.base import CERT_ID

RETENTION_S = 24 * 3600                    # the retention job runs once a day (P24)
log = logging.getLogger("tutor.hub")
LANGS = ("prs", "ps", "en")


class AskIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    lang: str = "prs"
    subject: str | None = Field(None, max_length=40)
    year: int | None = Field(None, ge=0, le=12)
    lesson: str | None = Field(None, max_length=80)
    teacher: bool = False        # "Ask my teacher" from a sheet's hint ladder: straight to the teacher, no answer


class PrintIn(BaseModel):
    lesson: str
    kind: Literal["worksheet", "answers"] = "worksheet"
    copies: int = Field(1, ge=1, le=60)
    lang: str = "prs"
    seed: int | None = Field(None, ge=0, le=9999)


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


class PinResetIn(BaseModel):
    """The six digits her teacher read out to her (C1.6, P20); Persian digits too."""
    model_config = ConfigDict(extra="forbid")
    code: StrictStr = Field(..., min_length=6, max_length=12)


class EventsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    events: list[EventIn] = Field(..., min_length=1, max_length=events.MAX_BATCH)


# after each round of five wrong PINs a phone waits longer: a minute, 15 minutes, then an hour each time
PIN_LOCKS = (60, 15 * 60, 60 * 60)
HUB_WRONG, HUB_SPACING = 30, 10.0            # wrong PINs an hour from any address, then one check per 10 seconds
_UNSET = object()


class Limit:
    """At most `n` requests in `per` seconds from one phone: on the hub known by its address on the hub's Wi-Fi;
    online by her learner token, since many phones reach the Worker from one address (`Hub.who`), else by the
    address Cloudflare saw (`Hub.addr`)."""

    def __init__(self, n: int, per: float):
        self.n, self.per = n, per
        self._seen: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def check(self, who: str, add: bool = True):
        """429 once `who` has used up the limit; else count this one, unless `add` is false (`count` adds later)."""
        now = time.monotonic()
        with self._lock:
            recent = [t for t in self._seen.get(who, []) if now - t < self.per]
            if len(recent) >= self.n:
                self._seen[who] = recent
                raise HTTPException(429, "too many at once: wait a minute")
            self._seen[who] = recent + ([now] if add else [])

    def count(self, who: str):
        with self._lock:
            self._seen.setdefault(who, []).append(time.monotonic())


def teacher_pin(data: Path, name: str = "teacher-pin.txt") -> str:
    """The teacher's PIN: made on first start, kept in the data folder, shown by `python -m tutor_hub pin`."""
    f = data / name
    if not f.exists():
        data.mkdir(parents=True, exist_ok=True)
        f.write_text(f"{secrets.randbelow(900000) + 100000}\n", encoding="utf-8")
        f.chmod(0o600)
        which = "admin" if name.startswith("admin") else "teacher"
        log.warning("a new %s PIN was made: run `python -m tutor_hub %s` on the hub to see it", which,
                    "admin-pin" if which == "admin" else "pin")
    return f.read_text(encoding="utf-8").strip()


def admin_pin(data: Path) -> str:
    """The hub's admin PIN (P21, C3.3): separate from the teacher's, shown by `python -m tutor_hub admin-pin`."""
    return teacher_pin(data, "admin-pin.txt")


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
                               budget=cfg.ai_budget, timeout=cfg.llm_timeout, cohort=self.cohort_id,
                               make=lambda name, model: make_provider(self.cfg, name, model))
        self._ix_lock = asyncio.Lock()
        self.brain = Brain(None, self.gateway, self.library)     # the search index is built in start()
        self.printer = Printer("off" if "printer" in cfg.lacks else cfg.print_backend, cfg.printer,
                               cfg.data / "outbox")
        self.prints: PrintQueue | None = None
        self.pin = None if "pin" in cfg.lacks else teacher_pin(cfg.data)   # no PIN: the teacher module is off
        self.admin_pin = None if "pin" in cfg.lacks else admin_pin(cfg.data)   # the admin panel's, on the hub
        self._fails: dict[str, tuple[int, float, int, float]] = {}   # who -> wrong tries, locked until, rounds, last lock
        self._wrong: list[float] = []                # every wrong PIN this hour, from any address (C5 L2)
        self._last_try = 0.0
        self._pin_lock = threading.Lock()
        self.clock = time.monotonic
        self.print_lock = asyncio.Lock()
        self.ask_limit = Limit(10, 60)
        self.pdf_limit = Limit(10, 60)
        self.event_limit = Limit(30, 60)
        # joining (C5 H2): a school's Wi-Fi or a mobile carrier puts a whole class behind one address, so joins are
        # counted high; only a wrong class code counts against the address's 20 an hour
        self.join_limit = Limit(300, 3600)
        self.code_limit = Limit(20, 3600)
        self.photo_limit = Limit(6, 60)              # photos of sheets read per phone a minute
        self.reset_limit = Limit(10, 600)            # lock reset codes tried per phone in ten minutes
        self.plan_limit = Limit(30, 60)              # "I want to learn this" goals a minute, by address (no token)
        self.cert_limit = Limit(30, 60)              # certificate checks an address a minute (C4.2)
        self.staff = Gate(self)                      # the staff pages' gate (staff.py): PIN, Access or off
        self.gateway.on_drop = lambda why, cid: self.record("safety.flag", why, cohort_id=cid)
        self.aliases = set(learners.load_aliases())
        self.consent_texts = learners.load_consent()
        self.consent_version = learners.CONSENT_VERSIONS[cfg.home]
        self.rtc = Realtime(cfg)                     # live classes' relay (P30a): called only while `live` is on

    async def start(self):
        await self.store.open()
        if await self.store.seed_cohorts(flags.seed_rows(self.seeds)):
            log.info("cohorts seeded from %s", self.cfg.cohorts)
        if not self.cohort_id or not await self.store.cohort(self.cohort_id):
            log.error("this hub's cohort (TUTOR_COHORT=%s) does not exist: every module is off", self.cohort_id)
        await self.prune()
        await self.store.fail_unfinished_prints()
        await self.reindex()
        if "printer" not in self.cfg.lacks:       # the queue's thread is the hub's; the Worker has no printer
            self.prints = PrintQueue(self.store.sync, self.printer, self.render_pdf)

    async def prune(self):
        """The retention job (P24): questions, ladders and prints after `keep_days`; reset codes once expired; wishes
        after 90 days; flag and admin logs after two years (store.prune); events after 12 months; AI usage rows;
        learners unseen for 12 months, with their events. At start, then daily: on the hub a background task
        (`retention_loop`), online the Worker's cron (worker/entry.py `scheduled`)."""
        await self.store.prune(self.cfg.keep_days)
        await self.store.prune_events(events.KEEP_DAYS)
        await self.store.prune_ai_usage(ai_gateway.KEEP_DAYS)
        await self.store.prune_learners(learners.IDLE_DAYS)

    async def retention_loop(self, every_s: float = RETENTION_S):
        while True:
            await asyncio.sleep(every_s)
            try:
                await self.prune()
            except Exception:                  # a locked or busy database: try again tomorrow, never stop the hub
                log.exception("retention: pruning failed; trying again in a day")

    async def stop(self):
        await self.gateway.aclose()
        await self.rtc.aclose()
        await self.store.close()

    def check_pin(self, pin: str | None, who: str, admin: bool = False):
        """The teacher's PIN, or with `admin` the admin's (P21); each has its own count of wrong tries."""
        want = self.admin_pin if admin else self.pin
        who = f"admin:{who}" if admin else who
        with self._pin_lock:
            now = self.clock()
            n, until, rounds, last = self._fails.get(who, (0, 0.0, 0, 0.0))
            if now < until:
                raise refuse(429, "wait", "too many wrong PINs: wait and try again later")
            # hub-wide (C5 L2): a phone that rejoins the Wi-Fi gets a new address and fresh tries, so after 30 wrong
            # PINs in an hour from anywhere, one PIN is checked every 10 seconds, whoever asks
            self._wrong = [t for t in self._wrong if now - t < 3600]
            if len(self._wrong) >= HUB_WRONG and now - self._last_try < HUB_SPACING:
                raise refuse(429, "wait", "too many wrong PINs: wait and try again later")
            self._last_try = now
            if rounds and now - last > 24 * 3600:         # a quiet day: back to a one-minute wait
                rounds = 0
            if pin and want and hmac.compare_digest(pin.strip().encode(), want.encode()):
                self._fails.pop(who, None)
                return
            n += 1
            self._wrong.append(now)
            if n >= 5:
                wait = PIN_LOCKS[min(rounds, len(PIN_LOCKS) - 1)]
                self._fails[who] = (0, now + wait, rounds + 1, now)
                log.warning("%s PIN: 5 wrong tries from %s, locked for %d minutes", "admin" if admin else "teacher",
                            who, wait // 60)
            else:
                self._fails[who] = (n, 0.0, rounds, last)
            raise refuse(401, "wrong_pin", "admin PIN needed" if admin else "teacher PIN needed")

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
        without one, or 401 when `required`. Looked up once a request (the route guard and the route share it)."""
        row = request.scope.get("qalam.learner", _UNSET)
        if row is _UNSET:
            token = request.headers.get(learners.HEADER) or ""
            row = await self.store.learner(learners.token_hash(token)) if learners.TOKEN.match(token) else None
            request.scope["qalam.learner"] = row
            if row is not None and row["last_seen"] != learners.day():
                await self.store.update_learner(row["token_hash"], last_seen=learners.day())
        if row is None and required:
            raise HTTPException(401, "this learner is not known here: join again")
        return row

    def her_cohort(self, who: dict | None) -> str | None:
        """The class whose switches, hold, budget and provider apply to a learner's request (C5 H1): with her token
        her own, always; without one this hub's (`open` online). Never a class the request names (`?cohort=`)."""
        return (who or {}).get("cohort") or self.cohort_id

    def addr(self, request: Request) -> str:
        """The address a limit counts without a token: on the hub the phone's on the hub's Wi-Fi. The Worker's
        ASGI adapter gives no client address, so there the one Cloudflare's edge saw (CF-Connecting-IP, which the
        edge sets and overwrites); a server that has a socket address never trusts that header (C5 H2)."""
        if request.client:
            return request.client.host
        return request.headers.get("cf-connecting-ip") or "?"

    def who(self, request: Request) -> str:
        """Whom a per-phone limit counts: online her learner token (by its hash) when the request carries one, since
        a Worker sees many phones behind one address; on the hub, and without a token, the address."""
        token = request.headers.get(learners.HEADER) or ""
        if self.cfg.home == "online" and learners.TOKEN.match(token):
            return "t:" + learners.token_hash(token)[:32]
        return self.addr(request)

    def consent_names_live(self, version: str | None = None) -> bool:
        """Whether a consent text version names live classes (`live: true` in every language's file of it, C6.A8 and
        D14): the version this server shows when None. No version does until Mo's reviewers and solicitor sign one."""
        version = version or self.consent_version
        texts = [d for (_, v), d in self.consent_texts.items() if v == version]
        return bool(texts) and all(d.get("live") is True for d in texts)

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

    def sheet_html(self, lid, *, lang, seed, kind="worksheet", for_pdf=False, print_on_load=False):
        """The sheet as HTML (C2.1). No name goes on it: she writes hers in the name box by hand (F3)."""
        l = self.lesson(lid)
        if not l.get("sheet"):
            raise HTTPException(404, "this lesson has no sheet")
        fonts = (self.cfg.app / "fonts").resolve().as_uri() if for_pdf else "/fonts"
        return sheets.page(l, lang=lang, seed=seed, kind=kind, fonts=fonts, picture_url=self.picture_url(lid, for_pdf),
                           print_on_load=print_on_load)

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
        if spec.get("cert"):                          # a certificate (P25b): its id and course only, the name line blank
            body = cert.paper_body(titles=spec["titles"], lang=spec["lang"], cid=spec["cert"], month=spec["month"],
                                   lessons=spec["lessons"], url=f"{self.cfg.public_url.rstrip('/')}/v/{spec['cert']}",
                                   did=spec.get("did", "finished"))
            html_text = cert.document(body, cid=spec["cert"], fonts=(self.cfg.app / "fonts").resolve().as_uri())
            return sheets.render_pdf(html_text, base_url=str(self.cfg.app))
        if spec.get("card"):
            html_text = sheets.hub_card(name=self.cfg.name, url=self.cfg.public_url, ssid=self.cfg.wifi_ssid,
                                        password=self.cfg.wifi_password,
                                        fonts=(self.cfg.app / "fonts").resolve().as_uri())
        else:
            html_text = self.sheet_html(spec["lesson"], lang=spec["lang"], seed=spec["seed"], kind=spec["kind"],
                                        for_pdf=True)
        return sheets.render_pdf(html_text, base_url=str(self.cfg.app))

    async def cohort_modules(self, cohort_id: str | None = None, band: str | None = None):
        """(the cohort, its flags, the ids of the modules on for it); the cohort is None if there is no such cohort.

        Read from the store on every call, so a switch the admin flips reaches the next request."""
        cohort = await self.store.cohort(cohort_id or self.cohort_id or "")
        if not cohort:
            return None, {}, []
        f = await self.store.flags(cohort["id"])
        return cohort, f, flags.enabled(self.modules, cohort, f, band, self.cfg.lacks, self.held())

    def held(self) -> tuple:
        """Modules held off whatever the flags say: the Quran reader while its set is missing or broken, and on a
        release hub until a Hanafi scholar has signed the set at its current hash (P29, C4.7); university preparation
        while no pack has its checklist, and on a release hub until the first card set is signed (P28, C4.6); live
        classes while the Realtime app or its secret is missing (P30a, C6.1), so the village hub never serves them;
        contests on a release hub until one is signed (P31, C6.5)."""
        q = self.library.quran
        out = []
        if q is None or not q.ok or (self.cfg.release and not q.signed):
            out.append("quran")
        if not self.library.checklists or (self.cfg.release and not self.library.university_ready()):
            out.append("university")
        if not (self.cfg.rtc_app and self.cfg.rtc_secret):
            out.append("live")                     # C6.1: no relay, no live classes (the hub has none, ever)
        if self.cfg.release and not any(c["_state"] == "signed" for c in self.library.contests.values()):
            out.append("contest")                  # C6.5: a release host waits for its first signed contest
        return tuple(out)

    async def hello(self, cohort_id: str | None = None, band: str | None = None) -> dict:
        cohort, f, on = await self.cohort_modules(cohort_id, band)
        if cohort_id and not cohort:
            raise HTTPException(404, "no such cohort")
        ai_on = await self.gateway.available(cohort) and flags.ai_on(cohort)    # the cohort's kill switch (P21)
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
                # the Android app (P23): its newest version on /get and the oldest this server still talks to
                "apk": {"latest": self.cfg.apk_latest, "min": self.cfg.apk_min} if self.cfg.apk_latest else None,
                "cohort": {"id": cohort["id"], "label": cohort["label"]} if cohort else None,
                # the class's open live class (P30a, C6.A10): the phone shows Join; null while `live` is off
                "live": await live_mod.current_for_hello(self, cohort, f) if "live" in on else None,
                "modules": mods}


def _lang(lang: str) -> str:
    return lang if lang in LANGS else "prs"


STAFF_API = ("/api/m/teacher/", "/api/m/review/")
# C5 M2: staff pages may not be framed by another site, and run only this site's scripts
STAFF_HEADERS = ((b"content-security-policy", b"default-src 'self'; img-src 'self' data: blob:; style-src 'self' "
                  b"'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"),
                 (b"x-frame-options", b"DENY"), (b"x-content-type-options", b"nosniff"),
                 (b"referrer-policy", b"no-referrer"))
STAFF_PAGES = ("/admin", "/teacher", "/review")


class StaffHeaders:
    """The hub serves the staff pages itself (online they are static assets, with worker/build.py's _headers): this
    adds STAFF_HEADERS to them, and nothing to any other path (the Android app frames the hub's sheets)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "") if scope["type"] == "http" else ""
        if not any(path == p or path.startswith(p + "/") for p in STAFF_PAGES):
            return await self.app(scope, receive, send)

        async def with_headers(msg):
            if msg["type"] == "http.response.start":
                msg = dict(msg, headers=list(msg.get("headers", [])) + list(STAFF_HEADERS))
            await send(msg)
        await self.app(scope, receive, with_headers)


def create_app(cfg: Config | None = None, store=None) -> FastAPI:
    """The app, the same on the hub (uvicorn, SQLite) and online (the Worker passes its D1 store and starts the hub
    itself, once per isolate, as tutor/worker/entry.py says)."""
    cfg = cfg or Config.from_env()
    hub = Hub(cfg, store)

    async def asking(request: Request) -> str | None:
        """Whose class a route guard checks (C5 H1): a learner's token says hers, whatever the query says. Without a
        token, `?cohort=` is read only for a GET (a read that spends and stores nothing) and on the staff routes,
        whose own gate checks the class (teacher.py `cohort`); any other request is this hub's own cohort's."""
        who = await hub.learner(request, required=False)
        if who:
            return hub.her_cohort(who)
        if request.method == "GET" or request.url.path.startswith(STAFF_API):
            return request.query_params.get("cohort")
        return None

    def needs(*mids):
        """A route guard: the route exists only while these modules are on for the cohort asking (`asking`). A module
        that is off answers 404, exactly as a route that was never there."""
        async def guard(request: Request):
            _, _, on = await hub.cohort_modules(await asking(request))
            if not all(m in on for m in mids):
                raise HTTPException(404, "Not Found")
        return [Depends(guard)]

    @asynccontextmanager
    async def lifespan(app):
        await hub.start()
        retention = asyncio.create_task(hub.retention_loop())      # daily, while the hub runs (the Worker: its cron)
        try:
            yield
        finally:
            retention.cancel()
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
        # and the skills graphs (P25a): nodes, their lessons here and the pathways, content only
        return {"packs": hub.library.summary(), "graphs": graph.for_app(hub.library.graphs, hub.library.lessons)}

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
        files = {c.get("file") for c in (hub.library.served_clips(pid) if pack else {}).get(lang, {}).values()}
        f = pack["_dir"] / "audio" / lang / fname if pack and fname in files else None
        if not f or not f.is_file():
            raise HTTPException(404, "no such clip")
        return FileResponse(f, headers={"Cache-Control": "public, max-age=86400"})

    # the voice pack (C5.6, the owner's note of 17 Oct): every clip of one language in one file, for the Android app
    # (which carries no audio) to keep, and for sharing phone to phone; made once from the files on disk. A release
    # hub serves no pack for a language whose native listener has not passed the sample. Online it is a static file.
    voice_packs: dict[str, bytes | None] = {}

    @app.get("/audio/{lang}/voice.qvoice")
    async def voice_pack(lang: str):
        if lang not in voicing.LANGS or lang not in hub.library.voices_passed or not cfg.app.is_dir():
            raise HTTPException(404, "no voice pack")
        if lang not in voice_packs:
            lib = hub.library
            voice_packs[lang] = voicing.voice_pack(lang, cfg.app / "audio", [
                (p["_dir"] / "audio" / lang, lib.served_clips(pid).get(lang, {})) for pid, p in lib.packs.items()])
        if not voice_packs[lang]:
            raise HTTPException(404, "no voice pack")
        return Response(voice_packs[lang], media_type="application/octet-stream", headers={
            "Cache-Control": "public, max-age=3600", "Content-Disposition": f'attachment; filename="qalam-voice-{lang}.qvoice"'})

    # the Quran reader (P29, C4.7): the set's surah list, one surah at a time, and the recitation files fetched to this
    # hub; online the same paths are static files (worker/build.py). The review page reads them too, so they answer
    # while `review` is on as well (the scholar reads the set before the reader may be switched on)
    def needs_any(*mids):
        async def guard(request: Request):
            _, _, on = await hub.cohort_modules(await asking(request))
            q = hub.library.quran
            if not any(m in on for m in mids) or q is None or not q.ok or q.light is not None:
                raise HTTPException(404, "Not Found")
        return [Depends(guard)]

    @app.get("/quran/index.json", dependencies=needs_any("quran", "review"))
    async def quran_index():
        return JSONResponse(hub.library.quran.summary(), headers={"Cache-Control": "no-cache"})

    @app.get("/quran/surah/{fname}", dependencies=needs_any("quran", "review"))
    async def quran_surah(fname: str):
        n = fname[:-5] if fname.endswith(".json") else ""
        doc = hub.library.quran.surah(int(n)) if n.isdigit() and len(n) <= 3 else None
        if not doc:
            raise HTTPException(404, "no such surah")
        return JSONResponse(doc, headers={"Cache-Control": "no-cache"})

    @app.get("/quran/audio/{edition}/{fname}", dependencies=needs_any("quran", "review"))
    async def quran_audio(edition: str, fname: str):
        f = hub.library.quran.audio_path(edition, fname)
        if not f:
            raise HTTPException(404, "no such recitation here")
        return FileResponse(f, media_type="audio/mpeg", headers={"Cache-Control": "public, max-age=604800"})

    # link cards and credits: the licence data (licences.py); how they look is still to be designed (C2)
    # university preparation (P28, C4.6): the checklist (she ticks it on her phone; the ticks are never sent) and the
    # cards within their review_by date. The phone keeps the answer for offline and hides a card past its date by its
    # own clock too. No event is written for opening a card or ticking a step
    @app.get("/api/m/university", dependencies=needs("university"))
    async def university():
        return hub.library.university()

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
        addr = hub.addr(request)
        hub.join_limit.check(addr)
        if j.cohort_code is not None:
            hub.code_limit.check(addr, add=False)            # only a wrong code counts against the address
            code = learners.normal_code(j.cohort_code)
            cohort = await hub.store.cohort_by_code(learners.code_hash(code)) if code else None
            if not cohort:
                hub.code_limit.count(addr)
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

    # "I have a code from my teacher" (C1.6, P20): six digits, 15 minutes, once, five tries; the lock is the phone's
    @app.post("/api/me/pin-reset")
    async def pin_reset(body: PinResetIn, request: Request):
        hub.reset_limit.check(hub.who(request))
        row = await hub.learner(request)
        code = digits_to_latin(body.code).replace(" ", "")
        if not code.isdigit() or len(code) != 6:
            raise HTTPException(422, "six digits, please")
        got = await hub.store.use_reset_code(row["token_hash"], teacher_mod.code_hash(row["token_hash"], code),
                                             teacher_mod.CODE_TRIES)
        if got == "wrong":
            raise HTTPException(403, "that code is not right")
        if got == "none":
            raise HTTPException(404, "no code from your teacher now")
        return {"ok": True}

    # Ask
    # Online a question may reach the AI provider, so it needs a learner whose guardian (or who herself) agreed (BUILD-PLAN 5.5);
    # on the hub the phone asks for consent before her first question (the hub's text says what may leave the centre).
    # The class whose switches apply is hers, never one the request names (C5 H1).
    @app.post("/api/ask", dependencies=needs("ask"))
    async def ask(a: AskIn, request: Request):
        who = await hub.learner(request, required=hub.cfg.home == "online")
        if hub.cfg.home == "online" and not who["consent_kind"]:
            raise HTTPException(403, "no consent: questions are not sent")
        hub.ask_limit.check(hub.who(request))
        lang = _lang(a.lang)
        cohort = hub.her_cohort(who)
        if a.teacher:            # "Ask my teacher" (C2.3): the sheet's code, the item and what she wrote
            ans = Answer(WAITING[lang], lang, "none", waiting=True)
        else:
            band = (who or {}).get("band") or (band_of_year(a.year) if a.year is not None else None)
            _, f, on = await hub.cohort_modules(cohort, band)
            # the cohort holds the AI's answers for the teacher (P20): she sends, edits or drops each one first
            hold = "teacher" in on and flags.module_settings(hub.modules["teacher"],
                                                             (f.get("teacher") or {}).get("settings"))["hold"]
            ans = await hub.brain.answer(a.text, lang=lang, subject=a.subject, year=a.year, lesson=a.lesson,
                                         cohort=cohort, homework="homework" in on, hold=hold, teacher="teacher" in on)
        held = ans.held and ans.source == "ai"
        if held:
            shown, hints = ans.text, ans.ladder
        else:
            shown, hints = (None if ans.waiting and ans.source != "rules" else ans.shown()), None
        token = await hub.store.add_question(lang=lang, subject=a.subject, year=a.year, lesson_id=a.lesson,
                                             question=a.text.strip(), answer=shown, source=ans.source,
                                             urgent=ans.urgent, waiting=ans.waiting, cohort=cohort, held=held,
                                             hints=hints)
        if ans.solution is not None:               # the answer behind the ladder stays here, for "Check my answer"
            await hub.store.add_ladder(token, solution=ans.solution, sure=not ans.unsure)
        await hub.record("ask.answered", ans.source, cohort_id=cohort)
        if ans.source == "rules" and (hit := rules.screen(a.text)):      # counted for the admin's Safety page (P21)
            await hub.record("safety.flag", hit[0], cohort_id=cohort)
        if held:                                   # she hears only that it went to the teacher
            return dict(Answer(WAITING[lang], lang, "none", waiting=True).dict(), id=token)
        return dict(ans.dict(), id=token)

    @app.get("/api/ask/{token}", dependencies=needs("ask"))
    async def ask_status(token: str):
        q = await hub.store.question(token)
        if not q:
            raise HTTPException(404, "no such question")
        out = {"id": token, "status": "waiting" if q["status"] == "held" else q["status"],
               "teacher_answer": q["teacher_answer"]}
        if q["status"] == "reviewed" and q.get("hints"):   # a held ladder the teacher sent: the rungs, never the answer
            secret = await hub.store.ladder(token)
            out.update(teacher_answer=None, line=q["answer"], ladder=json.loads(q["hints"]),
                       checkable=bool(secret and secret["sure"]))
        return out

    @app.post("/api/ask/{token}/teacher", dependencies=needs("ask"))
    async def ask_teacher(token: str, request: Request):
        if not await hub.store.send_to_teacher(token):
            raise HTTPException(404, "no such question")
        await hub.record("ask.to_teacher", cohort_id=hub.her_cohort(await hub.learner(request, required=False)))
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

    # photo marking (the `photo` module, P14): readings only, the phone marks (mods/photo.py)
    app.include_router(photo_mod.router(hub, needs))
    # Homework help (the `homework` module, P15): "Check my answer" against the answer kept behind a ladder
    app.include_router(homework_mod.router(hub, needs))
    # The review screens (the `review` module, P17): behind the staff gate, at /review/ (app/review/)
    app.include_router(review_mod.router(hub, needs))
    # The school day (the `timetable` module, P19): the cohort's timetable for a band, without a token
    app.include_router(timetable_mod.router(hub, needs))
    # The teacher dashboard (the `teacher` module, P20): behind the staff gate, at /teacher/ (app/teacher/)
    app.include_router(teacher_mod.router(hub, needs))
    # "I want to learn this" (the `plan` module, P22): a goal to a plan of lessons, or to the wishlist, without a token
    app.include_router(plan_mod.router(hub, needs))
    # Certificates (the `cert` module, P25b): earned from her own events, printed with a name that is never sent
    app.include_router(cert_mod.router(hub, needs))
    app.include_router(made_mod.router(hub, needs))
    # Live audio classes (the `live` module, P30a): the relay carries the sound, the server only the class's state
    app.include_router(live_mod.router(hub, needs))
    # Contests (the `contest` module, P31): questions from signed lessons, marked by the hub, never ranked
    app.include_router(contest_mod.router(hub, needs))

    # checking a certificate (P25b, C4.2): the core's, always on even where `cert` is off; no token
    @app.get("/api/cert/{cid}")
    async def cert_check(cid: str, request: Request):
        hub.cert_limit.check(hub.addr(request))
        row = await hub.store.certificate(cid.upper()) if CERT_ID.match(cid.upper()) else None
        if not row:
            raise HTTPException(404, "no such certificate")
        course = cert.course_of(hub.library, row["course"])                # a pathway, or a contest (P31)
        title = course["title"] if course else {"en": row["course"]}
        return {"id": row["id"], "course": {x: title.get(x) or title.get("en") or row["course"] for x in LANGS},
                "month": row["month"], "months": cert.month_labels(row["month"]),
                "did": course["did"] if course else "finished"}

    @app.get("/v/{cid}", response_class=HTMLResponse)
    async def cert_page(cid: str):
        return HTMLResponse(cert.check_page(), headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})

    # The admin panel (P21, C3.3): the core's, not a module; behind the staff gate as admin, at /admin/ (app/admin/)
    app.include_router(admin.router(hub))

    # worksheets (the `sheets` module, C2.1): the sheet as HTML on every home, and its key for Check my sheet.
    # The answer page is the teacher's: here behind the teacher's PIN on the hub, and on no learner route (C2.3);
    # online there is no PIN, so here it is not served at all: the teacher opens it inside /teacher/ (P20).
    def _seed(lid, seed):
        if seed is not None:
            return seed
        return random.randint(1000, 9999) if sheets.needs_seed(hub.lesson(lid)) else 0

    def _kind(kind, request, pin):
        if kind != "answers":
            return "worksheet"
        if hub.pin is None:
            raise HTTPException(404, "Not Found")
        hub.check_pin(pin, hub.addr(request))
        return "answers"

    @app.get("/api/sheets/{lid}.html", response_class=HTMLResponse, dependencies=needs("sheets"))
    async def sheet_page(lid: str, request: Request, lang: str = "prs", seed: int | None = Query(None, ge=0, le=9999),
                         kind: str = "worksheet", print: int = 0, x_teacher_pin: str | None = Header(None)):
        kind = _kind(kind, request, x_teacher_pin)
        seed = _seed(lid, seed)
        return HTMLResponse(hub.sheet_html(lid, lang=_lang(lang), seed=seed, kind=kind, print_on_load=print == 1),
                            headers={"X-Sheet-Seed": str(seed)})

    # the PDF is the hub's: WeasyPrint is neither on the Worker nor in the fallback kit, where the browser prints
    @app.get("/api/sheets/{lid}.pdf", dependencies=needs("print"))
    async def sheet_pdf(lid: str, request: Request, lang: str = "prs", seed: int | None = Query(None, ge=0, le=9999),
                        kind: str = "worksheet", x_teacher_pin: str | None = Header(None)):
        hub.pdf_limit.check(hub.addr(request))
        kind = _kind(kind, request, x_teacher_pin)
        seed = _seed(lid, seed)
        try:
            # WeasyPrint keeps the processor busy for a while: it runs off the event loop
            pdf, _ = await run_in_threadpool(hub.render_pdf, {"lesson": lid, "lang": _lang(lang), "seed": seed,
                                                             "kind": kind})
        except RuntimeError as e:
            raise HTTPException(503, str(e))
        code = sheets.sheet_code(hub.lesson(lid), seed)
        return Response(pdf, media_type="application/pdf",
                        headers={"Content-Disposition": f'inline; filename="{code}.pdf"', "X-Sheet-Seed": str(seed)})

    @app.get("/api/sheets/{lid}/key", dependencies=needs("sheets"))
    async def sheet_key(lid: str, seed: int = Query(0, ge=0, le=9999), lang: str = "prs"):
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
        who = hub.addr(request)      # each phone has its own address on the hub's Wi-Fi; the phone can't choose it
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
                             "seed": seed, "title": sheets.sheet_code(l, seed)})
        await hub.record("print.queued", events.lesson_id(p.lesson), p.copies,
                         cohort_id=hub.her_cohort(await hub.learner(request, required=False)))
        return {"id": jid, "status": "queued", "seed": seed, "printer": hub.printer.status()}

    @app.get("/api/print/{jid}", dependencies=needs("print"))
    async def print_status(jid: int):
        j = await hub.store.print_job(jid)
        if not j:
            raise HTTPException(404, "no such print job")
        return {"id": jid, "status": j["status"], "detail": j["detail"] if j["status"] == "failed" else None}

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        code = getattr(exc, "code", None)            # a staff refusal's stable code (C5.1), beside the sentence
        return JSONResponse({"error": exc.detail, **({"code": code} if code else {})}, status_code=exc.status_code)

    # the website at /, the app at /app/, the staff pages and /get/ where they were (WEBSITE.md 2.2, sitetree.py).
    # Online they are the Worker's static assets, served before the Worker, so there is no folder here
    if cfg.app.is_dir():
        from . import sitetree
        app.add_middleware(StaffHeaders)
        sitetree.mount(app, cfg.app)
    return app
