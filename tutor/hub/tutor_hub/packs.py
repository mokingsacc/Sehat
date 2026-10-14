"""Lesson packs: loading, checking and summarising them.

A pack is a folder with pack.json, lessons/*.json and pictures/. The format is described in docs/CONTENT.md.
The same checks run when the hub starts (a broken lesson is left out, never half-shown) and in tools/validate_pack.py.
"""
import json
import logging
import re
from pathlib import Path

from . import mathcheck

log = logging.getLogger("tutor.packs")

SUBJECTS = ("maths", "science", "english", "dari", "pashto")
LANGS = ("prs", "ps", "en")          # Dari, Pashto, English
STEP_KINDS = ("read", "letter", "choice", "number", "say")
ITEM_KINDS = ("trace", "circle", "draw", "count", "sum", "write", "sort", "generate")
GENERATORS = ("fraction_add", "add_sub", "times")
PICTURE_EXT = (".svg", ".webp", ".png", ".jpg")
_ID = re.compile(r"^[a-z0-9][a-z0-9-]{1,63}$")


def text(t, lang: str, fallback=("prs", "ps", "en")) -> str:
    """The text for this language, falling back to another language rather than showing nothing."""
    if t is None:
        return ""
    if isinstance(t, str):
        return t
    for code in (lang, *fallback):
        if t.get(code):
            return t[code]
    return ""


def _check_text(t, where, problems, required=True):
    if t is None or t == "" or t == {}:
        if required:
            problems.append(f"{where}: text missing")
        return
    if isinstance(t, str):
        return
    if not isinstance(t, dict):
        problems.append(f"{where}: text must be a string or {{\"prs\": ..., \"ps\": ...}}")
        return
    bad = [k for k in t if k not in LANGS]
    if bad:
        problems.append(f"{where}: unknown language {bad} (use prs, ps, en)")
    if not any(isinstance(v, str) and v.strip() for v in t.values()):
        problems.append(f"{where}: every language is empty")


def _check_maths_in(t, where, problems):
    """Sums written in lesson text must add up ($1/2 + 1/4 = 3/4$)."""
    for v in ([t] if isinstance(t, str) else list((t or {}).values())):
        c = mathcheck.check(str(v).replace("$", " "))
        for w in c.wrong:
            problems.append(f"{where}: sum does not add up: {w}")


def picture_file(pack_dir: Path, name: str):
    if not name or "/" in name or "\\" in name or name.startswith("."):
        return None
    for ext in ("",) + PICTURE_EXT:
        p = pack_dir / "pictures" / (name + ext)
        if p.is_file() and p.suffix.lower() in PICTURE_EXT:
            return p
    return None


def validate_lesson(lesson: dict, pack_dir: Path) -> list[str]:
    """Every problem with a lesson, in plain words (an empty list means it is fine)."""
    p = []
    lid = lesson.get("id", "?")
    if not isinstance(lesson.get("id"), str) or not _ID.match(lesson["id"]):
        p.append(f"{lid}: id must be lower-case letters, digits and dashes")
    if lesson.get("subject") not in SUBJECTS:
        p.append(f"{lid}: subject must be one of {', '.join(SUBJECTS)}")
    y = lesson.get("year")
    if not isinstance(y, int) or not 0 <= y <= 12:
        p.append(f"{lid}: year must be 0 (not in school yet) to 12")
    _check_text(lesson.get("title"), f"{lid} title", p)

    def pic(name, where):
        if name and not picture_file(pack_dir, name):
            p.append(f"{where}: picture '{name}' is not in pictures/")

    steps = lesson.get("steps")
    if not isinstance(steps, list) or not steps:
        p.append(f"{lid}: needs at least one step")
        steps = []
    for i, s in enumerate(steps, 1):
        w = f"{lid} step {i}"
        k = s.get("kind")
        if k not in STEP_KINDS:
            p.append(f"{w}: kind must be one of {', '.join(STEP_KINDS)}")
            continue
        pic(s.get("picture"), w)
        pc = s.get("picture_count", 1)
        if not isinstance(pc, int) or not 1 <= pc <= 10:
            p.append(f"{w}: picture_count must be 1 to 10")
        if "english" in s and (not isinstance(s["english"], str) or not s["english"].strip()):
            p.append(f"{w}: english must be the English words to show and say")
        if k == "read":
            _check_text(s.get("text"), w, p)
            _check_maths_in(s.get("text"), w, p)
        elif k == "letter":
            if not isinstance(s.get("letter"), str) or not s["letter"].strip():
                p.append(f"{w}: letter missing")
            _check_text(s.get("word"), w + " word", p)
        elif k == "choice":
            _check_text(s.get("prompt"), w + " prompt", p)
            opts = s.get("options")
            if not isinstance(opts, list) or not 2 <= len(opts) <= 4:
                p.append(f"{w}: a choice needs 2 to 4 options")
                opts = []
            for j, o in enumerate(opts, 1):
                if isinstance(o, dict) and ("picture" in o or "text" in o):
                    pic(o.get("picture"), f"{w} option {j}")
                    if "text" in o:
                        _check_text(o["text"], f"{w} option {j}", p)
                else:
                    _check_text(o, f"{w} option {j}", p)
            a = s.get("answer")
            if not isinstance(a, int) or not 0 <= a < max(len(opts), 1):
                p.append(f"{w}: answer must be the number of the right option, counting from 0")
            _check_text(s.get("why"), w + " why", p, required=False)
        elif k == "number":
            _check_text(s.get("prompt"), w + " prompt", p)
            if mathcheck.evaluate(str(s.get("answer", ""))) is None:
                p.append(f"{w}: answer must be a number or fraction such as 3/4")
        elif k == "say":
            _check_text(s.get("text"), w, p)

    sheet = lesson.get("sheet")
    if sheet is not None:
        if not isinstance(sheet.get("code"), str) or not re.match(r"^[A-Z0-9-]{2,12}$", sheet["code"]):
            p.append(f"{lid} sheet: code must be short capitals, like M7-03")
        _check_text(sheet.get("title"), f"{lid} sheet title", p, required=False)
        items = sheet.get("items")
        if not isinstance(items, list) or not items:
            p.append(f"{lid} sheet: needs at least one item")
            items = []
        for i, it in enumerate(items, 1):
            w = f"{lid} sheet item {i}"
            k = it.get("kind")
            if k not in ITEM_KINDS:
                p.append(f"{w}: kind must be one of {', '.join(ITEM_KINDS)}")
                continue
            if k == "trace" and not str(it.get("text", "")).strip():
                p.append(f"{w}: trace needs text")
            if k == "trace" and not (isinstance(it.get("count", 1), int) and 1 <= it.get("count", 1) <= 8):
                p.append(f"{w}: count must be 1 to 8")
            if k in ("circle",):
                for name in it.get("pictures", []):
                    pic(name, w)
                if not set(it.get("answer", [])) <= set(it.get("pictures", [])):
                    p.append(f"{w}: answer pictures must be among the pictures")
            if k == "count":
                pic(it.get("picture"), w)
                if not isinstance(it.get("how_many"), int) or not 1 <= it["how_many"] <= 20:
                    p.append(f"{w}: how_many must be 1 to 20")
            if k == "sum":
                v = mathcheck.evaluate(str(it.get("q", "")))
                if v is None:
                    p.append(f"{w}: q must be a sum such as 1/2 + 1/4")
                elif "a" in it and mathcheck.evaluate(str(it["a"])) != v:
                    p.append(f"{w}: the answer {it['a']} is wrong ({it['q']} = {mathcheck.fmt(v, fa=False)})")
            if k in ("write", "draw", "circle", "sort"):
                _check_text(it.get("prompt"), w + " prompt", p)
            if k == "sort":
                groups, words, ans = it.get("groups", []), it.get("words", []), it.get("answer", [])
                if len(ans) != len(words) or any(not isinstance(a, int) or not 0 <= a < len(groups) for a in ans):
                    p.append(f"{w}: answer must give a group number for every word")
            if k == "generate":
                if it.get("type") not in GENERATORS:
                    p.append(f"{w}: type must be one of {', '.join(GENERATORS)}")
                if not isinstance(it.get("count"), int) or not 1 <= it["count"] <= 30:
                    p.append(f"{w}: count must be 1 to 30")

    for i, b in enumerate(lesson.get("bank") or [], 1):
        w = f"{lid} bank {i}"
        _check_text(b.get("q"), w + " q", p)
        _check_text(b.get("a"), w + " a", p)
        _check_maths_in(b.get("a"), w + " a", p)
    return p


class Library:
    """Every lesson from every pack in a folder, checked once at start."""

    def __init__(self, packs_dir):
        self.dir = Path(packs_dir)
        self.packs: dict[str, dict] = {}
        self.lessons: dict[str, dict] = {}
        self.lesson_pack: dict[str, str] = {}
        self.problems: list[str] = []
        self.load()

    def load(self):
        self.packs.clear(); self.lessons.clear(); self.lesson_pack.clear(); self.problems.clear()
        if not self.dir.is_dir():
            self.problems.append(f"no packs folder at {self.dir}")
            return
        for pj in sorted(self.dir.glob("*/pack.json")):
            pdir = pj.parent
            try:
                pack = json.loads(pj.read_text(encoding="utf-8"))
            except (OSError, ValueError) as e:
                self.problems.append(f"{pj}: {e}")
                continue
            pid = pack.get("id") or pdir.name
            pack["id"], pack["_dir"], kept = pid, pdir, []
            for lid in pack.get("lessons", []):
                f = pdir / "lessons" / f"{lid}.json"
                try:
                    lesson = json.loads(f.read_text(encoding="utf-8"))
                except (OSError, ValueError) as e:
                    self.problems.append(f"{pid}/{lid}: {e}")
                    continue
                probs = validate_lesson(lesson, pdir)
                if lesson.get("id") != lid:
                    probs.append(f"{lid}: the file name and the id inside differ")
                if lid in self.lessons:
                    probs.append(f"{lid}: two lessons have this id")
                if probs:
                    self.problems.extend(f"{pid}/{x}" for x in probs)
                    continue
                self.lessons[lid] = lesson
                self.lesson_pack[lid] = pid
                kept.append(lid)
            pack["lessons"] = kept
            self.packs[pid] = pack
        for x in self.problems:
            log.warning("pack problem: %s", x)

    def pack_dir(self, lesson_id: str):
        pid = self.lesson_pack.get(lesson_id)
        return self.packs[pid]["_dir"] if pid else None

    def summary(self) -> list[dict]:
        """What the app needs to draw its lists: no step content."""
        out = []
        for pid, pack in self.packs.items():
            lessons = []
            for lid in pack["lessons"]:
                l = self.lessons[lid]
                letter = next((s["letter"] for s in l["steps"] if s.get("kind") == "letter"), None)
                lessons.append({"id": lid, "subject": l["subject"], "year": l["year"], "order": l.get("order", 0),
                                "title": l["title"], "unit": l.get("unit"), "minutes": l.get("minutes"),
                                "steps": len(l["steps"]), "glyph": letter, "sheet": bool(l.get("sheet")),
                                "code": (l.get("sheet") or {}).get("code"),
                                "seeded": any(it.get("kind") == "generate" for it in (l.get("sheet") or {}).get("items", [])),
                                "review": (l.get("review") or {}).get("status", "draft")})
            out.append({"id": pid, "title": pack.get("title"), "version": pack.get("version"),
                        "langs": pack.get("langs", []), "lessons": lessons})
        return out

    def lesson_for_app(self, lesson_id: str):
        """The whole lesson, with picture names turned into URLs the phone can load."""
        l = self.lessons.get(lesson_id)
        if not l:
            return None
        pid = self.lesson_pack[lesson_id]
        pdir = self.packs[pid]["_dir"]

        def url(name):
            f = picture_file(pdir, name) if name else None
            return f"/packs/{pid}/pictures/{f.name}" if f else None

        out = json.loads(json.dumps(l))
        for s in out["steps"]:
            if s.get("picture"):
                s["picture"] = url(s["picture"])
            for o in s.get("options", []) if s.get("kind") == "choice" else []:
                if isinstance(o, dict) and o.get("picture"):
                    o["picture"] = url(o["picture"])
        out["pack"] = pid
        out.pop("sheet", None)       # the sheet is fetched as a page or PDF; its answers stay on the hub
        return out
