"""Contests (P31, DESIGN-C6-SPECS.md C6.5): a short set of questions from signed lessons, open to a class for a while.

A contest is a file `content/contests/<id>.json`:
`{id, title: {prs, ps, en}, subject, bands, langs, opens_at, closes_at, minutes, items: [{lesson, step}], certificate,
scope, review}`. Times are UTC minutes, `YYYY-MM-DDTHH:MM`. Each item names a `choice` or `number` step of a lesson
(the step counted from 1), so a contest asks nothing a lesson's reviewers have not signed; the contest's own words are
its title only. `scope` ("class" or "all") is advice to the admin, not code: the admin releases a contest to each
class (`releases`, pack `contest:<id>`).

The checks (`check`, run when the hub starts and by `tools/validate_pack.py`): the id lower case and the file's
name; 5 to 30 items, each once, every one a `choice` or `number` step of a lesson of the contest's subject served
to each listed band and language; the window from one hour to 14 days, `minutes` 5 to 60; the title in Dari, Pashto
and English, at most 80 characters, through the no-promise lint and the contest list (no prize, money, winner, first
place or award, in any of the three languages); a review that needs the Dari and Pashto readers and a subject
teacher. In release mode a contest that asks an unsigned lesson is held, not served.

The hash (`contest:<id>`, what its reviewers sign) is the file without its review plus each item's lesson hash, so a
changed lesson voids the contest's signatures too. In release mode an unsigned contest, or one signed before a lesson
changed, is not served (`hidden`). Each item is a review step of its own, hashed with its lesson's hash.

Nothing here marks anyone: `mark()` turns a set of answers into a count, and the routes (mods/contest.py) keep only
the percent in her `contest.done` event.
"""
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import licences, mathcheck, packs

ID = re.compile(r"^[a-z][a-z0-9-]{1,47}$")
AT = "%Y-%m-%dT%H:%M"
BANDS = ("p1", "p2", "s1", "s2", "ad")
KEYS = {"id", "title", "subject", "bands", "langs", "opens_at", "closes_at", "minutes", "items", "certificate", "scope",
        "review"}
ITEMS = (5, 30)
MINUTES = (5, 60)
WINDOW = (timedelta(hours=1), timedelta(days=14))
TITLE_MAX = 80
ROLES = ("Dari reader", "Pashto reader")            # and a subject teacher ("maths teacher", "English teacher", ...)
LATE = timedelta(minutes=10)                         # answers are taken up to 10 minutes after the close
SOON = timedelta(days=7)                             # the phone lists a contest a week before it opens
# the contest list (C6.5): words that promise a prize or a place, whole words in each language (drafts in Dari and
# Pashto, for the native speakers); the cards' no-promise lint (licences.promises) runs on the titles as well
NO_PRIZE = {
    "en": ("prize", "prizes", "money", "win", "wins", "winner", "winners", "first", "award", "awards"),
    "prs": ("جایزه", "جوایز", "پول", "برنده", "اول", "مقام"),
    "ps": ("انعام", "پیسې", "ګټونکی", "ګټونکي", "لومړی", "مقام"),
}


def _norm(x: str) -> str:
    x = str(x or "").lower().replace("‌", " ").replace("ي", "ی").replace("ك", "ک")
    return re.sub(r"\s+", " ", x)


def prize_words(text: str) -> list[str]:
    """The contest list's words in a text, as whole words, in any of the three languages."""
    words = set(re.findall(r"[^\W\d_]+", _norm(text)))
    return sorted({w for ws in NO_PRIZE.values() for w in ws if _norm(w) in words})


def when(s) -> datetime | None:
    try:
        return datetime.strptime(s, AT).replace(tzinfo=timezone.utc) if isinstance(s, str) and len(s) == 16 else None
    except ValueError:
        return None


def iso(t: datetime) -> str:
    return t.astimezone(timezone.utc).strftime(AT)


def _h(x) -> str:
    return licences.sha256_text(json.dumps(x, ensure_ascii=False, sort_keys=True, separators=(",", ":")))


def check(c, lib, name: str | None = None) -> list[str]:
    """The problems with one contest against the lessons the library serves."""
    w = f"contests/{name or (c.get('id') if isinstance(c, dict) else '?')}"
    if not isinstance(c, dict):
        return [f"{w}: must be an object"]
    p = []
    if extra := set(c) - KEYS:
        p.append(f"{w}: unknown field {sorted(extra)}")
    cid = c.get("id")
    if not isinstance(cid, str) or not ID.match(cid):
        p.append(f"{w}: id is lower-case letters, digits and dashes, 2 to 48, starting with a letter")
    elif name is not None and cid != name:
        p.append(f"{w}: the file name and the id inside differ")
    t = c.get("title")
    if not isinstance(t, dict) or set(t) != set(packs.LANGS) or not all(isinstance(t[x], str) and t[x].strip() for x in t):
        p.append(f"{w}: title is {{\"prs\": ..., \"ps\": ..., \"en\": ...}}, all three")
    else:
        for lang, x in t.items():
            if len(x) > TITLE_MAX:
                p.append(f"{w}: title ({lang}) is at most {TITLE_MAX} characters")
            if bad := prize_words(x) + licences.promises(x):
                p.append(f"{w}: title ({lang}) promises a prize or a place ({', '.join(sorted(set(bad)))})")
    if c.get("subject") not in packs.SUBJECTS or c.get("subject") in packs.RELIGIOUS:
        p.append(f"{w}: subject is one of {', '.join(x for x in packs.SUBJECTS if x not in packs.RELIGIOUS)}")
    bands, langs = c.get("bands"), c.get("langs")
    if not isinstance(bands, list) or not bands or any(b not in BANDS for b in bands) or len(set(bands)) != len(bands):
        p.append(f"{w}: bands is a list from {', '.join(BANDS)} (never early years)")
        bands = []
    if not isinstance(langs, list) or not langs or any(x not in packs.LANGS for x in langs) or len(set(langs)) != len(langs):
        p.append(f"{w}: langs is a list from {', '.join(packs.LANGS)}")
        langs = []
    a, b = when(c.get("opens_at")), when(c.get("closes_at"))
    if not a or not b:
        p.append(f"{w}: opens_at and closes_at are UTC minutes, YYYY-MM-DDTHH:MM")
    elif not WINDOW[0] <= b - a <= WINDOW[1]:
        p.append(f"{w}: the window is from one hour to 14 days")
    m = c.get("minutes")
    if type(m) is not int or not MINUTES[0] <= m <= MINUTES[1]:
        p.append(f"{w}: minutes is a whole number from {MINUTES[0]} to {MINUTES[1]}")
    if type(c.get("certificate")) is not bool:
        p.append(f"{w}: certificate is true or false")
    if c.get("scope") not in ("class", "all"):
        p.append(f"{w}: scope is \"class\" or \"all\" (advice to the admin)")
    items = c.get("items")
    if not isinstance(items, list) or not ITEMS[0] <= len(items) <= ITEMS[1]:
        p.append(f"{w}: items is a list of {ITEMS[0]} to {ITEMS[1]} questions")
        items = []
    seen = set()
    for i, it in enumerate(items, 1):
        wi = f"{w} item {i}"
        if not isinstance(it, dict) or set(it) != {"lesson", "step"} or type(it.get("step")) is not int:
            p.append(f"{wi}: an item is exactly {{lesson, step}}, the step counted from 1")
            continue
        key = (it["lesson"], it["step"])
        if key in seen:
            p.append(f"{wi}: {it['lesson']} step {it['step']} is asked twice")
        seen.add(key)
        lesson = lib.lessons.get(it["lesson"]) if isinstance(it["lesson"], str) else None
        if lesson is None:
            if not (lib.release and it["lesson"] in lib.known):         # unsigned in release mode: load() hides it
                p.append(f"{wi}: {it['lesson']} is not a lesson here")
            continue
        if lesson.get("subject") != c.get("subject"):
            p.append(f"{wi}: {it['lesson']} is a {lesson.get('subject')} lesson, not {c.get('subject')}")
        steps = lesson.get("steps") or []
        if not 1 <= it["step"] <= len(steps):
            p.append(f"{wi}: {it['lesson']} has no step {it['step']}")
            continue
        if steps[it["step"] - 1].get("kind") not in ("choice", "number"):
            p.append(f"{wi}: {it['lesson']} step {it['step']} is not a choice or number question")
        pack = lib.packs[lib.lesson_pack[it["lesson"]]]
        if miss := [x for x in bands if x not in packs.lesson_bands(lesson, pack)]:
            p.append(f"{wi}: {it['lesson']} is not for {', '.join(miss)}")
        if miss := [x for x in langs if x not in (pack.get("langs") or ["prs", "ps"])]:
            p.append(f"{wi}: {it['lesson']} is not in {', '.join(miss)}")
    p += packs.check_review(c.get("review"), w)
    needs = (c.get("review") or {}).get("needs") or [] if isinstance(c.get("review"), dict) else []
    if not all(r in needs for r in ROLES) or not any(isinstance(r, str) and r.endswith(" teacher") for r in needs):
        p.append(f"{w}: the review needs the Dari and Pashto readers and a subject teacher")
    return p


def item_hashes(c: dict, lib) -> list[str]:
    """The review's steps: the contest without its items and review as step 0, then each item with its lesson's
    hash, so an OK on an item stands only while its lesson is unchanged."""
    rest = {k: v for k, v in c.items() if k not in ("items", "review") and not k.startswith("_")}
    return [_h(rest)] + [_h({"item": it, "lesson": lib.hashes.get(it["lesson"])}) for it in c["items"]]


def content_hash(c: dict, lib) -> str:
    """What the contest's reviewers sign: the file without its review, and each item's lesson hash."""
    body = {k: v for k, v in c.items() if k != "review" and not k.startswith("_")}
    return _h({"contest": body, "lessons": {it["lesson"]: lib.hashes.get(it["lesson"]) for it in c["items"]}})


def load(folder: Path, lib, *, release: bool) -> tuple[dict, list[str], list[str]]:
    """Every contest in `folder` that passes its checks, each with `_hash` and `_state`; the problems; and in
    release mode what is not served and why."""
    out, problems, hidden = {}, [], []
    if not folder.is_dir():
        return out, problems, hidden
    for f in sorted(folder.glob("*.json")):
        try:
            c = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            problems.append(f"contests/{f.stem}: {e}")
            continue
        probs = check(c, lib, f.stem)
        if not probs and c["id"] in out:
            probs = [f"contests/{f.stem}: two contests have this id"]
        if probs:
            problems.extend(probs)
            continue
        if unsigned := [it["lesson"] for it in c["items"] if it["lesson"] not in lib.lessons]:
            hidden.append(f"contest:{c['id']}: a lesson it asks is not signed yet ({', '.join(sorted(set(unsigned)))})")
            continue
        c["_hash"], c["_file"] = content_hash(c, lib), f
        c["_state"] = packs.review_state(c, c["_hash"])
        if release and c["_state"] != "signed":
            hidden.append(f"contest:{c['id']}: " + ("a lesson or the contest changed since it was signed: sign again"
                                                     if c["_state"] == "changed" else "not signed by its reviewers yet"))
            continue
        out[c["id"]] = c
    return out, problems, hidden


def signed_roles(c: dict, signs: list[dict]) -> dict[str, bool]:
    """Each role the contest needs, and whether it signed the current hash, in the file or on the review page (the
    `signoffs` rows of `contest:<id>`, before tools/pull_signoffs.py copies them in)."""
    needs = (c.get("review") or {}).get("needs") or []
    offs = {(s.get("role"), s.get("hash")) for s in (c.get("review") or {}).get("signoffs") or [] if isinstance(s, dict)}
    offs |= {(s["role"], s["content_hash"]) for s in signs}
    return {role: (role, c["_hash"]) in offs for role in needs}


def phase(c: dict, now: datetime) -> str:
    """soon (opens within 7 days), open, late (the 10 minutes after the close, answers still taken), closed, or
    later (more than a week away)."""
    a, b = when(c["opens_at"]), when(c["closes_at"])
    if now < a - SOON:
        return "later"
    if now < a:
        return "soon"
    if now < b:
        return "open"
    return "late" if now < b + LATE else "closed"


def question(lib, it: dict) -> dict:
    """One item as the phone shows it: the lesson's step without its answer and its why (`strip_key`), its pictures
    as URLs, and the lesson's id for the pictures' credits."""
    app = lib.lesson_for_app(it["lesson"])
    st = app["steps"][it["step"] - 1]
    return {"lesson": it["lesson"], **strip_key(st)}


def strip_key(step: dict) -> dict:
    """A step with nothing that gives its answer away: no `answer`, no `why`, no `hints`, no `recall`."""
    return {k: v for k, v in step.items() if k not in ("answer", "why", "hints", "recall")}


def key(lib, c: dict) -> list[dict]:
    """The answers and their whys in item order, for after the close."""
    out = []
    for it in c["items"]:
        st = lib.lessons[it["lesson"]]["steps"][it["step"] - 1]
        out.append({"kind": st["kind"], "answer": st.get("answer"), "why": st.get("why")})
    return out


def right(step: dict, answer) -> bool:
    """One answer marked by code: a choice by its index, a number by its value (Persian digits, a fraction, a mixed
    number; an unsimplified fraction counts, as on the sheets)."""
    if step.get("kind") == "choice":
        return type(answer) is int and answer == step.get("answer")
    if step.get("kind") == "number":
        if not isinstance(answer, (str, int)) or isinstance(answer, bool) or len(str(answer)) > 40:
            return False
        got, want = mathcheck.plain(str(answer)), mathcheck.plain(str(step.get("answer")))
        return got is not None and want is not None and got == want
    return False


def mark(lib, c: dict, answers: list) -> dict:
    """{right, n, percent}: nothing per item is kept."""
    n = len(c["items"])
    ok = sum(1 for it, a in zip(c["items"], answers) if right(lib.lessons[it["lesson"]]["steps"][it["step"] - 1], a))
    return {"right": ok, "n": n, "percent": round(100 * ok / n) if n else 0}
