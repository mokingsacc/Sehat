"""Lesson packs: loading, checking and summarising them.

A pack is a folder with pack.json, lessons/*.json, pictures/, optionally audio/<lang>/ (recorded clips and their
manifest.json) and links.json (link cards). The format is described in docs/CONTENT.md. The same checks run when the
hub starts (a broken lesson is left out, never half-shown) and in tools/validate_pack.py.

Licences (licences.py, from content/sources.json) are checked here too, and every lesson has a content hash: a
lesson is signed when each role its review needs has signed that hash, so any later change voids the signatures.
In release mode (TUTOR_RELEASE=1, production) a lesson or link card that is not signed, or a lesson for the youngest
learners without recorded clips, is never served; otherwise drafts are served marked `draft`, for reviewers.
"""
import json
import logging
import re
from pathlib import Path

from . import licences, mathcheck

log = logging.getLogger("tutor.packs")

SUBJECTS = ("maths", "science", "english", "dari", "pashto")
LANGS = ("prs", "ps", "en")          # Dari, Pashto, English
STEP_KINDS = ("read", "letter", "choice", "number", "say")
ITEM_KINDS = ("trace", "circle", "draw", "count", "sum", "write", "sort", "generate")


def _int_in(v, lo, hi) -> bool:
    return isinstance(v, int) and not isinstance(v, bool) and lo <= v <= hi


# each sum generator (sheets.py) and the options a lesson may give it
GENERATORS = {
    "fraction_add": {"max_den": lambda v: _int_in(v, 4, 24), "same_first": lambda v: _int_in(v, 0, 30)},
    "add_sub": {"max_total": lambda v: _int_in(v, 2, 1000),
                "ops": lambda v: isinstance(v, str) and bool(v) and set(v) <= set("+-")},
    "times": {"tables": lambda v: isinstance(v, list) and bool(v) and all(_int_in(t, 1, 12) for t in v)},
}
PICTURE_EXT = (".svg", ".webp", ".png", ".jpg")
AUDIO_EXT = (".opus", ".ogg", ".mp3")
_ID = re.compile(r"^[a-z0-9][a-z0-9-]{1,63}$")
_CLIP = re.compile(r"^[a-z0-9][a-z0-9._-]{0,79}$")
_INITIALS = re.compile(r"^[A-Z]{1,4}$")              # initials only: a reviewer's name is never written down
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TUTOR = Path(__file__).resolve().parents[2]
SIGNOFF_KEYS = ("role", "initials", "date", "hash")
REVIEW_KEYS = ("status", "needs", "signoffs")


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


def read_clips(pack_dir: Path) -> dict:
    """{lang: {clip name: entry}} from audio/<lang>/manifest.json; each entry names the file and who recorded it."""
    out = {}
    for m in sorted((Path(pack_dir) / "audio").glob("*/manifest.json")):
        try:
            clips = json.loads(m.read_text(encoding="utf-8")).get("clips", {})
        except (OSError, ValueError, AttributeError):
            clips = {}
        out[m.parent.name] = clips if isinstance(clips, dict) else {}
    return out


def check_clips(clips: dict, where: str) -> list[str]:
    """A clip manifest: every clip a file, who recorded it (a code, never a name), when, and whether it is only a
    placeholder. No clip is ever made by a speech synthesiser."""
    p = []
    for lang, entries in clips.items():
        for name, c in entries.items():
            w = f"{where} audio/{lang}/{name}"
            if not _CLIP.match(str(name)) or not isinstance(c, dict):
                p.append(f"{w}: clip names are lower case; each entry is an object")
                continue
            if not isinstance(c.get("file"), str) or Path(c["file"]).suffix not in AUDIO_EXT or "/" in c["file"]:
                p.append(f"{w}: file must be a {', '.join(AUDIO_EXT)} file in audio/{lang}/")
            if not isinstance(c.get("speaker"), str) or not c["speaker"].strip():
                p.append(f"{w}: speaker missing (who recorded it, as a code such as prs-01)")
            if not isinstance(c.get("placeholder"), bool):
                p.append(f"{w}: placeholder must be true or false")
            if c.get("synthetic", False) is not False:
                p.append(f"{w}: no synthetic voice, ever: clips are recordings by native speakers")
            if not isinstance(c.get("sha256"), str) or not c["sha256"].startswith("sha256:"):
                p.append(f"{w}: sha256 of the file missing")
    return p


def validate_lesson(lesson: dict, pack_dir: Path, clips: dict | None = None) -> list[str]:
    """Every problem with a lesson, in plain words (an empty list means it is fine)."""
    if clips is None:
        clips = read_clips(pack_dir)
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
        if "audio" in s:
            if not isinstance(s["audio"], dict) or not s["audio"]:
                p.append(f"{w}: audio must name a recorded clip per language, {{\"prs\": \"clip-name\"}}")
            else:
                for al, clip in s["audio"].items():
                    if al not in LANGS or clip not in clips.get(al, {}):
                        p.append(f"{w}: audio {al}/{clip} is not in audio/{al}/manifest.json")
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
            if mathcheck.plain(str(s.get("answer", ""))) is None:
                p.append(f"{w}: answer must be one number or fraction such as 3/4, not a sum")
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
                t = it.get("type")
                if t not in GENERATORS:
                    p.append(f"{w}: type must be one of {', '.join(GENERATORS)}")
                if not _int_in(it.get("count"), 1, 30):
                    p.append(f"{w}: count must be 1 to 30")
                if "work" in it and not isinstance(it["work"], bool):
                    p.append(f"{w}: work must be true or false")
                for opt, v in it.items():
                    if opt in ("kind", "type", "count", "prompt", "work") or t not in GENERATORS:
                        continue
                    if opt not in GENERATORS[t]:
                        p.append(f"{w}: {t} has no option '{opt}' (it has {', '.join(GENERATORS[t]) or 'none'})")
                    elif not GENERATORS[t][opt](v):
                        p.append(f"{w}: {opt} cannot be {v!r}")

    for i, b in enumerate(lesson.get("bank") or [], 1):
        w = f"{lid} bank {i}"
        _check_text(b.get("q"), w + " q", p)
        _check_text(b.get("a"), w + " a", p)
        _check_maths_in(b.get("a"), w + " a", p)
    p += check_review(lesson.get("review"), lid)
    if not isinstance(lesson.get("sources", []), list):
        p.append(f"{lid}: sources must be a list")
    return p


def check_review(r, where) -> list[str]:
    """`review`: {status, needs: [roles], signoffs: [{role, initials, date, hash}]}. Initials only, never a name."""
    if r is None:
        return []
    if not isinstance(r, dict):
        return [f"{where}: review must be an object"]
    p = []
    extra = set(r) - set(REVIEW_KEYS)
    if extra:
        p.append(f"{where} review: unknown field {sorted(extra)}")
    needs = r.get("needs", [])
    if not isinstance(needs, list) or not all(isinstance(x, str) and x.strip() for x in needs):
        p.append(f"{where} review: needs must be a list of roles, like \"Dari reader\"")
        needs = []
    for i, so in enumerate(r.get("signoffs") or [], 1):
        w = f"{where} review signoff {i}"
        if not isinstance(so, dict) or set(so) != set(SIGNOFF_KEYS):
            p.append(f"{w}: a signoff is exactly {{role, initials, date, hash}}")
            continue
        if so["role"] not in needs:
            p.append(f"{w}: role {so['role']!r} is not one the lesson needs")
        if not isinstance(so["initials"], str) or not _INITIALS.match(so["initials"]):
            p.append(f"{w}: initials are 1 to 4 capital letters, never a name")
        if not isinstance(so["date"], str) or not _DATE.match(so["date"]):
            p.append(f"{w}: date must be YYYY-MM-DD")
        if not isinstance(so["hash"], str) or not re.match(r"^sha256:[0-9a-f]{64}$", so["hash"]):
            p.append(f"{w}: hash must be the lesson's content hash (validate_pack.py --hashes)")
    return p


def content_hash(item: dict, pack_dir: Path, clips: dict | None = None) -> str:
    """What reviewers sign: the lesson (or link card) without its review, plus every picture's bytes and every
    clip's recorded hash, so a changed word, picture or recording voids the signatures."""
    if clips is None:
        clips = read_clips(pack_dir)
    body = {k: v for k, v in item.items() if k != "review"}
    media = {}

    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k == "picture" and isinstance(v, str):
                    f = picture_file(pack_dir, v)
                    if f:
                        media["pictures/" + f.name] = licences.sha256_bytes(f.read_bytes())
                elif k in ("pictures", "answer") and isinstance(v, list):
                    for name in v:
                        f = picture_file(pack_dir, name) if isinstance(name, str) else None
                        if f:
                            media["pictures/" + f.name] = licences.sha256_bytes(f.read_bytes())
                elif k == "audio" and isinstance(v, dict):
                    for al, clip in v.items():
                        c = clips.get(al, {}).get(clip) or {}
                        media[f"audio/{al}/{clip}"] = [c.get("sha256"), c.get("speaker"), c.get("placeholder")]
                else:
                    walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(body)
    blob = json.dumps({"content": body, "media": media}, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return licences.sha256_text(blob)


def review_state(item: dict, chash: str) -> str:
    """signed (every role it needs signed this exact content), changed (signed once, edited since) or draft."""
    r = item.get("review") or {}
    needs = r.get("needs") or []
    offs = [so for so in r.get("signoffs") or [] if isinstance(so, dict)]
    if needs and all(any(so.get("role") == role and so.get("hash") == chash for so in offs) for role in needs):
        return "signed"
    return "changed" if any(so.get("hash") != chash for so in offs) else "draft"


def band_of_year(year: int) -> str:
    return "ey" if year == 0 else "p1" if year <= 3 else "p2" if year <= 6 else "s1" if year <= 9 else "s2"


def release_problems(lesson: dict, state: str, pack: dict, clips: dict) -> list[str]:
    """Why a lesson may not reach learners yet: unsigned, a reviewer role missing, or (F1) the youngest learners'
    steps and every letter step without a recorded clip in each of the pack's languages (placeholders don't count)."""
    lid = lesson.get("id", "?")
    p = []
    if state != "signed":
        p.append(f"{lid}: not signed by its reviewers yet" + (" (changed since it was signed)" if state == "changed" else ""))
    needs = (lesson.get("review") or {}).get("needs") or []
    want = ["Dari reader", "Pashto reader"] + (["adult educator"] if pack.get("audience") == "adult" else [])
    for role in want:
        if role not in needs:
            p.append(f"{lid}: the review must include a {role}")
    if not any("teacher" in r for r in needs):
        p.append(f"{lid}: the review must include a subject teacher")
    young = band_of_year(lesson.get("year", 12)) in ("ey", "p1")
    for i, st in enumerate(lesson.get("steps") or [], 1):
        if not (young or st.get("kind") == "letter"):
            continue
        for al in [x for x in pack.get("langs", ["prs", "ps"]) if x in ("prs", "ps")]:
            clip = (st.get("audio") or {}).get(al)
            entry = clips.get(al, {}).get(clip) if clip else None
            if not entry:
                p.append(f"{lid} step {i}: needs a recorded {al} clip before release (no synthetic voice)")
            elif entry.get("placeholder"):
                p.append(f"{lid} step {i}: the {al} clip is a placeholder, not a recording")
    return p


def _sources_file(packs_dir: Path) -> Path:
    """content/sources.json beside the packs folder, else the repository's own."""
    near = Path(packs_dir).parent / "sources.json"
    return near if near.is_file() else TUTOR / "content" / "sources.json"


class Library:
    """Every lesson from every pack in a folder, checked once at start.

    `release`: production. Only signed lessons and link cards are served (the rest are listed in `hidden`), and
    a lesson for the youngest learners needs its recorded clips. Otherwise drafts are served, marked `draft`."""

    def __init__(self, packs_dir, *, release: bool = False, sources=None):
        self.dir = Path(packs_dir)
        self.release = release
        self.sources = sources if isinstance(sources, licences.Sources) else \
            licences.Sources(Path(sources) if sources else _sources_file(self.dir))
        self.packs: dict[str, dict] = {}
        self.lessons: dict[str, dict] = {}
        self.lesson_pack: dict[str, str] = {}
        self.hashes: dict[str, str] = {}          # lesson id -> content hash
        self.states: dict[str, str] = {}          # lesson id -> signed, changed or draft
        self.terms: dict[str, dict] = {}          # lesson id -> {nc, sa} from its sources
        self.links: list[dict] = []               # link cards, each with its pack and state
        self.hidden: list[str] = []               # release mode: what is not served, and why
        self.problems: list[str] = []
        self.load()

    def load(self):
        for x in (self.packs, self.lessons, self.lesson_pack, self.hashes, self.states, self.terms):
            x.clear()
        self.links.clear(); self.hidden.clear(); self.problems.clear()
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
            if not isinstance(pack, dict) or not isinstance(pack.get("lessons", []), list):
                self.problems.append(f"{pj}: must be an object with a list of lessons")
                continue
            pid = pack.get("id") or pdir.name
            pack["id"], pack["_dir"], kept = pid, pdir, []
            pack_nc = pack.get("licence") == "NC"
            for x in self._check_pack(pack, pid):
                self.problems.append(x)
            clips = read_clips(pdir)
            self.problems.extend(f"{pid}/{x}" for x in check_clips(clips, pid))
            pack["_clips"] = clips
            media_terms = self._check_media(pack, pid, pack_nc)
            for lid in pack.get("lessons", []):
                if not isinstance(lid, str) or not _ID.match(lid):
                    self.problems.append(f"{pid}: {lid!r} is not a lesson id")
                    continue
                f = pdir / "lessons" / f"{lid}.json"
                try:
                    lesson = json.loads(f.read_text(encoding="utf-8"))
                    probs = validate_lesson(lesson, pdir, clips) if isinstance(lesson, dict) else ["must be an object"]
                    terms = {"nc": False, "sa": False, "nc_sa": False, "by_sa": False}
                    if isinstance(lesson, dict) and isinstance(lesson.get("sources", []), list):
                        for j, e in enumerate(lesson.get("sources", []), 1):
                            more, t = self.sources.check_use(e, f"{lid} sources {j}", pack_nc=pack_nc, lesson=lesson)
                            probs += more
                            terms["nc"] |= t["nc"]; terms["sa"] |= t["sa"]
                            terms["nc_sa"] |= t["nc"] and t["sa"]; terms["by_sa"] |= t["sa"] and not t["nc"]
                    if terms["nc_sa"] and terms["by_sa"]:
                        probs.append(f"{lid}: BY-SA and NC-SA material never go in one lesson (their terms clash)")
                    if terms["sa"] and not pack.get("share_alike"):
                        probs.append(f"{lid}: has share-alike (SA) material, so pack.json must say \"share_alike\": true")
                except (OSError, ValueError) as e:
                    self.problems.append(f"{pid}/{lid}: {e}")
                    continue
                except Exception as e:          # a wrong shape somewhere inside: leave this lesson out, keep going
                    self.problems.append(f"{pid}/{lid}: could not be checked ({type(e).__name__}: {e})")
                    continue
                if lesson.get("id") != lid:
                    probs.append(f"{lid}: the file name and the id inside differ")
                if lid in self.lessons:
                    probs.append(f"{lid}: two lessons have this id")
                if probs:
                    self.problems.extend(f"{pid}/{x}" for x in probs)
                    continue
                chash = content_hash(lesson, pdir, clips)
                state = review_state(lesson, chash)
                if self.release:
                    why = release_problems(lesson, state, pack, clips)
                    if why:
                        self.hidden.extend(f"{pid}/{x}" for x in why)
                        continue
                self.lessons[lid] = lesson
                self.lesson_pack[lid] = pid
                self.hashes[lid], self.states[lid] = chash, state
                self.terms[lid] = {"nc": terms["nc"], "sa": terms["sa"]}
                kept.append(lid)
            pack["lessons"] = kept
            pack["_media_terms"] = media_terms
            self.packs[pid] = pack
            self._load_links(pack, pid, pdir, clips)
        for x in self.problems:
            log.warning("pack problem: %s", x)
        if self.hidden:
            log.info("release mode: %d lesson(s) or card(s) not served until signed", len(self.hidden))

    def _check_pack(self, pack, pid) -> list[str]:
        p = []
        if pack.get("licence", "open") not in ("open", "NC"):
            p.append(f"{pid}: licence must be \"NC\" (non-commercial material allowed) or left out")
        if "share_alike" in pack and not isinstance(pack["share_alike"], bool):
            p.append(f"{pid}: share_alike must be true or false")
        if pack.get("audience", "child") not in ("child", "adult"):
            p.append(f"{pid}: audience must be \"adult\" or left out")
        return p

    def _check_media(self, pack, pid, pack_nc) -> dict:
        """pack.json `media`: {"pictures/x.svg": [sources...], "audio/prs/clip": [...]}: where outside pictures and
        clips came from. Anything not listed was made for Qalam."""
        media = pack.get("media", {})
        if not isinstance(media, dict):
            self.problems.append(f"{pid}: media must be {{\"pictures/<file>\": [sources]}}")
            return {}
        out = {}
        for path, uses in media.items():
            if not isinstance(uses, list):
                self.problems.append(f"{pid} media {path}: must be a list of sources")
                continue
            parts = str(path).split("/")
            if parts[0] == "audio" and len(parts) == 3:
                known = parts[2] in pack["_clips"].get(parts[1], {})
            else:
                known = parts[0] == "pictures" and len(parts) == 2 and picture_file(pack["_dir"], Path(parts[1]).stem)
            if not known:
                self.problems.append(f"{pid} media {path}: no such picture (pictures/<file>) or clip (audio/<lang>/<clip>)")
            t = {"nc": False, "sa": False}
            for j, e in enumerate(uses, 1):
                more, tt = self.sources.check_use(e, f"{pid} media {path} {j}", pack_nc=pack_nc)
                self.problems.extend(more)
                t["nc"] |= tt["nc"]; t["sa"] |= tt["sa"]
            if t["sa"] and not pack.get("share_alike"):
                self.problems.append(f"{pid} media {path}: share-alike (SA), so pack.json must say \"share_alike\": true")
            out[path] = t
        return out

    def _load_links(self, pack, pid, pdir, clips):
        f = pdir / "links.json"
        if not f.is_file():
            return
        try:
            cards = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            self.problems.append(f"{pid}/links.json: {e}")
            return
        if not isinstance(cards, list):
            self.problems.append(f"{pid}/links.json: must be a list of link cards")
            return
        seen = set()
        for c in cards:
            probs = self.sources.check_card(c, f"{pid}/links.json") + \
                check_review(c.get("review") if isinstance(c, dict) else None, f"{pid}/links.json {c.get('id') if isinstance(c, dict) else '?'}")
            if not probs and c["id"] in seen:
                probs.append(f"{pid}/links.json: two cards have the id {c['id']}")
            if probs:
                self.problems.extend(probs)
                continue
            seen.add(c["id"])
            chash = content_hash(c, pdir, clips)
            state = review_state(c, chash)
            if self.release and state != "signed":
                self.hidden.append(f"{pid}/links.json {c['id']}: not signed by its reviewers yet")
                continue
            self.links.append({**c, "_pack": pid, "_hash": chash, "_state": state})

    def pack_dir(self, lesson_id: str):
        pid = self.lesson_pack.get(lesson_id)
        return self.packs[pid]["_dir"] if pid else None

    def pack_hash(self, pid: str) -> str:
        """One hash for a pack's served content (its lessons' hashes in order and its cards'): what a release names."""
        pack = self.packs[pid]
        parts = [f"{lid}={self.hashes[lid]}" for lid in pack["lessons"]]
        parts += [f"link:{c['id']}={c['_hash']}" for c in self.links if c["_pack"] == pid]
        return licences.sha256_text("\n".join([f"{pid}@{pack.get('version')}"] + parts))

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
                                "review": "checked" if self.states[lid] == "signed" else "draft",
                                "draft": self.states[lid] != "signed"})
            out.append({"id": pid, "title": pack.get("title"), "version": pack.get("version"),
                        "langs": pack.get("langs", []), "audience": pack.get("audience", "child"),
                        "licence": pack.get("licence", "open"), "lessons": lessons})
        return out

    def credits_for(self, lesson_id: str) -> list[dict]:
        """The one-line source notes at the end of a lesson that uses outside material."""
        l = self.lessons.get(lesson_id) or {}
        out = []
        for e in l.get("sources", []):
            src = self.sources.get(e["id"]) or {}
            out.append({"source": e["id"], "line": self.sources.credit_line(e), "changes": e.get("changes"),
                        "licence": e.get("licence"), "url": e.get("url"), "licence_url": src.get("licenceUrl")})
        return out

    def lesson_for_app(self, lesson_id: str):
        """The whole lesson, with picture and clip names turned into URLs the phone can load."""
        l = self.lessons.get(lesson_id)
        if not l:
            return None
        pid = self.lesson_pack[lesson_id]
        pdir = self.packs[pid]["_dir"]
        clips = self.packs[pid].get("_clips", {})

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
            if isinstance(s.get("audio"), dict):
                s["audio"] = {al: {"url": f"/packs/{pid}/audio/{al}/{clips[al][c]['file']}",
                                   "placeholder": bool(clips[al][c].get("placeholder"))}
                              for al, c in s["audio"].items() if c in clips.get(al, {})}
        out["pack"] = pid
        out["draft"] = self.states[lesson_id] != "signed"
        out["credits"] = self.credits_for(lesson_id)
        out.pop("sheet", None)       # the sheet is fetched as a page or PDF; its answers stay on the hub
        out.pop("review", None)      # who signed stays in the pack
        out.pop("sources", None)     # the credits say it for the learner
        return out

    def link_cards(self, *, subject=None, year=None, lesson=None) -> list[dict]:
        """Link cards for the app: our words about a page elsewhere, the owner and the address. Online only."""
        out = []
        for c in self.links:
            if subject and c.get("subject") and c["subject"] != subject:
                continue
            if year is not None and c.get("years") and year not in c["years"]:
                continue
            if lesson and c.get("lessons") and lesson not in c["lessons"]:
                continue
            src = self.sources.get(c["source"]) or {}
            out.append({"id": c["id"], "title": c["title"], "about": c["about"], "url": c["url"],
                        "owner": src.get("owner"), "source": c["source"], "subject": c.get("subject"),
                        "years": c.get("years", []), "lessons": c.get("lessons", []), "unit": c.get("unit"),
                        "needs": ["internet"], "draft": c["_state"] != "signed"})
        return out

    def credits(self) -> dict:
        """Everything outside Qalam that the served lessons, pictures, clips and link cards use, source by source."""
        by = {}

        def add(e, used_in):
            src = self.sources.get(e["id"]) or {}
            row = by.setdefault(e["id"], {"id": e["id"], "name": src.get("name"), "owner": src.get("owner"),
                                          "url": src.get("url"), "licence": src.get("licence"),
                                          "licence_url": src.get("licenceUrl"), "class": src.get("class"),
                                          "items": []})
            row["items"].append({"title": e.get("title"), "line": self.sources.credit_line(e),
                                 "licence": e.get("licence"), "url": e.get("url"), "changes": e.get("changes"),
                                 "used_in": used_in})

        for lid, l in self.lessons.items():
            for e in l.get("sources", []):
                add(e, lid)
        for pid, pack in self.packs.items():
            for path, uses in (pack.get("media") or {}).items():
                for e in uses if isinstance(uses, list) else []:
                    if isinstance(e, dict) and e.get("id") in self.sources.by_id:
                        add(e, f"{pid}/{path}")
        linked = sorted({c["source"] for c in self.links})
        links = [{"id": sid, "name": (self.sources.get(sid) or {}).get("name"),
                  "owner": (self.sources.get(sid) or {}).get("owner"), "url": (self.sources.get(sid) or {}).get("url")}
                 for sid in linked]
        return {"sources": sorted(by.values(), key=lambda r: r["id"]), "linked": links, "app": licences.APP_CREDITS}
