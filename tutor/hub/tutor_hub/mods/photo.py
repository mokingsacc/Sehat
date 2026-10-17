"""Photo marking of Qalam sheets (P14, C2.2): `POST /api/m/photo/mark` reads the answers in a photo's cells.

The phone finds the sheet's four squares, cuts out the answer cells only (never the name box, the header or the QR
code) and sends them as one greyscale JPEG strip: numbered tiles, two to a row, 600 px wide. This route checks the
strip's shape against the sheet's key, sends it through the AI gateway (`read_sheet`) with, for each tile, only its
number, its cell kind and the digits to expect, never the key's answers (a model that knows the answer "reads" it
into a blurred box), and returns what was read, `[{n, read}]`. The phone marks the readings against the key it
keeps, as for typed answers, so on this route the server never learns right or wrong (C2.2, change 4).

The strip lives in this request's memory only. It is never written to the database, R2, a file or a log, and the
provider is asked not to keep it (`store: false`, no Files API). Only the call itself is counted in `ai_usage`
(tokens, never the picture). `tests/test_photo.py` patches every writer to check this.

A learner's reads a day are counted (7a, C4.9): the module's `per_day` setting (ten; five in `open`) against
`daily_counts`, by her token's hash, kept two days. Over it the route answers 503 "budget", as the cohort's AI budget
does, and the phone says "Photo checking is resting today. Type your answers instead."
"""
import base64
import binascii
import json
import logging
import re

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .. import flags, sheets
from ..textnorm import digits_to_latin

log = logging.getLogger("tutor.photo")

MODULE = "photo"
# the strip (app/js/scan.js makes the same): tiles of 280 x 200 px under a 24 px band with the item's number, two to
# a row, 13 px gutters all round, so 600 px wide and 13 + rows x 237 px high
STRIP_W, TILE_W, TILE_H, BAND, GUTTER = 600, 280, 200, 24, 13
MAX_BYTES = 150_000                      # a strip is about 30 KB; a bigger one is not a strip
MAX_READ = 12                            # characters in one reading
KINDS = {"int": "a whole number in one box",
         "frac": "a fraction: one box on top, a bar, one box below",
         "mixed": "a mixed number: a whole number in a small box on the left, then a fraction (top box, bar, bottom box)"}
DIGITS = {"prs": "Persian digits (۰۱۲۳۴۵۶۷۸۹)", "ps": "Persian digits (۰۱۲۳۴۵۶۷۸۹)", "en": "the digits 0-9"}
ALLOWED = re.compile(r"^[0-9/ .\-]*$")

SYSTEM = """You read children's handwriting on a school worksheet. The picture is a strip of numbered tiles. Each tile is one answer box cut from a photo of the sheet; the black band above it holds the tile's number.
For each tile, write exactly what the child wrote, nothing else. Never work out, correct or guess an answer: if a digit is unclear, write ? for the whole tile. An empty box is "".
The child writes {digits}. Write every number you read with the digits 0-9, a fraction as top/bottom (for example 5/4) and a mixed number as whole top/bottom (for example 1 1/4).
Reply with JSON only: a list of {{"n": tile number, "read": what is written}}, one item for each tile."""


def strip_height(tiles: int) -> int:
    rows = (tiles + 1) // 2
    return GUTTER + rows * (BAND + TILE_H + GUTTER)


def jpeg_size(data: bytes) -> tuple[int, int] | None:
    """(width, height) from a JPEG's frame header, or None when the bytes are not a JPEG."""
    if len(data) < 4 or data[:2] != b"\xff\xd8":
        return None
    i = 2
    while i + 4 <= len(data):
        if data[i] != 0xFF:
            return None
        marker = data[i + 1]
        if marker == 0xFF:                   # fill byte
            i += 1
            continue
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        seg = int.from_bytes(data[i + 2:i + 4], "big")
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            if i + 9 > len(data):
                return None
            return int.from_bytes(data[i + 7:i + 9], "big"), int.from_bytes(data[i + 5:i + 7], "big")
        if marker == 0xDA:                   # the picture data began before any frame header
            return None
        i += 2 + seg
    return None


class MarkIn(BaseModel):
    code: str = Field(min_length=2, max_length=24)        # the code at the sheet's foot, M7-03-48217
    seed: int = Field(ge=0, le=9999)
    lang: str = Field(default="prs", max_length=3)
    strip: str = Field(min_length=100, max_length=MAX_BYTES * 4 // 3 + 64)   # base64 JPEG, an optional data: prefix


def cells_of(lesson: dict, seed: int, lang: str) -> list[dict]:
    """The value cells of a sheet, in item order: [{n, kind}]. Only what the reader may know: no answers."""
    key = sheets.answer_key(lesson, seed, lang, lambda name: name)
    return [{"n": r["n"], "kind": r["cell"]["kind"]} for r in key["items"] if r.get("cell")]


def prompt(cells: list[dict], lang: str) -> list[dict]:
    lines = [f"Tile {c['n']}: {KINDS[c['kind']]}." for c in cells]
    return [{"role": "system", "content": SYSTEM.format(digits=DIGITS.get(lang, DIGITS["prs"]))},
            {"role": "user", "content": "The tiles, in order:\n" + "\n".join(lines)}]


def readings(text: str | None, cells: list[dict]) -> list[dict]:
    """The reply as [{n, read}] for exactly the sheet's cells: a missing, odd or unreadable reading is "?"."""
    got: dict[int, str] = {}
    try:
        body = json.loads(text or "")
    except ValueError:
        m = re.search(r"\[.*\]", text or "", re.S)
        try:
            body = json.loads(m.group(0)) if m else None
        except ValueError:
            body = None
    if isinstance(body, list) and len(body) == 1 and isinstance(body[0], list):
        body = body[0]                       # one picture, one list
    for x in body if isinstance(body, list) else []:
        if isinstance(x, dict) and type(x.get("n")) is int and isinstance(x.get("read"), str):
            r = " ".join(digits_to_latin(x["read"]).replace("٫", ".").replace("⁄", "/").split())
            got[x["n"]] = r if len(r) <= MAX_READ and ALLOWED.match(r) else "?"
    return [{"n": c["n"], "read": got.get(c["n"], "?")} for c in cells]


def router(hub, needs) -> APIRouter:
    r = APIRouter(prefix="/api/m/photo")

    @r.post("/mark", dependencies=needs(MODULE))
    async def mark(body: MarkIn, request: Request):
        who = await hub.learner(request)                       # 401 without her token
        if not who["consent_kind"]:
            raise HTTPException(403, "no consent: photos are not read")
        hub.photo_limit.check(hub.who(request))
        parsed = sheets.parse_code(body.code)
        if not parsed or parsed[1] != body.seed:
            raise HTTPException(422, "the code and the seed do not match")
        lesson = next((l for l in hub.library.lessons.values() if (l.get("sheet") or {}).get("code") == parsed[0]), None)
        if lesson is None:
            raise HTTPException(404, "no such sheet")
        if sheets.digits_to_latin_upper(body.code) != sheets.sheet_code(lesson, body.seed):
            raise HTTPException(422, "not this sheet's code")
        lang = body.lang if body.lang in ("prs", "ps", "en") else "prs"
        cells = cells_of(lesson, body.seed, lang)
        if not cells:
            raise HTTPException(422, "this sheet has nothing to read: type the answers")
        raw = body.strip.split(",", 1)[1] if body.strip.startswith("data:") else body.strip
        try:
            data = base64.b64decode(raw, validate=True)
        except (binascii.Error, ValueError):
            raise HTTPException(422, "the strip is not a picture") from None
        size = jpeg_size(data) if len(data) <= MAX_BYTES else None
        if size != (STRIP_W, strip_height(len(cells))):
            raise HTTPException(422, "the strip is not this sheet's cells")
        cohort = request.query_params.get("cohort") or who["cohort"]
        # her photos today against the cohort's `per_day` (C4.9: five in `open`, ten elsewhere), counted by her token's
        # hash in daily_counts (two days); over it, the phone says photo checking is resting today
        f = await hub.store.flags(cohort)
        per_day = flags.module_settings(hub.modules[MODULE], (f.get(MODULE) or {}).get("settings"))["per_day"]
        if await hub.store.count_today(who["token_hash"], MODULE) > per_day:
            raise HTTPException(503, "budget")
        res = await hub.gateway.call("read_sheet", prompt(cells, lang), module=MODULE, lang=lang, cohort=cohort,
                                     images=[data], max_tokens=60 + 20 * len(cells), temperature=0.0)
        del data, raw
        if res.text is None:
            # off, language, budget, error or timeout: the phone says so and offers "Type my answers"
            raise HTTPException(503, res.why)
        return {"code": sheets.sheet_code(lesson, body.seed), "readings": readings(res.text, cells)}

    return r
