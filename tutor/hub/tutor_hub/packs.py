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
from datetime import date
from pathlib import Path

from . import licences, mathcheck

log = logging.getLogger("tutor.packs")

SUBJECTS = ("maths", "science", "english", "dari", "pashto", "chinese", "quran", "seerah")
LANGS = ("prs", "ps", "en")          # Dari, Pashto, English
CLIP_LANGS = LANGS + ("zh",)         # recorded clips: the three, and Mandarin for a Chinese lesson's words (P27a)
STEP_KINDS = ("read", "letter", "choice", "number", "say", "ayah")
# religious subjects (P29, C4.7): drafted by a person with a Hanafi scholar, never by a tool or a model; no AI reads
# them (they never enter Ask's index or a prompt); a Quran lesson is its verses (`ayah`, from the Quran set) and
# read steps, seerah is read steps only (no question steps, so no warm-ups and no certificates); not for ey in 2027
RELIGIOUS = ("quran", "seerah")
RELIGIOUS_KINDS = {"quran": ("read", "ayah"), "seerah": ("read",)}
AYAH_KEYS = {"kind", "surah", "ayah", "audio"}
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
# P27a (C4.4): the words she learns are written in their own script, never spelt in Dari letters (the recording is the
# model). English in Latin letters; Chinese in characters with pinyin in Latin letters and tone marks
_LATIN = re.compile(r"^[A-Za-z0-9 .,!?'\u2019\"\u2026:;()-]+$")
_HAN = re.compile(r"^[\u3400-\u4dbf\u4e00-\u9fff\uff0c\u3002\uff01\uff1f\u3001]+$")
_PINYIN = re.compile(r"^[A-Za-z\u00fc\u00dc\u0101\u00e1\u01ce\u00e0\u0113\u00e9\u011b\u00e8\u012b\u00ed\u01d0\u00ec"
                     r"\u014d\u00f3\u01d2\u00f2\u016b\u00fa\u01d4\u00f9\u01d6\u01d8\u01da\u01dc .,!?'-]+$")
# a `say` step's fixed phrases (for P27b's check, which waits for D12): never a blank to fill, never a personal slot,
# so no name, age or place ever leaves a phone in her own voice
_SAY_SLOT = re.compile(r"\.\.\.|\u2026|_|\b(name|names|age|aged|old|years?|city|town|village|live|lives|address|"
                       r"phone|number|from)\b", re.I)
_SAY_ANSWER = re.compile(r"^[a-z' ]+$", re.I)
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


def validate_lesson(lesson: dict, pack_dir: Path, clips: dict | None = None, qset=None) -> list[str]:
    """Every problem with a lesson, in plain words (an empty list means it is fine). `qset`: the Quran set
    (quran.py), which an `ayah` step names a verse of."""
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
    sub = lesson.get("subject")
    if sub in RELIGIOUS:
        if not isinstance(lesson.get("drafted_by"), str) or not _INITIALS.match(lesson["drafted_by"]):
            p.append(f"{lid}: drafted_by must be the initials of the person who wrote it with the scholar (never a "
                     "tool or a model)")
        if y == 0:
            p.append(f"{lid}: no {sub} lessons for the early years in 2027")

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
        if sub in RELIGIOUS and k not in RELIGIOUS_KINDS[sub]:
            p.append(f"{w}: a {sub} lesson has only {' and '.join(RELIGIOUS_KINDS[sub])} steps (no question steps)")
        if k == "ayah":
            if sub != "quran":
                p.append(f"{w}: an ayah step belongs to a Quran lesson")
            extra = set(s) - AYAH_KEYS
            if extra:
                p.append(f"{w}: an ayah step names a verse only ({', '.join(sorted(extra))} not allowed: the text, "
                         "its translation and its recitation come from the Quran set, never typed into a lesson)")
            sa, aa = s.get("surah"), s.get("ayah")
            if type(sa) is not int or type(aa) is not int:
                p.append(f"{w}: surah and ayah are numbers")
            elif qset is None or not qset.ok:
                p.append(f"{w}: the Quran set (content/quran) is not here or not whole, so no verse can be shown")
            elif not qset.has(sa, aa):
                p.append(f"{w}: there is no verse {sa}:{aa}")
        pic(s.get("picture"), w)
        pc = s.get("picture_count", 1)
        if not isinstance(pc, int) or not 1 <= pc <= 10:
            p.append(f"{w}: picture_count must be 1 to 10")
        if "recall" in s and (s["recall"] is not True or k not in ("choice", "number")):
            p.append(f"{w}: recall is true, on a choice or number step (spaced review, P25a)")
        if "english" in s and (not isinstance(s["english"], str) or not s["english"].strip()):
            p.append(f"{w}: english must be the English words to show and say")
        elif "english" in s and not _LATIN.match(s["english"]):
            p.append(f"{w}: english is written in English letters (no Dari or Pashto spelling: the recording is the model)")
        if "zh" in s and (not isinstance(s["zh"], str) or not _HAN.match(s["zh"])):
            p.append(f"{w}: zh must be Chinese characters")
        if ("zh" in s) != ("pinyin" in s):
            p.append(f"{w}: zh and pinyin go together (the characters, and their sound with tone marks)")
        elif "pinyin" in s and (not isinstance(s["pinyin"], str) or not _PINYIN.match(s["pinyin"])):
            p.append(f"{w}: pinyin is Latin letters with tone marks, like ni\u01d0 h\u01ceo")
        if "english" in s and "zh" in s:
            p.append(f"{w}: a step teaches English or Chinese, not both")
        if "hide" in s and (s["hide"] is not True or k != "choice" or not ("english" in s or "zh" in s)):
            p.append(f"{w}: hide is true, on a choice that plays its English or Chinese word (listening)")
        if "script" in s and (s["script"] != "latn" or k != "letter"):
            p.append(f"{w}: script is \"latn\", on a letter step (an English letter)")
        if "answers" in s:
            a = s["answers"]
            if k != "say" or "english" not in s:
                p.append(f"{w}: answers belong to a say step with english")
            elif not isinstance(a, list) or not 1 <= len(a) <= 5 or not all(isinstance(x, str) for x in a):
                p.append(f"{w}: answers must be one to five fixed phrases")
            else:
                for x in a:
                    if _SAY_SLOT.search(x):
                        p.append(f"{w}: answer {x!r} has a blank or a personal slot (name, age, city, phone number): "
                                 "leave it out, so it stays hear-yourself")
                    elif not _SAY_ANSWER.match(x) or not 1 <= len(x.split()) <= 4:
                        p.append(f"{w}: answer {x!r} must be one to four English words")
        if "audio" in s:
            if not isinstance(s["audio"], dict) or not s["audio"]:
                p.append(f"{w}: audio must name a recorded clip per language, {{\"prs\": \"clip-name\"}}")
            else:
                for al, clip in s["audio"].items():
                    if al not in CLIP_LANGS or clip not in clips.get(al, {}):
                        p.append(f"{w}: audio {al}/{clip} is not in audio/{al}/manifest.json")
        if k == "read":
            _check_text(s.get("text"), w, p)
            _check_maths_in(s.get("text"), w, p)
        elif k == "letter":
            if not isinstance(s.get("letter"), str) or not s["letter"].strip():
                p.append(f"{w}: letter missing")
            if s.get("script") == "latn":      # an English letter: "Aa", and its picture word in English (P27a)
                if not re.match(r"^[A-Za-z]{1,2}$", str(s.get("letter", ""))):
                    p.append(f"{w}: an English letter is written like Aa")
                if "english" not in s:
                    p.append(f"{w}: an English letter needs its picture word in english")
                _check_text(s.get("word"), w + " word", p, required=False)
            else:
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
        if k in ("read", "say") and lesson.get("subject") == "chinese" and "english" in s:
            p.append(f"{w}: a Chinese lesson's words are zh and pinyin")

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
            if "step" in it and not _int_in(it["step"], 1, len(steps)):
                p.append(f"{w}: step must be the number of one of the lesson's steps, counting from 1")
            if "step_same" in it and (k != "generate" or it.get("type") != "fraction_add"
                                      or not _int_in(it["step_same"], 1, len(steps))):
                p.append(f"{w}: step_same is for fraction_add items: the step for sums whose bottom numbers match")
            if k in ("sum", "count", "generate") and "step" not in it:
                p.append(f"{w}: step must name the lesson step that teaches it (the first hint points there)")
            if k in ("sum", "count"):
                from . import hints           # the hint ladder (C2.3): rungs 2 and 3 code cannot make come from the pack
                p += [f"{w}: {e}" for e in hints.check_own(it)]
            if "mixed" in it and (k != "sum" or not isinstance(it["mixed"], bool)):
                p.append(f"{w}: mixed (true or false) is for a sum whose answer is a mixed number")
            if k == "generate":
                t = it.get("type")
                if t not in GENERATORS:
                    p.append(f"{w}: type must be one of {', '.join(GENERATORS)}")
                if not _int_in(it.get("count"), 1, 30):
                    p.append(f"{w}: count must be 1 to 30")
                if "work" in it and not isinstance(it["work"], bool):
                    p.append(f"{w}: work must be true or false")
                for opt, v in it.items():
                    if opt in ("kind", "type", "count", "prompt", "work", "step", "step_same") or t not in GENERATORS:
                        continue
                    if opt not in GENERATORS[t]:
                        p.append(f"{w}: {t} has no option '{opt}' (it has {', '.join(GENERATORS[t]) or 'none'})")
                    elif not GENERATORS[t][opt](v):
                        p.append(f"{w}: {opt} cannot be {v!r}")

    if sheet is not None and not p:
        from . import sheets                  # the slot grid (C2.1): a sheet must fit one A4 page
        try:
            tall = sheets.too_tall(lesson)
        except Exception as e:                # a sheet the layout cannot read is a problem, not a crash
            tall = f"the sheet cannot be laid out ({e})"
        if tall:
            p.append(f"{lid} sheet: {tall}")

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


def content_hash(item: dict, pack_dir: Path, clips: dict | None = None, qset=None) -> str:
    """What reviewers sign: the lesson (or link card) without its review, plus every picture's bytes and every
    clip's recorded hash, so a changed word, picture or recording voids the signatures; and for an `ayah` step the
    verse as the Quran set shows it (text, translations, the recitation's hash), so a new translation version voids
    them too."""
    if clips is None:
        clips = read_clips(pack_dir)
    body = {k: v for k, v in item.items() if k != "review" and not k.startswith("_")}      # `_bold`: the hub's own
    media = {}

    def walk(o):
        if isinstance(o, dict):
            if o.get("kind") == "ayah" and qset is not None and qset.has(o.get("surah"), o.get("ayah")):
                media[f"quran/{o['surah']}:{o['ayah']}"] = qset.verse_hash(o["surah"], o["ayah"])
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


CHECKLIST_KEYS = {"steps", "review"}
CHECKLIST_STEP_KEYS = {"id", "text", "open"}
CHECKLIST_ROLES = ("adviser", "Dari reader", "Pashto reader")


def check_checklist(cl, where: str) -> list[str]:
    """A pack's checklist (P28, C4.6): 1 to 12 steps, each our own words in Dari and Pashto (English optional), at
    most 140 characters, promising nothing; a step may open a subject (`"open": "subject:maths"`). Signed by an
    adviser and the Dari and Pashto readers."""
    if not isinstance(cl, dict):
        return [f"{where}: must be an object {{steps, review}}"]
    p = []
    if extra := set(cl) - CHECKLIST_KEYS:
        p.append(f"{where}: unknown field {sorted(extra)}")
    steps = cl.get("steps")
    if not isinstance(steps, list) or not 1 <= len(steps) <= 12:
        return p + [f"{where}: steps must be a list of 1 to 12 steps"]
    seen = set()
    for i, st in enumerate(steps, 1):
        w = f"{where} step {i}"
        if not isinstance(st, dict):
            p.append(f"{w}: must be an object {{id, text, open}}")
            continue
        if extra := set(st) - CHECKLIST_STEP_KEYS:
            p.append(f"{w}: unknown field {sorted(extra)}")
        if not isinstance(st.get("id"), str) or not _ID.match(st["id"]) or st["id"] in seen:
            p.append(f"{w}: id must be lower-case letters, digits and dashes, each once")
        seen.add(st.get("id"))
        t = st.get("text")
        if not isinstance(t, dict) or not all(isinstance(t.get(l), str) and t[l].strip() for l in ("prs", "ps")):
            p.append(f"{w}: text must be our own words, {{\"prs\": ..., \"ps\": ...}}")
        else:
            for lang, x in t.items():
                if lang not in LANGS or not isinstance(x, str) or len(x) > licences.CARD_ABOUT_MAX:
                    p.append(f"{w}: text ({lang}) must be at most {licences.CARD_ABOUT_MAX} characters")
                elif bad := licences.promises(x):
                    p.append(f"{w}: promises what no one can promise ({', '.join(bad)})")
        if "open" in st:
            kind, _, what = str(st["open"]).partition(":")
            if kind != "subject" or what not in SUBJECTS:
                p.append(f"{w}: open must be \"subject:<subject>\" (one of {', '.join(SUBJECTS)})")
    p += check_review(cl.get("review"), where)
    needs = (cl.get("review") or {}).get("needs") or [] if isinstance(cl.get("review"), dict) else []
    for role in CHECKLIST_ROLES:
        if role not in needs:
            p.append(f"{where}: the review must include {'an' if role == 'adviser' else 'a'} {role}")
    return p


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


TRACKS = ("literacy", "reader")
BANDS = ("ey", "p1", "p2", "s1", "s2", "ad")


def tracks_of(pack: dict) -> list[str]:
    """The adult tracks that see an adult pack (P26), or a pack whose `bands` hold adults (P27a): `tracks`, by
    default the reader track only."""
    adult = pack.get("audience") == "adult" or "ad" in (pack.get("bands") or [])
    return list(pack.get("tracks") or ["reader"]) if adult else []


def lesson_bands(lesson: dict, pack: dict) -> list[str]:
    """Who a lesson is for: the pack's `bands` where it names them (P27a: a pack outside the school years, such as the
    Chinese starter for s2 and adult readers), else adults for an adult pack, else the band of the lesson's year."""
    if pack.get("bands"):
        return list(pack["bands"])
    return ["ad"] if pack.get("audience") == "adult" else [band_of_year(lesson.get("year", 12))]


def reads_every_step(lesson: dict, pack: dict) -> bool:
    """Every step is read aloud on open, so needs a recorded clip: years 0 to 3, and (P26, C4.3) an adult pack the
    literacy track sees. An adult lesson's year says nothing about who reads it, nor does any lesson's in a pack with
    `bands`. A Quran or seerah lesson too (C4.7): narration and translations in a native speaker's voice."""
    if lesson.get("subject") in RELIGIOUS:
        return True
    if pack.get("audience") == "adult" or pack.get("bands"):
        bands = lesson_bands(lesson, pack)
        return bool({"ey", "p1"} & set(bands)) or ("ad" in bands and "literacy" in tracks_of(pack))
    return band_of_year(lesson.get("year", 12)) in ("ey", "p1")


# the words a language lesson teaches, and the clip each needs before release (P27a, C4.4): every `english` field and
# every `say` step of an English lesson in a human English voice, every `zh` field of a Chinese one in a native
# Mandarin voice; no synthetic voice, and placeholders never count
STUDIED = {"english": ("english", "en"), "chinese": ("zh", "zh")}


def studied_clip_steps(lesson: dict) -> list[tuple[int, str]]:
    """(step number, clip language) for each step whose taught words need a recording."""
    field, al = STUDIED.get(lesson.get("subject"), (None, None))
    if not field:
        return []
    return [(i, al) for i, st in enumerate(lesson.get("steps") or [], 1)
            if field in st or (field == "english" and st.get("kind") == "say")]


def release_problems(lesson: dict, state: str, pack: dict, clips: dict, qset=None) -> list[str]:
    """Why a lesson may not reach learners yet: unsigned, a reviewer role missing, or (F1) the youngest learners'
    steps and every letter step without a recorded clip in each of the pack's languages (placeholders don't count)."""
    lid = lesson.get("id", "?")
    p = []
    if state != "signed":
        p.append(f"{lid}: not signed by its reviewers yet" + (" (changed since it was signed)" if state == "changed" else ""))
    needs = (lesson.get("review") or {}).get("needs") or []
    religious = lesson.get("subject") in RELIGIOUS
    want = ["Dari reader", "Pashto reader"] + (["adult educator"] if pack.get("audience") == "adult" else []) + \
        (["Hanafi scholar"] if religious else [])
    for role in want:
        if role not in needs:
            p.append(f"{lid}: the review must include a {role}")
    if not religious and not any("teacher" in r for r in needs):
        p.append(f"{lid}: the review must include a subject teacher")
    # Quran and seerah (C4.7): every step in a native speaker's voice, in each of the pack's languages (an ayah
    # step's clip is its translation, read aloud; its recitation is the reciter's), and every verse's recitation
    young = reads_every_step(lesson, pack)
    if any(st.get("kind") == "ayah" for st in lesson.get("steps") or []) and not (qset is not None and qset.signed):
        p.append(f"{lid}: the Quran set (content/quran) is not signed by a Hanafi scholar at its current hash")
    for i, st in enumerate(lesson.get("steps") or [], 1):
        if st.get("kind") == "ayah" and not (qset is not None and qset.listed(st.get("surah"), st.get("ayah"))):
            p.append(f"{lid} step {i}: verse {st.get('surah')}:{st.get('ayah')} has no recitation in the set's list")
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
    for i, al in studied_clip_steps(lesson):
        st = lesson["steps"][i - 1]
        clip = (st.get("audio") or {}).get(al)
        entry = clips.get(al, {}).get(clip) if clip else None
        who = "a human English speaker" if al == "en" else "a native Mandarin speaker"
        if not entry or entry.get("placeholder"):
            p.append(f"{lid} step {i}: needs its words recorded by {who} ({al}) before release")
    return p


def clips_needed(lib) -> list[dict]:
    """The recording job (P27a's slots for human voices): every clip release would want and the pack lacks, or has
    only as a placeholder, with the words to say. `validate_pack.py --clips` prints it for the recorders."""
    out = []
    for pid, pack in lib.packs.items():
        clips = pack.get("_clips", {})
        for lid in pack["lessons"]:
            l = lib.lessons[lid]
            young = reads_every_step(l, pack)
            want = [(i, al) for i, st in enumerate(l.get("steps") or [], 1) if young or st.get("kind") == "letter"
                    for al in pack.get("langs", ["prs", "ps"]) if al in ("prs", "ps")] + studied_clip_steps(l)
            for i, al in want:
                st = l["steps"][i - 1]
                entry = clips.get(al, {}).get((st.get("audio") or {}).get(al))
                if entry and not entry.get("placeholder"):
                    continue
                words = st.get("english") if al == "en" else st.get("zh") if al == "zh" else \
                    text(st.get("text") or st.get("prompt") or st.get("word"), al, ())
                if st.get("kind") == "ayah" and lib.quran is not None and lib.quran.has(st["surah"], st["ayah"]) \
                        and al in lib.quran.tr:      # the translation, read exactly as QuranEnc publishes it
                    words = f"{st['surah']}:{st['ayah']} " + lib.quran.tr[al]["verses"][(st["surah"], st["ayah"])][0]
                out.append({"pack": pid, "lesson": lid, "step": i, "lang": al, "words": words or "",
                            "placeholder": bool(entry)})
    return out


def _sources_file(packs_dir: Path) -> Path:
    """content/sources.json beside the packs folder, else the repository's own."""
    near = Path(packs_dir).parent / "sources.json"
    return near if near.is_file() else TUTOR / "content" / "sources.json"


class Library:
    """Every lesson from every pack in a folder, checked once at start.

    `release`: production. Only signed lessons and link cards are served (the rest are listed in `hidden`), and
    a lesson for the youngest learners needs its recorded clips. Otherwise drafts are served, marked `draft`."""

    def __init__(self, packs_dir, *, release: bool = False, sources=None, quran=None):
        self.dir = Path(packs_dir)
        self.release = release
        self.sources = sources if isinstance(sources, licences.Sources) else \
            licences.Sources(Path(sources) if sources else _sources_file(self.dir))
        # the Quran set (P29) beside the packs folder, unless another is given; an `ayah` step names its verses
        from . import quran as quran_mod
        self.quran = quran if quran is not None else quran_mod.QuranSet(self.dir.parent / "quran", self.sources)
        self.packs: dict[str, dict] = {}
        self.lessons: dict[str, dict] = {}
        self.lesson_pack: dict[str, str] = {}
        self.hashes: dict[str, str] = {}          # lesson id -> content hash
        self.states: dict[str, str] = {}          # lesson id -> signed, changed or draft
        self.terms: dict[str, dict] = {}          # lesson id -> {nc, sa} from its sources
        self.links: list[dict] = []               # link cards, each with its pack and state
        self.checklists: dict[str, dict] = {}     # pack id -> its checklist (P28: the university pack), with state
        self.hidden: list[str] = []               # release mode: what is not served, and why
        self.problems: list[str] = []
        self.known: dict[str, dict] = {}          # every lesson that loaded, served or not: {band, sheet} (the graph)
        self.graphs: dict[str, dict] = {}         # the skills graphs by subject (graph.py, P25a)
        self.graph_dir = self.dir.parent / "graph"
        self.load()

    def load(self):
        for x in (self.packs, self.lessons, self.lesson_pack, self.hashes, self.states, self.terms, self.known,
                  self.graphs):
            x.clear()
        self.links.clear(); self.hidden.clear(); self.problems.clear(); self.checklists.clear()
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
                    probs = validate_lesson(lesson, pdir, clips, self.quran) if isinstance(lesson, dict) \
                        else ["must be an object"]
                    if isinstance(lesson, dict) and not pack_nc and self._nc_recitation() and any(
                            isinstance(st, dict) and st.get("kind") == "ayah" for st in lesson.get("steps") or []):
                        probs.append(f"{lid}: its verses play Islamic Network's recitation (non-commercial), so "
                                     "pack.json must say \"licence\": \"NC\"")
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
                chash = content_hash(lesson, pdir, clips, self.quran)
                state = review_state(lesson, chash)
                self.known[lid] = {"band": lesson_bands(lesson, pack)[0], "bands": lesson_bands(lesson, pack),
                                   "sheet": bool(lesson.get("sheet"))}
                if self.release:
                    why = release_problems(lesson, state, pack, clips, self.quran)
                    if why:
                        self.hidden.extend(f"{pid}/{x}" for x in why)
                        continue
                if pack.get("audience") == "adult" or pack.get("bands"):
                    lesson["_bold"] = "literacy" in tracks_of(pack)      # its sheets print bold (sheets.layout)
                self.lessons[lid] = lesson
                self.lesson_pack[lid] = pid
                self.hashes[lid], self.states[lid] = chash, state
                self.terms[lid] = {"nc": terms["nc"], "sa": terms["sa"]}
                kept.append(lid)
            pack["lessons"] = kept
            pack["_media_terms"] = media_terms
            self.packs[pid] = pack
            self._load_links(pack, pid, pdir, clips)
            self._load_checklist(pid, pdir, clips)
        from . import graph                   # the skills graphs map nodes to the lessons just loaded
        graphs, probs, hidden = graph.load(self.graph_dir, self.known, release=self.release)
        self.graphs.update(graphs)
        self.problems.extend(probs)
        self.hidden.extend(hidden)
        for x in self.problems:
            log.warning("pack problem: %s", x)
        if self.hidden:
            log.info("release mode: %d lesson(s) or card(s) not served until signed", len(self.hidden))

    def _nc_recitation(self) -> bool:
        """The set's recitation comes from a non-commercial source (Islamic Network: BUNDLE-NC)."""
        q = self.quran
        return any(sid in self.sources.by_id and self.sources.effective_class(sid) == "BUNDLE-NC"
                   for sid in (q.audio_sources() if q is not None else []))

    def _check_pack(self, pack, pid) -> list[str]:
        p = []
        if pack.get("licence", "open") not in ("open", "NC"):
            p.append(f"{pid}: licence must be \"NC\" (non-commercial material allowed) or left out")
        if "share_alike" in pack and not isinstance(pack["share_alike"], bool):
            p.append(f"{pid}: share_alike must be true or false")
        if pack.get("audience", "child") not in ("child", "adult"):
            p.append(f"{pid}: audience must be \"adult\" or left out")
        if "bands" in pack:
            b = pack["bands"]
            if not isinstance(b, list) or not b or any(x not in BANDS for x in b) or len(set(b)) != len(b):
                p.append(f"{pid}: bands must list bands, like [\"s2\", \"ad\"]")
            elif pack.get("audience") == "adult" and b != ["ad"]:
                p.append(f"{pid}: an adult pack is for adults; a pack for children and adults leaves audience out")
        if "tracks" in pack:
            tr = pack["tracks"]
            if pack.get("audience") != "adult" and "ad" not in (pack.get("bands") or []):
                p.append(f"{pid}: tracks are for adult packs (or packs whose bands hold \"ad\") only")
            elif not isinstance(tr, list) or not tr or any(x not in TRACKS for x in tr) or len(set(tr)) != len(tr):
                p.append(f"{pid}: tracks must list \"literacy\" and/or \"reader\"")
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

    def _load_checklist(self, pid, pdir, clips):
        """checklist.json (P28, C4.6): the steps she ticks on her phone, the pack's own text, signed like a card."""
        f = pdir / "checklist.json"
        if not f.is_file():
            return
        try:
            cl = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            self.problems.append(f"{pid}/checklist.json: {e}")
            return
        probs = check_checklist(cl, f"{pid}/checklist.json")
        if probs:
            self.problems.extend(probs)
            return
        chash = content_hash(cl, pdir, clips)
        state = review_state(cl, chash)
        if self.release and state != "signed":
            self.hidden.append(f"{pid}/checklist.json: not signed by its reviewers yet")
            return
        self.checklists[pid] = {**cl, "_pack": pid, "_hash": chash, "_state": state, "_file": f}

    def card_set(self, pid: str) -> list[dict]:
        """A pack's card set as reviewers sign it (P28): its checklist, if any, then its link cards in order."""
        cl = self.checklists.get(pid)
        return ([cl] if cl else []) + [c for c in self.links if c["_pack"] == pid]

    def card_set_hash(self, pid: str) -> str:
        return licences.sha256_text("\n".join([f"cards:{pid}"] + [x["_hash"] for x in self.card_set(pid)]))

    def university(self, today: str | None = None) -> dict:
        """What the university screen shows (P28): the checklist and the cards still within their review_by date."""
        cl = next((c for _, c in sorted(self.checklists.items())), None)
        cards = self.link_cards(subject="university", today=today)
        return {"checklist": None if cl is None else {
                    "steps": cl["steps"], "draft": cl["_state"] != "signed"},
                "cards": cards}

    def university_ready(self) -> bool:
        """The first card set is signed (C4.6): a signed checklist and at least one signed university card."""
        return any(c["_state"] == "signed" for c in self.checklists.values()) and any(
            c["_state"] == "signed" and c.get("subject") == "university" for c in self.links)

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
                        **({"tracks": tracks_of(pack)} if tracks_of(pack) else {}),
                        **({"bands": pack["bands"]} if pack.get("bands") else {}),
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
        out.pop("_bold", None)
        out["pack"] = pid
        out["draft"] = self.states[lesson_id] != "signed"
        out["credits"] = self.credits_for(lesson_id)
        out.pop("sheet", None)       # the sheet is fetched as a page or PDF; its answers stay on the hub
        out.pop("review", None)      # who signed stays in the pack
        out.pop("drafted_by", None)  # and who drafted it
        out.pop("sources", None)     # the credits say it for the learner
        return out

    def link_cards(self, *, subject=None, year=None, lesson=None, today: str | None = None) -> list[dict]:
        """Link cards for the app: our words about a page elsewhere, the owner and the address. Online only. A card
        past its `review_by` date is not served (P28: six months after a person checked the page)."""
        out = []
        today = today or date.today().isoformat()
        for c in self.links:
            if c.get("review_by") and c["review_by"] < today:
                continue
            if (c.get("subject") == "university") != (subject == "university"):
                continue                      # university cards show on the university screen only
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
                        "needs": ["internet"], "draft": c["_state"] != "signed",
                        **{k: c[k] for k in licences.UNI_FIELDS if k in c}})
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
