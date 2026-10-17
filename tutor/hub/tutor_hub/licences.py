"""Licence classes, from content/sources.json, the only record of what Qalam may do with outside material.

BUILD-PLAN 4.1 and 4.2. Every outside source has one class:

- BUNDLE: may be copied into any pack, with credit; share-alike (SA) items carry SA to the pack.
- BUNDLE-NC: non-commercial; only into packs marked `"licence": "NC"`, and never in one lesson with BY-SA items.
- LINK: free to view, all rights reserved: a link card only (our own words about it, at most 140 characters), never
  copied text. Free to watch is not free to copy.
- ASK: treated as LINK until `content/permissions/<id>.md` records a written permission (see its README).
- AVOID: never used, not even as a link card.

Flags: `verbatim` (no changes; the text must match its source by hash), `exact_attribution` (the owner's credit
line, as written in sources.json), `no_ai` (never in a pack or an AI context: link cards only), `per_item_licence`
(each item's own licence decides, within the source's class).

The same checks run when the hub loads its packs (a lesson that fails is left out) and in tools/validate_pack.py.
"""
import hashlib
import json
import re
from pathlib import Path

CLASSES = ("BUNDLE", "BUNDLE-NC", "LINK", "ASK", "AVOID")
COPYABLE = ("BUNDLE", "BUNDLE-NC")
FLAGS = ("verbatim", "exact_attribution", "no_ai", "per_item_licence")
SOURCE_LANGS = ("prs", "ps", "en", "fa", "ar", "zh", "ur")
BANDS = ("ey", "p1", "p2", "s1", "s2", "ad")
SOURCE_KEYS = ("id", "name", "url", "owner", "licence", "licenceUrl", "class", "flags", "languages", "bands",
               "subjects", "formats", "offline", "attribution", "notes", "checked")

# what a lesson's `sources` entry may hold: who, what, where, which licence, what we changed. Nothing else, so no
# copied text hides in it.
USE_KEYS = ("id", "item", "title", "url", "licence", "changes", "checked", "author", "fields", "sha256", "field")
USE_REQUIRED = ("id", "item", "title", "url", "licence", "checked")

# a link card: a title, the owner's site, our own description, where it belongs. Any other field (text, body,
# transcript, quote, embed ...) would be copied material and is refused.
CARD_KEYS = ("id", "source", "title", "about", "url", "subject", "years", "lessons", "unit", "review",
             "kind", "cost", "who", "checked", "review_by")
CARD_ABOUT_MAX = 140
CARD_TITLE_MAX = 120
# a university card (P28, C4.6) says what it is, what it costs and who may apply, when a person checked the page, and
# when it hides (at most six months later); its source is LINK or better, and an adviser signs it
CARD_KINDS = ("course", "scholarship", "test", "guide")
CARD_COSTS = ("free", "audit", "fees")       # "Free" / "Free to watch; certificates cost money" / "Fees for exams; ..."
UNI_FIELDS = ("kind", "cost", "who", "checked", "review_by")
UNI_SOURCE_CLASSES = ("LINK", "BUNDLE", "BUNDLE-NC")
CARD_MONTHS = 6

# the no-promise lint (C4.6): words that promise a place, a scholarship or a result. The Dari and Pashto lines are
# drafts for native speakers to complete
PROMISES = {
    "en": ("guarantee", "you will get", "100%", "everyone gets", "free scholarship", "sure to", "certain to"),
    "prs": ("تضمین", "ضمانت", "حتماً می‌گیرید", "حتما می‌گیرید", "حتماً قبول", "۱۰۰٪", "۱۰۰ ٪", "همه می‌گیرند",
            "بورسیه رایگان", "بورس رایگان"),
    "ps": ("تضمین", "ضمانت", "حتماً به یې ترلاسه کړئ", "خامخا به", "۱۰۰٪", "۱۰۰ ٪", "ټول یې ترلاسه کوي",
           "وړیا بورس", "وړیا بورسیه"),
}


def promises(text: str) -> list[str]:
    """The promising words in a text (any language's list: a Dari card may quote English)."""
    def norm(x):    # the half-space, Arabic letter forms and Persian digits do not hide a word
        x = str(x or "").lower().replace("\u200c", " ").replace("ي", "ی").replace("ك", "ک").replace("ً", "")
        x = x.translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩٪", "01234567890123456789%"))
        return re.sub(r"\s+", " ", x)
    t = norm(text)
    return sorted({w for ws in PROMISES.values() for w in ws if norm(w) in t})


def add_months(day: str, n: int) -> str:
    """YYYY-MM-DD plus n months, on the same day or the month's last."""
    y, m, d = (int(x) for x in day.split("-"))
    m += n
    y, m = y + (m - 1) // 12, (m - 1) % 12 + 1
    last = [31, 29 if y % 4 == 0 and (y % 100 or y % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
    return f"{y:04d}-{m:02d}-{min(d, last):02d}"

# sources whose items Qalam takes only without share-alike, by a committee ruling: Tatoeba's recordings only CC0 or
# CC BY, never SA (C4.4), so the English pack stays free of share-alike
NO_SHARE_ALIKE = {"tatoeba": "C4.4: Tatoeba items only under CC0 or CC BY, never SA"}

_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_SHA = re.compile(r"^sha256:[0-9a-f]{64}$")
_ID = re.compile(r"^[a-z0-9][a-z0-9-]{1,63}$")
_PLACEHOLDER = re.compile(r"\{([a-z][a-z ]*)\}")

# the app's own parts that come from outside, for the Credits page
APP_CREDITS = [
    {"name": "Vazirmatn", "owner": "The Vazirmatn Project Authors", "licence": "SIL Open Font License 1.1",
     "licence_url": "https://openfontlicense.org", "url": "https://github.com/rastikerdar/vazirmatn"},
    {"name": "Noto Naskh Arabic (Arabic script, a subset)", "owner": "The Noto Project Authors", "licence": "SIL Open Font License 1.1",
     "licence_url": "https://openfontlicense.org", "url": "https://github.com/notofonts/arabic"},
    {"name": "Noto Sans SC (Chinese, a subset)", "owner": "Adobe and The Noto Project Authors",
     "licence": "SIL Open Font License 1.1", "licence_url": "https://openfontlicense.org",
     "url": "https://github.com/notofonts/noto-cjk"},
    {"name": "Amiri Quran", "owner": "The Amiri Project Authors", "licence": "SIL Open Font License 1.1",
     "licence_url": "https://openfontlicense.org", "url": "https://github.com/aliftype/amiri"},
]


def sha256_text(s: str) -> str:
    return "sha256:" + hashlib.sha256(s.encode("utf-8")).hexdigest()


def sha256_bytes(b: bytes) -> str:
    return "sha256:" + hashlib.sha256(b).hexdigest()


def item_terms(licence: str) -> dict:
    """What an item's licence line says: open (may be copied at all), nc, sa, nd. Unknown wording is not open."""
    up = str(licence or "").upper()
    words = set(re.split(r"[^A-Z0-9]+", up))
    nc, sa, nd = "NC" in words, "SA" in words, "ND" in words
    open_ = ("CC0" in words or ("CC" in words and "BY" in words) or "PUBLIC DOMAIN" in up
             or bool(words & {"UNLICENSE", "MIT", "BSD", "OFL", "PD"}))
    if "RESERVED" in words:
        open_ = False
    return {"open": open_, "nc": nc, "sa": sa, "nd": nd}


def _has_text(v) -> bool:
    if isinstance(v, str):
        return bool(v.strip())
    return isinstance(v, dict) and any(isinstance(x, str) and x.strip() for x in v.values())


def _texts(v):
    if isinstance(v, str):
        return [v]
    if isinstance(v, dict):
        return [x for x in v.values() if isinstance(x, str)]
    return []


def at_path(obj, path: str):
    """`steps.2.text.prs` -> lesson["steps"][2]["text"]["prs"], or None."""
    for part in str(path).split("."):
        if isinstance(obj, list) and part.isdigit() and int(part) < len(obj):
            obj = obj[int(part)]
        elif isinstance(obj, dict) and part in obj:
            obj = obj[part]
        else:
            return None
    return obj


def read_permission(path: Path) -> dict:
    """The `key: value` lines of a permission record (content/permissions/<id>.md), lower-case keys."""
    out = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return out
    for line in lines:
        m = re.match(r"^\s*([A-Za-z_]+)\s*:\s*(.+?)\s*$", line)
        if m and m.group(1).lower() not in out:
            out[m.group(1).lower()] = m.group(2)
    return out


class Sources:
    """content/sources.json, checked, with the written permissions for ASK sources."""

    def __init__(self, path: Path | None, permissions: Path | None = None):
        self.path = Path(path) if path else None
        self.by_id: dict[str, dict] = {}
        self.granted: dict[str, str] = {}         # ASK source id -> the class its permission allows
        self.problems: list[str] = []
        if self.path is None or not self.path.is_file():
            self.problems.append(f"no sources file at {self.path}")
            return
        try:
            rows = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            self.problems.append(f"{self.path.name}: {e}")
            return
        if not isinstance(rows, list):
            self.problems.append(f"{self.path.name}: must be a list of sources")
            return
        for i, s in enumerate(rows, 1):
            probs = self.check_source(s, i)
            if probs:
                self.problems.extend(probs)
            elif s["id"] in self.by_id:
                self.problems.append(f"sources.json: two sources have the id {s['id']}")
            else:
                self.by_id[s["id"]] = s
        folder = Path(permissions) if permissions else self.path.parent / "permissions"
        for f in sorted(folder.glob("*.md")) if folder.is_dir() else []:
            if f.stem.lower() == "readme":
                continue
            p = read_permission(f)
            src = self.by_id.get(f.stem)
            if not src:
                self.problems.append(f"permissions/{f.name}: no source with the id {f.stem}")
            elif src["class"] != "ASK":
                self.problems.append(f"permissions/{f.name}: {f.stem} is {src['class']}, not ASK")
            elif (p.get("status") or "").lower() == "granted":
                cls = (p.get("class") or "").upper()
                if cls not in COPYABLE or not _DATE.match(p.get("granted") or ""):
                    self.problems.append(f"permissions/{f.name}: a granted permission needs 'class: BUNDLE' or "
                                         "'class: BUNDLE-NC' and 'granted: YYYY-MM-DD'")
                else:
                    self.granted[f.stem] = cls

    @staticmethod
    def check_source(s, i) -> list[str]:
        if not isinstance(s, dict):
            return [f"sources.json entry {i}: must be an object"]
        w = f"sources.json {s.get('id', f'entry {i}')}"
        p = []
        if not isinstance(s.get("id"), str) or not _ID.match(s["id"]):
            p.append(f"{w}: id must be lower-case letters, digits and dashes")
        for k in ("name", "url", "owner", "licence", "attribution"):
            if k == "attribution" and s.get("class") == "AVOID":
                continue                          # never used, so never credited
            if not isinstance(s.get(k), str) or not s[k].strip():
                p.append(f"{w}: {k} missing")
        if s.get("class") not in CLASSES:
            p.append(f"{w}: class must be one of {', '.join(CLASSES)}")
        if not isinstance(s.get("flags", []), list) or set(s.get("flags", [])) - set(FLAGS):
            p.append(f"{w}: flags must be among {', '.join(FLAGS)}")
        if set(s.get("languages") or []) - set(SOURCE_LANGS):
            p.append(f"{w}: languages must be among {', '.join(SOURCE_LANGS)}")
        if set(s.get("bands") or []) - set(BANDS):
            p.append(f"{w}: bands must be among {', '.join(BANDS)}")
        if not isinstance(s.get("checked"), str) or not _DATE.match(s["checked"]):
            p.append(f"{w}: checked must be a date, YYYY-MM-DD")
        extra = set(s) - set(SOURCE_KEYS)
        if extra:
            p.append(f"{w}: unknown field {sorted(extra)}")
        return p

    def get(self, sid):
        return self.by_id.get(sid)

    def effective_class(self, sid) -> str | None:
        """The class that applies today: an ASK source with a written permission takes the permitted class."""
        s = self.by_id.get(sid)
        if not s:
            return None
        if s["class"] == "ASK" and sid in self.granted:
            return self.granted[sid]
        return s["class"]

    def flags(self, sid) -> set:
        return set((self.by_id.get(sid) or {}).get("flags", []))

    # one outside item used in a lesson, a picture or a clip

    def check_use(self, e, where: str, *, pack_nc: bool, lesson: dict | None = None) -> tuple[list[str], dict]:
        """Problems with one `sources` entry, and its terms {nc, sa} (what it passes on to the lesson and pack)."""
        terms = {"nc": False, "sa": False}
        if not isinstance(e, dict):
            return [f"{where}: a source must be an object {{id, item, title, url, licence, checked}}"], terms
        sid = e.get("id")
        w = f"{where} source {sid!r}"
        src = self.by_id.get(sid)
        if not src:
            return [f"{w}: not in content/sources.json (register a source before using it)"], terms
        p = []
        cls = self.effective_class(sid)
        flags = self.flags(sid)
        if cls == "AVOID":
            return [f"{w}: is AVOID and is never used"], terms
        if cls not in COPYABLE:
            p.append(f"{w}: is {cls}: nothing may be copied from it; use a link card"
                     + (" or record a permission in content/permissions/" if cls == "ASK" else ""))
        if "no_ai" in flags:
            p.append(f"{w}: is no_ai: it never goes into a pack or an AI context, only a link card")
        extra = set(e) - set(USE_KEYS)
        if extra:
            p.append(f"{w}: unknown field {sorted(extra)} (a source names the item; it holds no copied text)")
        for k in USE_REQUIRED:
            if not isinstance(e.get(k), (str, int)) or not str(e.get(k)).strip():
                p.append(f"{w}: {k} missing")
        if isinstance(e.get("url"), str) and not e["url"].startswith("https://"):
            p.append(f"{w}: url must start with https://")
        if isinstance(e.get("checked"), str) and not _DATE.match(e["checked"]):
            p.append(f"{w}: checked must be the date its licence was confirmed, YYYY-MM-DD")
        if "changes" in e and not (isinstance(e["changes"], (str, dict))):
            p.append(f"{w}: changes must be text or {{\"prs\": ..., \"ps\": ..., \"en\": ...}}")
        if "fields" in e and not (isinstance(e["fields"], dict) and all(isinstance(v, str) for v in e["fields"].values())):
            p.append(f"{w}: fields must be names and texts for the credit line")
        t = item_terms(e.get("licence", ""))
        if "per_item_licence" in flags and cls in COPYABLE and not t["open"]:
            p.append(f"{w}: the item's own licence ({e.get('licence')!r}) does not allow copying; link to it instead")
        if sid in NO_SHARE_ALIKE and t["sa"]:
            p.append(f"{w}: share-alike is refused here ({NO_SHARE_ALIKE[sid]})")
        nc = cls == "BUNDLE-NC" or t["nc"]
        if nc and not pack_nc:
            p.append(f"{w}: non-commercial (NC) material goes only into packs marked \"licence\": \"NC\"")
        if t["nd"] and _has_text(e.get("changes")):
            p.append(f"{w}: its licence (ND) allows no changes or translations")
        if "verbatim" in flags:
            if _has_text(e.get("changes")):
                p.append(f"{w}: is verbatim: nothing may be changed, so it has no changes")
            if not isinstance(e.get("sha256"), str) or not _SHA.match(e["sha256"]) or not e.get("field"):
                p.append(f"{w}: is verbatim: give field (where the text is, like steps.0.text.ar) and sha256 of the "
                         "source's text")
            elif lesson is not None:
                got = at_path(lesson, e["field"])
                if not isinstance(got, str):
                    p.append(f"{w}: no text at {e['field']}")
                elif sha256_text(got) != e["sha256"]:
                    p.append(f"{w}: the text at {e['field']} does not match its source (verbatim, by hash)")
        missing = self.missing_placeholders(e)
        if missing:
            p.append(f"{w}: the credit line needs {', '.join(missing)}")
        terms = {"nc": nc, "sa": t["sa"]}
        return p, terms

    def missing_placeholders(self, e) -> list[str]:
        src = self.by_id.get(e.get("id")) or {}
        have = self._fill_values(e)
        return [f"{{{k}}}" for k in _PLACEHOLDER.findall(src.get("attribution", "")) if not have.get(k)]

    @staticmethod
    def _fill_values(e) -> dict:
        v = {"title": e.get("title"), "item title": e.get("title"), "author": e.get("author"),
             "licence": e.get("licence"), "book": e.get("title")}
        v.update(e.get("fields") or {})
        return {k: str(x) for k, x in v.items() if x}

    def credit_line(self, e) -> str:
        """The source's own attribution with the item's details filled in (exact_attribution: the owner's words)."""
        src = self.by_id.get(e.get("id")) or {}
        vals = self._fill_values(e)
        return _PLACEHOLDER.sub(lambda m: vals.get(m.group(1), m.group(0)), src.get("attribution", ""))

    # link cards

    def check_card(self, c, where: str) -> list[str]:
        if not isinstance(c, dict):
            return [f"{where}: a link card must be an object"]
        w = f"{where} {c.get('id', '?')}"
        p = []
        if not isinstance(c.get("id"), str) or not _ID.match(c["id"]):
            p.append(f"{w}: id must be lower-case letters, digits and dashes")
        extra = set(c) - set(CARD_KEYS)
        if extra:
            p.append(f"{w}: a link card holds no copied text: unknown field {sorted(extra)} "
                     f"(allowed: {', '.join(CARD_KEYS)})")
        sid = c.get("source")
        if sid not in self.by_id:
            p.append(f"{w}: source {sid!r} is not in content/sources.json")
        elif self.by_id[sid]["class"] == "AVOID":
            p.append(f"{w}: source {sid} is AVOID and is never used, not even as a link")
        if not _has_text(c.get("title")):
            p.append(f"{w}: title missing")
        for t in _texts(c.get("title")):
            if len(t) > CARD_TITLE_MAX:
                p.append(f"{w}: title longer than {CARD_TITLE_MAX} characters")
        if not isinstance(c.get("about"), dict) or not _has_text(c.get("about")):
            p.append(f"{w}: about must be our own words, {{\"prs\": ..., \"ps\": ...}}")
        else:
            for lang, t in c["about"].items():
                if lang not in ("prs", "ps", "en"):
                    p.append(f"{w}: about has an unknown language {lang}")
                elif not isinstance(t, str) or len(t) > CARD_ABOUT_MAX:
                    p.append(f"{w}: about ({lang}) must be our own words, at most {CARD_ABOUT_MAX} characters")
        if not isinstance(c.get("url"), str) or not c["url"].startswith("https://"):
            p.append(f"{w}: url must start with https://")
        if "years" in c and not (isinstance(c["years"], list)
                                 and all(isinstance(y, int) and 0 <= y <= 12 for y in c["years"])):
            p.append(f"{w}: years must be a list of years 0 to 12")
        if "lessons" in c and not (isinstance(c["lessons"], list) and all(isinstance(x, str) for x in c["lessons"])):
            p.append(f"{w}: lessons must be a list of lesson ids")
        for t in _texts(c.get("title")) + _texts(c.get("about")) + _texts(c.get("who")):
            if bad := promises(t):
                p.append(f"{w}: promises what no one can promise ({', '.join(bad)}): say what the page offers")
        if c.get("subject") == "university" or any(k in c for k in UNI_FIELDS):
            p += self._check_uni_card(c, w)
        return p

    def _check_uni_card(self, c, w: str) -> list[str]:
        """A university card's own fields (P28, C4.6)."""
        p = []
        for k in UNI_FIELDS:
            if k not in c:
                p.append(f"{w}: a university card needs {k}")
        if "kind" in c and c["kind"] not in CARD_KINDS:
            p.append(f"{w}: kind must be one of {', '.join(CARD_KINDS)}")
        if "cost" in c and c["cost"] not in CARD_COSTS:
            p.append(f"{w}: cost must be one of {', '.join(CARD_COSTS)}")
        if "who" in c:
            if not isinstance(c["who"], dict) or not _has_text(c["who"]):
                p.append(f"{w}: who says who may apply, {{\"prs\": ..., \"ps\": ...}}")
            else:
                for lang, t in c["who"].items():
                    if lang not in ("prs", "ps", "en") or not isinstance(t, str) or len(t) > CARD_ABOUT_MAX:
                        p.append(f"{w}: who ({lang}) must be our own words, at most {CARD_ABOUT_MAX} characters")
        ok = True
        for k in ("checked", "review_by"):
            if k in c and not (isinstance(c[k], str) and _DATE.match(c[k])):
                p.append(f"{w}: {k} must be a date, YYYY-MM-DD")
                ok = False
        if ok and "checked" in c and "review_by" in c:
            if c["review_by"] <= c["checked"]:
                p.append(f"{w}: review_by comes after checked")
            elif c["review_by"] > add_months(c["checked"], CARD_MONTHS):
                p.append(f"{w}: review_by is at most {CARD_MONTHS} months after checked "
                         f"({add_months(c['checked'], CARD_MONTHS)})")
        src = self.by_id.get(c.get("source"))
        if src and self.effective_class(c["source"]) not in UNI_SOURCE_CLASSES:
            p.append(f"{w}: a university card's source must be LINK or better, not {src['class']}")
        needs = (c.get("review") or {}).get("needs") or [] if isinstance(c.get("review"), dict) else []
        for role in ("adviser", "Dari reader", "Pashto reader"):
            if role not in needs:
                p.append(f"{w}: a university card's review must include an {role}" if role == "adviser"
                         else f"{w}: a university card's review must include a {role}")
        return p
