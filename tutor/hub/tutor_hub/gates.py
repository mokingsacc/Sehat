"""The pilot's gates the admin panel keeps (C4.9, 7a).

Photo marking for `open` turns on only once the pilot report shows four numbers, which the report's author writes
into `cohorts/gates/photo-open.json` (it travels with the seed cohorts, so the hub and the Worker read the same file):

    {"report": "pilot report, July 2027",
     "fix": {"prs": {"sheets": 240, "cells": 3100, "fixed": 180}, "en": {...}},   (1) per language: at least 200
                                                                                      photographed sheets, and Fix used
                                                                                      on fewer than 1 cell in 10
     "leaks": 0,                                                                  (2) no leaked answer a teacher saw
     "tokens_per_mark": 1400,                                                     (3) what one mark costs, measured
     "d7": "decided: ..."}                                                        (4) D7 decided

Until the file is there and passes, the panel refuses to switch `photo` on in `open` (409, lock "gate"); then the
admin sets `ai` on and `ai_budget` from (3): marks a day x tokens a mark x 1.2 (`budget`). Pashto sheets wait until
Pashto is trusted for `read_sheet`, which the gateway already decides. Homework help (`homework`) and Ask (`ask`) stay
off in `open` in 2027 (lock "open"): their hints are AI text no person sees there, and their distress path promises a
teacher who is not there (C2.8). The code changes when a sitting changes that.
"""
import json
from datetime import datetime
from pathlib import Path

PHOTO_OPEN = Path("gates") / "photo-open.json"
SHEETS_MIN = 200
FIX_MAX = 0.1
OFF_IN_OPEN = ("ask", "homework")


def photo_open(cohorts: Path) -> tuple[list[str], dict]:
    """(why photo marking may not be switched on in `open` yet, the gate's numbers); no problems means it may."""
    why, g = photo_open_why(cohorts)
    return [w["text"] for w in why], g


def photo_open_why(cohorts: Path) -> tuple[list[dict], dict]:
    """The same, each problem as {code, text, ...its numbers}: the staff pages show `gate.<code>` in the reader's
    language (C5.1), `text` is the English sentence for logs and refusals."""
    f = Path(cohorts) / PHOTO_OPEN
    try:
        g = json.loads(f.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return [_w("missing", "the pilot's four numbers are not in yet (cohorts/gates/photo-open.json)")], {}
    except (OSError, ValueError) as e:
        return [_w("unreadable", f"cohorts/gates/photo-open.json is not readable ({e})")], {}
    if not isinstance(g, dict):
        return [_w("not_object", "cohorts/gates/photo-open.json is one JSON object")], {}
    p = []
    fix = g.get("fix")
    if not isinstance(fix, dict) or not fix:
        p.append(_w("fix", "(1) fix: the Fix rate per language"))
    else:
        for lang, x in fix.items():
            ok = isinstance(x, dict) and all(type(x.get(k)) is int and x[k] >= 0 for k in ("sheets", "cells", "fixed"))
            if not ok or not x["cells"]:
                p.append(_w("fix_numbers", f"(1) fix.{lang}: sheets, cells and fixed as whole numbers", lang=lang))
            elif x["sheets"] < SHEETS_MIN:
                p.append(_w("fix_sheets", f"(1) {lang}: {x['sheets']} sheets, at least {SHEETS_MIN} needed",
                            lang=lang, n=x["sheets"], min=SHEETS_MIN))
            elif x["fixed"] / x["cells"] >= FIX_MAX:
                p.append(_w("fix_rate", f"(1) {lang}: Fix on {x['fixed']} of {x['cells']} cells, fewer than 1 in 10 needed",
                            lang=lang, a=x["fixed"], b=x["cells"]))
    if g.get("leaks") != 0:
        p.append(_w("leaks", "(2) leaks: no leaked answer in any rung a teacher saw (0)"))
    if type(g.get("tokens_per_mark")) is not int or g["tokens_per_mark"] <= 0:
        p.append(_w("tokens", "(3) tokens_per_mark: the tokens one mark costs, measured"))
    if not isinstance(g.get("d7"), str) or not g["d7"].strip():
        p.append(_w("d7", "(4) d7: D7's decision"))
    return p, g


def _w(code: str, text: str, **numbers) -> dict:
    return {"code": code, "text": text, **numbers}


def budget(tokens_per_mark: int, marks_a_day: int) -> int:
    """The `ai_budget` the recipe gives: marks a day x tokens a mark x 1.2."""
    return int(marks_a_day * tokens_per_mark * 1.2)


# C6.A8 and C6.B8: live audio classes and contests are built, off, and switched on per cohort only once the legal
# opinions are in. Where TUTOR_RELEASE is on, the admin panel refuses to switch them on (lock "gate") until the
# gate file holds the decision and the opinion's date; staging needs neither, so the committee can look.
#   cohorts/gates/live.json     {"d9": "decided: ...", "opinion": "2027-07-20"}    (D9 and the live-class opinion)
#   cohorts/gates/contest.json  {"opinion": "2027-03-15"}                          (D15, the competitions opinion)
LIVE_GATE = Path("gates") / "live.json"
CONTEST_GATE = Path("gates") / "contest.json"
GATE_FILES = {"live": (LIVE_GATE, ("d9", "opinion")), "contest": (CONTEST_GATE, ("opinion",))}


def module_gate_open(cohorts: Path, mid: str) -> bool:
    """Whether `cohorts/gates/<mid>.json` holds what C6 asks of it: each field a non-empty string, and `opinion` a
    date (YYYY-MM-DD). A missing, unreadable or incomplete file keeps the gate shut."""
    rel, fields = GATE_FILES[mid]
    try:
        g = json.loads((Path(cohorts) / rel).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    if not isinstance(g, dict) or not all(isinstance(g.get(k), str) and g[k].strip() for k in fields):
        return False
    try:
        datetime.strptime(g["opinion"].strip(), "%Y-%m-%d")
    except ValueError:
        return False
    return True
