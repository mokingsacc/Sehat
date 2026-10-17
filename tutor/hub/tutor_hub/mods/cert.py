"""Certificates (P25b, C4.2; cert.py has the rules and the paper).

- `POST /api/m/cert` `{path, version, lang}` with her token, `per_day` a day a token (five): reads her token hash's
  events for the pathway's lessons in her audience and, when every one counts, writes a `certificates` row (no token
  hash, band, day or name) and answers `{id, month, months, url, lessons, paper: {css, body}}`. 403 without consent
  (the check reads her events); 409 `{error, missing}` when her events do not show every lesson: "Qalam can't see all
  of this pathway's lessons yet". There is no "find": the phone keeps `certs` and never asks twice for one pathway.
- `POST /api/m/cert/print` `{id, lang, lessons}` (the hub, with `print` on): the paper with a blank name line goes to
  the print queue as the certificate's id only; the course comes from its row.
The core's `GET /api/cert/<id>` and `/v/<id>` (server.py) check a certificate, whether this module is on or not.
"""
import re

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .. import cert, flags, graph, learners
from ..stores.base import CERT_ID
from .plan import lessons_for

MODULE = "cert"
LANGS = ("prs", "ps", "en")
PATH = re.compile(r"^[a-z0-9][a-z0-9-]{0,47}$")


class CertIn(BaseModel):
    path: str = Field(max_length=48)
    version: str = Field(max_length=32)
    lang: str = Field("prs", max_length=3)


class PrintIn(BaseModel):
    id: str = Field(max_length=16)
    lang: str = Field("prs", max_length=3)
    lessons: int = Field(1, ge=1, le=99)


def base_url(hub, request: Request) -> str:
    """Where /v/<id> is: the hub's own address on the hub, the page's site online."""
    return hub.cfg.public_url.rstrip("/") if hub.cfg.home == "hub" else f"{request.url.scheme}://{request.url.netloc}"


def router(hub, needs) -> APIRouter:
    r = APIRouter(prefix="/api/m/cert")

    @r.post("", dependencies=needs(MODULE))
    async def earn(body: CertIn, request: Request):
        who = await hub.learner(request)                       # 401 without her token
        if not who["consent_kind"]:
            raise HTTPException(403, "no consent: the certificate is read from her own events")
        cohort, f, on = await hub.cohort_modules(hub.her_cohort(who), who["band"])     # her own class (C5 H1)
        if not cohort or MODULE not in on:
            raise HTTPException(404, "Not Found")
        found = graph.find_pathway(hub.library.graphs, body.path) if PATH.match(body.path) else None
        if not found or not cert.can_certify(*found) or who["band"] not in found[1]["bands"]:
            raise HTTPException(404, "no certificate for this pathway")
        g, p = found
        if body.version != g["version"]:
            raise HTTPException(409, "this pathway has changed: open it again")
        per_day = flags.module_settings(hub.modules[MODULE], (f.get(MODULE) or {}).get("settings"))["per_day"]
        if await hub.store.count_today(who["token_hash"], MODULE) > per_day:
            raise HTTPException(429, "enough certificates for today")
        mine = [lid for lid, _ in lessons_for(hub.library, who["band"])]
        lessons = graph.pathway_lessons(g, p, mine)
        if not lessons:
            raise HTTPException(404, "no certificate for this pathway")
        results = await hub.store.results(who["token_hash"], lessons + ([p["final"]] if p.get("final") else []))
        gaps = cert.missing(lessons, p.get("final"), results)
        if gaps:
            return JSONResponse({"error": "Qalam can't see all of this pathway's lessons yet", "missing": gaps},
                                status_code=409)
        month = learners.day()[:7]
        cid = await hub.store.add_certificate(course=p["id"], version=g["version"], month=month, cohort=cohort["id"])
        lang = body.lang if body.lang in LANGS else "prs"
        url = f"{base_url(hub, request)}/v/{cid}"
        return {"id": cid, "month": month, "months": cert.month_labels(month), "url": url, "lessons": len(lessons),
                "paper": {"css": cert.CSS, "body": cert.paper_body(titles=p["title"], lang=lang, cid=cid, month=month,
                                                                   lessons=len(lessons), url=url)}}

    @r.post("/print", dependencies=needs(MODULE, "print"))
    async def print_cert(body: PrintIn, request: Request):
        row = await hub.store.certificate(body.id) if CERT_ID.match(body.id) else None
        found = graph.find_pathway(hub.library.graphs, row["course"]) if row else None
        if not found:
            raise HTTPException(404, "no such certificate")
        if hub.prints is None:
            raise HTTPException(503, "this hub has no printer")
        who = request.client.host if request.client else "?"
        async with hub.print_lock:
            if await hub.store.copies_last_hour(who) + 1 > hub.cfg.copies_per_hour:
                raise HTTPException(429, "enough printing for now: ask the teacher")
            jid = await hub.store.add_print(lesson_id=row["id"], kind="certificate", copies=1,
                                            lang=body.lang if body.lang in LANGS else "prs", seed=0, device=who)
        hub.prints.add(jid, {"cert": row["id"], "titles": found[1]["title"], "month": row["month"],
                             "lessons": body.lessons, "lang": body.lang if body.lang in LANGS else "prs", "copies": 1,
                             "title": f"Qalam certificate {row['id']}"})
        return {"id": jid, "status": "queued", "printer": hub.printer.status()}

    return r
