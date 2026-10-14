"""The hub's web server: the app for phones, lessons, Ask, worksheets, printing and the teacher's page.

Every phone on the hub's Wi-Fi opens http://10.42.0.1 (or scans the hub card) and gets the app from here.
The API is small and plain JSON; docs/ARCHITECTURE.md lists every route.
"""
import hmac
import logging
import random
import secrets
import threading
import time
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import __version__, search, sheets
from .brain import Brain
from .config import Config
from .llm import LLM
from .packs import Library, picture_file
from .packs import text as pick_text
from .printing import Printer, PrintQueue
from .store import Store

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


# after each round of five wrong PINs a phone waits longer: a minute, 15 minutes, then an hour each time
PIN_LOCKS = (60, 15 * 60, 60 * 60)


class Limit:
    """At most `n` requests in `per` seconds from one phone, known by its address on the hub's Wi-Fi."""

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
    """Everything the routes share."""

    def __init__(self, cfg: Config):
        self.cfg = cfg
        cfg.data.mkdir(parents=True, exist_ok=True)
        self.store = Store(cfg.data / "hub.db")
        self.store.prune(cfg.keep_days)
        self.store.fail_unfinished_prints()
        self.library = Library(cfg.packs)
        self.llm = LLM(cfg.llm_url, cfg.llm_model, cfg.llm_timeout, cfg.llm_key)
        self._ix_lock = threading.Lock()
        self.brain = Brain(search.build(self.library, self.store.approved()), self.llm, cfg.ai_langs)
        self.printer = Printer(cfg.print_backend, cfg.printer, cfg.data / "outbox")
        self.prints = PrintQueue(self.store, self.printer, self.render_pdf)
        self.pin = teacher_pin(cfg.data)
        self._fails: dict[str, tuple[int, float, int, float]] = {}   # who -> wrong tries, locked until, rounds, last lock
        self._pin_lock = threading.Lock()
        self.clock = time.monotonic
        self.print_lock = threading.Lock()
        self.ask_limit = Limit(10, 60)
        self.pdf_limit = Limit(10, 60)

    def check_pin(self, pin: str | None, who: str):
        with self._pin_lock:
            now = self.clock()
            n, until, rounds, last = self._fails.get(who, (0, 0.0, 0, 0.0))
            if now < until:
                raise HTTPException(429, "too many wrong PINs: wait and try again later")
            if rounds and now - last > 24 * 3600:         # a quiet day: back to a one-minute wait
                rounds = 0
            if pin and hmac.compare_digest(pin.strip().encode(), self.pin.encode()):
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

    def reindex(self):
        with self._ix_lock:
            self.brain.index = search.build(self.library, self.store.approved())

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

    def hello(self) -> dict:
        ai_on = self.llm.available()
        return {"hub": self.cfg.name, "version": __version__, "lessons": len(self.library.lessons),
                "ai": {"on": ai_on, "langs": list(self.cfg.ai_langs) if ai_on else []},
                "printer": self.printer.status(), "free_copies": self.cfg.free_copies,
                "url": self.cfg.public_url}


def _lang(lang: str) -> str:
    return lang if lang in LANGS else "prs"


def _who(request: Request) -> str:
    return request.client.host if request.client else "?"


def create_app(cfg: Config | None = None) -> FastAPI:
    cfg = cfg or Config.from_env()
    hub = Hub(cfg)
    app = FastAPI(title=f"{cfg.name} hub", version=__version__, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.hub = hub
    # the Android app (another origin) talks to the hub too
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"],
                       expose_headers=["X-Sheet-Seed"])

    @app.get("/api/hello")
    def hello():
        return hub.hello()

    @app.get("/api/packs")
    def packs():
        return {"packs": hub.library.summary()}

    @app.get("/api/lessons/{lid}")
    def lesson(lid: str):
        l = hub.library.lesson_for_app(lid)
        if not l:
            raise HTTPException(404, "no such lesson")
        return l

    @app.get("/packs/{pid}/pictures/{fname}")
    def picture(pid: str, fname: str):
        pack = hub.library.packs.get(pid)
        f = picture_file(pack["_dir"], Path(fname).stem) if pack else None
        if not f or f.name != fname:
            raise HTTPException(404, "no such picture")
        return FileResponse(f, headers={"Cache-Control": "public, max-age=86400"})

    # Ask
    @app.post("/api/ask")
    def ask(a: AskIn, request: Request):
        hub.ask_limit.check(_who(request))
        lang = _lang(a.lang)
        ans = hub.brain.answer(a.text, lang=lang, subject=a.subject, year=a.year, lesson=a.lesson)
        token = hub.store.add_question(lang=lang, subject=a.subject, year=a.year, lesson_id=a.lesson,
                                       question=a.text.strip(), answer=None if ans.waiting and ans.source != "rules" else ans.text,
                                       source=ans.source, urgent=ans.urgent, waiting=ans.waiting)
        return dict(ans.dict(), id=token)

    @app.get("/api/ask/{token}")
    def ask_status(token: str):
        q = hub.store.question(token)
        if not q:
            raise HTTPException(404, "no such question")
        return {"id": token, "status": q["status"], "teacher_answer": q["teacher_answer"]}

    @app.post("/api/ask/{token}/teacher")
    def ask_teacher(token: str):
        if not hub.store.send_to_teacher(token):
            raise HTTPException(404, "no such question")
        return {"ok": True}

    # worksheets
    def _seed(lid, seed):
        if seed is not None:
            return seed
        return random.randint(1000, 9999) if sheets.needs_seed(hub.lesson(lid)) else 0

    @app.get("/api/sheets/{lid}.html", response_class=HTMLResponse)
    def sheet_page(lid: str, lang: str = "prs", seed: int | None = None, kind: str = "worksheet", name: str | None = None):
        seed = _seed(lid, seed)
        kind = "answers" if kind == "answers" else "worksheet"
        return HTMLResponse(hub.sheet_html(lid, lang=_lang(lang), seed=seed, kind=kind, name=(name or "")[:40] or None),
                            headers={"X-Sheet-Seed": str(seed)})

    @app.get("/api/sheets/{lid}.pdf")
    def sheet_pdf(lid: str, request: Request, lang: str = "prs", seed: int | None = None, kind: str = "worksheet"):
        hub.pdf_limit.check(_who(request))
        seed = _seed(lid, seed)
        kind = "answers" if kind == "answers" else "worksheet"
        try:
            pdf, _ = hub.render_pdf({"lesson": lid, "lang": _lang(lang), "seed": seed, "kind": kind})
        except RuntimeError as e:
            raise HTTPException(503, str(e))
        code = hub.lesson(lid)["sheet"]["code"] + (f"-{seed}" if seed else "")
        return Response(pdf, media_type="application/pdf",
                        headers={"Content-Disposition": f'inline; filename="{code}.pdf"', "X-Sheet-Seed": str(seed)})

    @app.get("/api/sheets/{lid}/key")
    def sheet_key(lid: str, seed: int = 0, lang: str = "prs"):
        l = hub.lesson(lid)
        if not l.get("sheet"):
            raise HTTPException(404, "this lesson has no sheet")
        return sheets.answer_key(l, seed, _lang(lang), hub.picture_url(lid))

    # printing
    @app.post("/api/print")
    def print_sheet(p: PrintIn, request: Request, x_teacher_pin: str | None = Header(None)):
        l = hub.lesson(p.lesson)
        if not l.get("sheet"):
            raise HTTPException(404, "this lesson has no sheet")
        who = _who(request)          # each phone has its own address on the hub's Wi-Fi; the phone can't choose it
        teacher = p.kind == "answers" or p.copies > cfg.free_copies
        if teacher:
            hub.check_pin(x_teacher_pin, who)
        seed = _seed(p.lesson, p.seed)
        with hub.print_lock:         # count and add together, so two quick taps can't both slip under the limit
            if not teacher and hub.store.copies_last_hour(who) + p.copies > cfg.copies_per_hour:
                raise HTTPException(429, "enough printing for now: ask the teacher")
            jid = hub.store.add_print(lesson_id=p.lesson, kind=p.kind, copies=p.copies, lang=_lang(p.lang), seed=seed,
                                      device="teacher" if teacher else who)
        hub.prints.add(jid, {"lesson": p.lesson, "kind": p.kind, "copies": p.copies, "lang": _lang(p.lang),
                             "seed": seed, "name": (p.name or "").strip() or None,
                             "title": f"{l['sheet']['code']}-{seed}" if seed else l["sheet"]["code"]})
        return {"id": jid, "status": "queued", "seed": seed, "printer": hub.printer.status()}

    @app.get("/api/print/{jid}")
    def print_status(jid: int):
        j = hub.store.print_job(jid)
        if not j:
            raise HTTPException(404, "no such print job")
        return {"id": jid, "status": j["status"], "detail": j["detail"] if j["status"] == "failed" else None}

    # the teacher's page
    @app.get("/api/teacher/summary")
    def teacher_summary(request: Request, x_teacher_pin: str | None = Header(None)):
        hub.check_pin(x_teacher_pin, _who(request))
        return {"counts": hub.store.counts(), "hello": hub.hello(), "pack_problems": hub.library.problems[:50]}

    @app.get("/api/teacher/queue")
    def teacher_queue(request: Request, x_teacher_pin: str | None = Header(None)):
        hub.check_pin(x_teacher_pin, _who(request))
        rows = hub.store.queue()
        for r in rows:
            r.pop("token", None)
            l = hub.library.lessons.get(r.get("lesson_id") or "")
            r["lesson_title"] = pick_text(l["title"], r.get("lang") or "prs") if l else None
        return {"questions": rows}

    @app.post("/api/teacher/answer/{qid}")
    def teacher_answer(qid: int, body: ReviewIn, request: Request, x_teacher_pin: str | None = Header(None)):
        hub.check_pin(x_teacher_pin, _who(request))
        q = hub.store.review(qid, answer=body.answer, approve=body.approve)
        if not q:
            raise HTTPException(404, "no such question")
        if body.approve:
            hub.reindex()
        q.pop("token", None)
        return q

    @app.get("/api/teacher/prints")
    def teacher_prints(request: Request, x_teacher_pin: str | None = Header(None)):
        hub.check_pin(x_teacher_pin, _who(request))
        return {"printer": hub.printer.status(), "jobs": [{k: v for k, v in j.items() if k != "device"} for j in hub.store.prints()]}

    @app.post("/api/teacher/hub-card")
    def teacher_card(request: Request, x_teacher_pin: str | None = Header(None)):
        hub.check_pin(x_teacher_pin, _who(request))
        jid = hub.store.add_print(lesson_id=None, kind="card", copies=1, lang="prs", seed=0, device="teacher")
        hub.prints.add(jid, {"card": True, "copies": 1, "title": "hub-card"})
        return {"id": jid, "status": "queued"}

    @app.exception_handler(HTTPException)
    def http_error(request: Request, exc: HTTPException):
        return JSONResponse({"error": exc.detail}, status_code=exc.status_code)

    app.mount("/fonts", StaticFiles(directory=cfg.app / "fonts"), name="fonts")
    app.mount("/", StaticFiles(directory=cfg.app, html=True), name="app")
    return app
