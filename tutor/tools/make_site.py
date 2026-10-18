"""Qalam's website (docs/WEBSITE.md): the pages rendered from site/templates and site/strings, linted, and the
headers their Content-Security-Policy needs. Python, no dependencies.

    python3 tools/make_site.py [OUT]     render into OUT (default site/build), lint, print the sizes; exit 1 on a problem

One language per page: Dari at the root, Pashto under /ps/, English under /en/. Every page is one request: its CSS,
its script, its pictures (inline SVG) and its icon are in the page; no web font, no <img>, no other host. A string is
filled into an empty element that names it (`<h1 data-t="home.h1"></h1>`, the attribute then dropped), into an
attribute as `{{site.hear}}` (escaped, tags stripped), and a computed value as `{{=name}}`. Inside a string,
{app_mb} and {apk_mb} are the price tags, worked out here from the real files (WEBSITE.md 1.3: families buy data in
small bundles): the app's first open is every file its service worker keeps, compressed (gzip here; the site check
measures brotli and allows 15%); the Android app is the released APK's own size (app/get/apk.json), and its tag is
left out until there is one.

The lint (WEBSITE.md 2.9) refuses photos and <img>, faces, a person's title or name, places below the province, phone
numbers, maps, embeds, forms, share buttons, other hosts, web fonts, inline style or event attributes (the CSP allows
neither), "girls" in a title, heading or address, a middle dot touching a Persian digit (the P10 rule), a string
missing in any language, and a link to a page that does not exist or is not planned.

worker/build.py uses assemble() and the hub site_root() (W2); tools/site_check.mjs checks the pages in a browser.
"""
import ast
import base64
import gzip
import hashlib
import html
import json
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

TUTOR = Path(__file__).resolve().parents[1]
SITE = TUTOR / "site"
APP = TUTOR / "app"
LANGS = ("prs", "ps", "en")
PREFIX = {"prs": "/", "ps": "/ps/", "en": "/en/"}
HTML_LANG = {"prs": "fa-AF", "ps": "ps-AF", "en": "en"}
LANG_NAMES = {"prs": "دری", "ps": "پښتو", "en": "English"}
FA = str.maketrans("0123456789.", "۰۱۲۳۴۵۶۷۸۹٫")
EXAMPLE_CODE = "4821 7590 3661 2043"          # the home's example bag code: 16 digits, its Damm check digit valid
DAMM = ("0317598642", "7092154863", "4206871359", "1750983426", "6123045978",
        "3674209581", "5869720134", "8945362017", "9438617205", "2581436790")   # app/js/sheetcode.js


@dataclass(frozen=True)
class Page:
    id: str
    path: str                        # under the language's prefix: "" is the home
    template: str
    css: tuple = ("base", "page")
    forward: str = ""                # a script first in the head: "forward.js" (the homes), "lang.js" (/get/)
    skip: str = "main"               # where "skip" leads
    read: str = ".ph"                # what the header's speaker reads
    multi: bool = False              # one file in all three languages, at the root only (/offline/, the 404 page)
    shell: str = "page.html"         # tiny.html: the small pages (at most 4 KB), with no header, footer or site.js
    js: str = "site.js"              # the page's one script at the end of the body ("" for none)
    noindex: bool = False


def page_file(page: Page, lang: str) -> str:
    """Where a page's file sits in the tree: a folder's index.html, or name.html for an address without a slash
    (/m, served at /m by Workers static assets and by the hub; /404, the not-found page both send)."""
    url = page_url(page, lang).lstrip("/")
    return url + "index.html" if url == "" or url.endswith("/") else url + ".html"


PAGES = (
    Page("home", "", "home.html", css=("base", "home"), forward="forward.js", skip="doors", read="#hero .ht,#dh"),
    Page("families", "families/", "families.html"),
    Page("teachers", "teachers/", "teachers.html"),
    Page("partners", "partners/", "partners.html"),
    Page("lessons", "lessons/", "lessons.html"),
    Page("credits", "credits/", "credits.html"),
    Page("get", "get/", "get.html", forward="lang.js"),
    Page("privacy", "privacy/", "privacy.html"),
    Page("offline", "offline/", "offline.html", css=("tiny",), multi=True, shell="tiny.html", js="tiny.js"),
    Page("m", "m", "m.html", css=("tiny",), multi=True, shell="tiny.html", js="", forward="m.js", noindex=True),
    Page("notfound", "404", "notfound.html", css=("tiny",), multi=True, shell="tiny.html", js=""),
)
# pages the ruling names that a later phase builds: a link to one is allowed before it exists
PLANNED: tuple = ()
# the app's own addresses, which the site may link to (WEBSITE.md 2.1); /get/'s APK file sits beside its page
APP_LINKS = re.compile(r"^/(app/|get/qalam-[0-9.]+\.apk$|teacher/|admin/|review/|manifest\.webmanifest$)")
# the example codes and the hub's address, put into a string as {class_code} and {hub_addr}: Latin, left to right
EXAMPLE_CLASS = "K7QM-4PRT"
HUB_ADDR = "10.42.0.1"
# partners' email address (WEBSITE.md 2.1: an address, no form); none until Qalam's own domain exists
CONTACT: str | None = None

# the lint's lists (WEBSITE.md 2.9); kept short and plain so a reviewer can extend them
GIRLS = re.compile(r"\bgirls?\b|دختر|نجلۍ|نجونې|انجونې", re.I)
PLACES_BELOW_PROVINCE = ("mazar", "مزار", "dehdadi", "دهدادی", "nahr-e shahi", "نهر شاهی", "balkh city")
TITLES = re.compile(r"\b(Mr|Mrs|Ms|Miss|Dr)\.?\s+[A-Z]|آقای\s|خانم\s\S|ښاغلی\s|میرمن\s")
FACES = re.compile("[\U0001F600-\U0001F64F\U0001F466-\U0001F487\U0001F9D1-\U0001F9DD\U0001F930-\U0001F93E]")
PHONE = re.compile(r"(\+|\b00)\d{2}[\s-]?\d{2,}|\b07\d[\s-]?\d{3}[\s-]?\d{4}\b")
SHARE_MAPS = re.compile(r"maps\.google|google\.[a-z.]+/maps|openstreetmap|wa\.me|whatsapp|facebook\.com|twitter\.com|"
                        r"x\.com/intent|t\.me/|telegram\.me|navigator\.share|linkedin\.com/share", re.I)
FORBIDDEN_TAGS = re.compile(r"<(img|picture|iframe|embed|object|video|form|input|textarea|select|link\s+rel=\"?stylesheet)\b", re.I)
MIDDLE_DOT = re.compile(r"[۰-۹][\s‌‏]*·|·[\s‌‏]*[۰-۹]")


class SiteError(Exception):
    pass


def damm(digits: str) -> int:
    i = 0
    for d in digits:
        i = int(DAMM[i][int(d)])
    return i


def num(n, lang: str) -> str:
    return str(n) if lang == "en" else str(n).translate(FA)


def strings() -> dict[str, dict]:
    out = {lang: json.loads((SITE / "strings" / f"{lang}.json").read_text(encoding="utf-8")) for lang in LANGS}
    keys = {lang: {k for k in d if not k.startswith("_")} for lang, d in out.items()}
    problems = []
    for lang in LANGS:
        for other in LANGS:
            for k in sorted(keys[other] - keys[lang]):
                problems.append(f"site/strings/{lang}.json lacks {k} (in {other})")
        for k in sorted(keys[lang]):
            if not isinstance(out[lang][k], str) or not out[lang][k].strip():
                problems.append(f"site/strings/{lang}.json: {k} is empty")
    if problems:
        raise SiteError("\n".join(sorted(set(problems))))
    return out


def shell_files(app: Path = APP) -> list[Path]:
    """The files the app's service worker keeps on her first open (its SHELL list)."""
    src = (app / "sw.js").read_text(encoding="utf-8")
    m = re.search(r"const SHELL = \[(.*?)\];", src, re.S)
    out = []
    for p in re.findall(r"'([^']+)'", m.group(1) if m else ""):
        if p in ("./", "/app/"):
            p = "index.html"
        f = app / p.lstrip("/") if not p.startswith("/audio/") else app / "audio" / p[len("/audio/"):]
        out.append(f)
    return out


def app_bytes(app: Path = APP) -> int:
    """The app's first open, as a server sends it compressed (gzip at its best; brotli is a little smaller)."""
    return sum(len(gzip.compress(f.read_bytes(), 9, mtime=0)) for f in shell_files(app) if f.is_file())


def apk_bytes(app: Path = APP) -> int | None:
    try:
        size = int(json.loads((app / "get" / "apk.json").read_text(encoding="utf-8")).get("size") or 0)
    except (OSError, ValueError, AttributeError):
        return None
    return size or None


def mb(n: int, lang: str) -> str:
    """A price tag: tenths of a MB, or to the nearest 0.05 under 1 MB (the trimmed first open is "0.45 MB", where
    tenths would say 0.5 and miss the real size by more than the check allows)."""
    v = n / 1e6
    if v < 0.095:
        return num("0.1", lang)
    if v < 1:
        v = round(v * 20) / 20
        return num(f"{v:.2f}" if round(v * 100) % 10 else f"{v:.1f}", lang)
    return num(f"{v:.1f}", lang)


def aliases() -> list[dict]:
    """The alias pictures, as the app draws them (app/js/aliases.js) with content/aliases.json's words."""
    words = {p["id"]: p["name"] for p in json.loads((TUTOR / "content" / "aliases.json").read_text(encoding="utf-8"))["pictures"]}
    src = (APP / "js" / "aliases.js").read_text(encoding="utf-8")
    out = []
    for m in re.finditer(r"\{ id: '(\w+)', name: \{[^}]*\},\s*d: ((?:'[^']*'\s*\+?\s*)+)\}", src):
        d = "".join(re.findall(r"'([^']*)'", m.group(2)))
        out.append({"id": m.group(1), "name": words[m.group(1)], "d": d})
    if [a["id"] for a in out] != list(words):
        raise SiteError("app/js/aliases.js and content/aliases.json list different pictures")
    return out


def consent_texts() -> dict[str, dict]:
    """The consent texts in force (learners.CONSENT_VERSIONS), {home: {lang: text}}."""
    src = (TUTOR / "hub" / "tutor_hub" / "learners.py").read_text(encoding="utf-8")
    versions = ast.literal_eval(re.search(r"^CONSENT_VERSIONS = (\{[^}]*\})", src, re.M).group(1))
    return {home: {lang: json.loads((TUTOR / "content" / "consent" / lang / f"{v}.json").read_text(encoding="utf-8"))
                   for lang in LANGS} for home, v in versions.items()}


def esc(s: str) -> str:
    return html.escape(re.sub(r"<[^>]+>", "", s), quote=True)


def minify_css(css: str) -> str:
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    css = re.sub(r"\s*\n\s*", "", css)
    return re.sub(r"\s*([{};])\s*", r"\1", css).strip()


def minify_js(js: str) -> str:
    js = re.sub(r"^\s*/\*.*?\*/\s*", "", js, flags=re.S)
    return "\n".join(line.strip() for line in js.splitlines() if line.strip())


def symbols() -> dict[str, str]:
    """The sprite's icons (24-unit line art in the app's icon style), and the alias pictures as a-<id>."""
    src = (SITE / "templates" / "icons.svg").read_text(encoding="utf-8")
    out = {m.group(1): m.group(0) for m in re.finditer(r'<symbol id="([\w-]+)"[^>]*>.*?</symbol>', src, re.S)}
    for a in aliases():
        out["a-" + a["id"]] = f'<symbol id="a-{a["id"]}" viewBox="0 0 24 24">{a["d"]}</symbol>'
    return out


def sprite(body: str, every_alias: bool) -> str:
    syms = symbols()
    used = set(re.findall(r'href="#([\w-]+)"', body)) | {"s"}
    if every_alias:
        used |= {k for k in syms if k.startswith("a-")}
    missing = sorted(u for u in used if u not in syms)
    if missing:
        raise SiteError(f"icons used but not drawn: {', '.join(missing)}")
    picked = "".join(syms[k] for k in sorted(used) if k in syms)
    return f'<svg class="sprite" width="0" height="0" aria-hidden="true">{picked}</svg>'


def fill(tpl: str, S: dict, V: dict, where: str) -> str:
    """{{=var}} first, then empty elements named by data-t, then {{key}} in attributes."""
    def var(m):
        if m.group(1) not in V:
            raise SiteError(f"{where}: no value for {{{{={m.group(1)}}}}}")
        return str(V[m.group(1)])
    out = re.sub(r"\{\{=(\w+)\}\}", var, tpl)

    def text(m):
        tag, before, key, after, inner = m.groups()
        if key not in S:
            raise SiteError(f"{where}: no string {key}")
        if inner.strip():
            raise SiteError(f"{where}: <{tag} data-t=\"{key}\"> is not empty")
        return f"<{tag}{before}{after}>{S[key]}</{tag}>"
    out = re.sub(r'<(\w+)([^>]*?)\sdata-t="([\w.]+)"([^>]*)>(.*?)</\1>', text, out, flags=re.S)

    def attr(m):
        if m.group(1) not in S:
            raise SiteError(f"{where}: no string {m.group(1)}")
        return esc(S[m.group(1)])
    out = re.sub(r"\{\{([\w.]+)\}\}", attr, out)
    if "data-t=" in out or "{{" in out:
        raise SiteError(f"{where}: a data-t or {{{{ was left unfilled")
    return out


def page_url(page: Page, lang: str) -> str:
    return PREFIX[lang] + page.path


def home_url(lang: str) -> str:
    return PREFIX[lang] + "?site"


def tiles(lang: str, S: dict, years, cls) -> str:
    return "".join(f'<a class="tile {cls(y)}" href="/app/?year={y}&amp;lang={lang}" '
                   f'aria-label="{esc(S["site.year_label"].replace("{n}", num(y, lang)))}">{num(y, lang)}</a>' for y in years)


def consent_html(lang: str, S: dict) -> str:
    out = []
    for home, label in (("hub", "privacy.consent_hub"), ("online", "privacy.consent_online")):
        t = consent_texts()[home][lang]
        rows = "".join(f"<p>{html.escape(t['full'][i])}</p>" for i in range(len(t["full"])))
        out.append(f'<div class="ct"><h3>{S[label]}</h3><p class="ver">{S["site.version"]} '
                   f'<bdi dir="ltr">{html.escape(t["version"])}</bdi>{"" if not t.get("draft") else ", " + S["site.draft"]}</p>{rows}</div>')
    return "".join(out)


def localise(raw: dict, lang: str, sizes: dict) -> dict:
    S = {}
    for k, v in raw.items():
        if k.startswith("_"):
            continue
        S[k] = v.replace("{app_mb}", mb(sizes["app"], lang)).replace(
            "{apk_mb}", mb(sizes["apk"], lang) if sizes.get("apk") else "{apk_mb}").replace(
            "{class_code}", f'<span class="m">{EXAMPLE_CLASS}</span>').replace(
            "{hub_addr}", f'<span class="m">{HUB_ADDR}</span>')
    return S


def card(cid: str, title: str, body: str, S: dict) -> str:
    """A reading page's section: its heading, a speaker that reads it, its body."""
    return (f'<section class="card" id="{cid}" data-area aria-labelledby="h-{cid}"><div class="sh"><h2 id="h-{cid}">'
            f'{title}</h2><button class="spk" type="button" data-read="" aria-label="{esc(S["site.hear"])}"><svg class="i">'
            f'<use href="#s"/></svg></button></div>{body}</section>')


def credits_html(lang: str, S: dict, app: Path) -> str:
    """/credits/ (W3): the fonts, sounds, code and voices of app/credits.json, names and licences as their owners
    write them (left to right); a project's address is shown as text, never as a link to another site."""
    c = json.loads((app / "credits.json").read_text(encoding="utf-8"))
    out = []
    for key, title in (("fonts", "credits.fonts_h"), ("sounds", "credits.sounds_h"), ("code", "credits.code_h")):
        items = c.get(key) or []
        if not items:
            continue
        rows = "".join(
            f'<li><b dir="ltr" lang="en">{html.escape(i["name"])}</b><span dir="ltr" lang="en">{html.escape(i.get("owner") or "")}</span>'
            f'<span>{S["credits.licence"]}: <bdi dir="ltr" lang="en">{html.escape(i.get("licence") or "")}</bdi></span>'
            + (f'<span class="u" dir="ltr" lang="en">{html.escape(re.sub(r"^https?://", "", i["url"]))}</span>' if i.get("url") else "")
            + "</li>" for i in items)
        out.append(card(key, S[title], f'<ul class="cr">{rows}</ul>', S))
    voices = [v["credit"] for v in (c.get("voices") or {}).values() if isinstance(v, dict) and v.get("credit")]
    body = ("".join(f'<p dir="ltr" lang="en">{html.escape(str(v))}</p>' for v in voices) if voices
            else f'<p>{S["credits.voices_none"]}</p>')
    out.append(card("voices", S["credits.voices_h"], body, S))
    return "".join(out)


def library(release: bool):
    """The hub's own reading of the packs (tutor_hub.packs.Library), so the catalogue lists what the hub serves."""
    sys.path.insert(0, str(TUTOR / "hub"))
    from tutor_hub.packs import Library, tracks_of
    return Library(TUTOR / "content" / "packs", release=release), tracks_of


YEAR_OF_BAND = {"ey": 0, "p1": 1, "p2": 4, "s1": 7, "s2": 10}


def catalogue_html(lang: str, S: dict, release: bool) -> str:
    """/lessons/ (W3): every lesson the server serves, by year, then the lessons for older learners and adults; each
    opens /app/ at that lesson through the app's door (?year= or ?track=). A draft says so."""
    lib, tracks_of = library(release)
    groups: dict[tuple, list] = {}
    for lid, l in lib.lessons.items():
        pack = lib.packs[lib.lesson_pack[lid]]
        state = lib.states.get(lid, "draft")
        if release and state != "signed":
            continue
        if pack.get("audience") == "adult":
            tr = tracks_of(pack)
            key, door = (2, 0), "track=" + ("literacy" if "literacy" in tr else "reader")
        elif pack.get("bands"):
            kids = [b for b in pack["bands"] if b in YEAR_OF_BAND]
            key = (1, 0)
            door = f"year={YEAR_OF_BAND[kids[0]]}" if kids else "track=reader"
        else:
            key, door = (0, int(l.get("year") or 0)), f"year={int(l.get('year') or 0)}"
        groups.setdefault(key, []).append((l.get("order", 0), lid, l, door, state))
    if not groups:
        return f'<section class="card" data-area><p>{S["lessons.none"]}</p></section>'
    out, drafts = [], False
    for key in sorted(groups):
        kind, year = key
        title = (S["lessons.adults_h"] if kind == 2 else S["lessons.more_h"] if kind == 1
                 else S["home.not_in_school"] if year == 0 else S["site.year_label"].replace("{n}", num(year, lang)))
        rows = []
        for _, lid, l, door, state in sorted(groups[key], key=lambda r: (r[2].get("subject", ""), r[0], r[1])):
            t = l["title"].get(lang)
            name = (f"<b>{html.escape(t)}</b>" if t else
                    f'<b lang="fa-AF" dir="rtl">{html.escape(l["title"].get("prs") or next(iter(l["title"].values())))}</b>')
            subj = S.get("lessons.s_" + str(l.get("subject")), "")
            mins = S["lessons.minutes"].replace("{n}", num(int(l.get("minutes") or 0), lang)) if l.get("minutes") else ""
            tag = f'<span class="tag">{S["lessons.draft"]}</span>' if state != "signed" else ""
            drafts = drafts or state != "signed"
            rows.append(f'<li><a class="lsn" href="/app/?{door}&amp;lang={lang}#/lesson/{html.escape(lid)}">'
                        f'<span class="sub">{subj}</span>{name}<span class="muted">{mins}</span>{tag}</a></li>')
        out.append(card(f"g{kind}-{year}", title, f'<ul class="lsns">{"".join(rows)}</ul>', S))
    if drafts:
        out.append(f'<p class="muted">{S["lessons.drafts_note"]}</p>')
    return "".join(out)


def apk_info(app: Path) -> dict | None:
    """app/get/apk.json, put there with the APK at release (docs/HOSTING.md), when it names a real file."""
    try:
        a = json.loads((app / "get" / "apk.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    ok = isinstance(a.get("file"), str) and re.fullmatch(r"qalam-[0-9.]+\.apk", a["file"]) and a.get("version")
    return a if ok else None


def get_html(lang: str, S: dict, app: Path) -> str:
    """/get/ (W3): the APK with its size and version and the three steps, or, before a release, the browser."""
    a = apk_info(app)
    if not a:
        return card("download", S["get.none_h"], f'<p>{S["get.none_p"]}</p>', S)
    steps = "".join(f'<li>{S[k]}</li>' for k in ("get.step1", "get.step2", "get.step3"))
    return card("download", S["get.download"],
                f'<span class="tag">{S["get.size"]}</span><p>{S["get.version"]} <bdi dir="ltr">{html.escape(str(a["version"]))}</bdi></p>'
                f'<p><a class="btn pri" href="/get/{a["file"]}" download><svg class="i"><use href="#dl"/></svg>'
                f'<span>{S["get.download"]}</span></a></p><h3>{S["get.steps_h"]}</h3><ol>{steps}</ol>'
                f'<h3>{S["get.check"]}</h3><p class="u" dir="ltr" lang="en">SHA-256 {html.escape(str(a.get("sha256", "")))}</p>'
                + (f'<p class="u" dir="ltr" lang="en">Certificate SHA-256 {html.escape(str(a["cert"]))}</p>' if a.get("cert") else ""), S)


def contact_html(S: dict) -> str:
    if CONTACT:
        return f'<p><a class="u" dir="ltr" href="mailto:{html.escape(CONTACT)}">{html.escape(CONTACT)}</a></p>'
    return f'<p class="muted">{S["partners.contact_soon"]}</p>'


def render_page(page: Page, lang: str, raw: dict, sizes: dict) -> tuple[str, dict]:
    S = localise(raw, lang, sizes)
    css = minify_css("".join((SITE / "css" / f"{c}.css").read_text(encoding="utf-8") for c in page.css))
    js = minify_js((SITE / "js" / page.js).read_text(encoding="utf-8")) if page.js else ""
    fwd = minify_js((SITE / "js" / page.forward).read_text(encoding="utf-8")) if page.forward else None
    pics = aliases()
    V = {"lang": lang, "root": PREFIX[lang], "home": home_url(lang)}
    if page.id == "home":
        V.update(
            tiles_primary=tiles(lang, S, range(1, 7), lambda y: f"c{y}"),
            tiles_secondary=tiles(lang, S, range(7, 13), lambda y: "o"),
            example_code=num(EXAMPLE_CODE, lang),
            apk_tag=f'<span class="tag">{S["home.way2_tag"]}</span>' if sizes.get("apk") else "",
            aliases="".join(f'<span><i class="who"><svg class="i"><use href="#a-{a["id"]}"/></svg></i><b>{html.escape(a["name"][lang])}</b></span>'
                            for a in pics if a["id"] in ("cup", "pomegranate", "mountain", "book")),
        )
    if page.id == "privacy":
        V["consents"] = consent_html(lang, S)
    if page.id == "credits":
        V["credits"] = credits_html(lang, S, sizes["app_dir"])
    if page.id == "lessons":
        V["catalogue"] = catalogue_html(lang, S, sizes.get("release", False))
    if page.id == "get":
        V["get"] = get_html(lang, S, sizes["app_dir"])
    if page.id == "partners":
        V["contact"] = contact_html(S)
    tpl = (SITE / "templates" / page.template).read_text(encoding="utf-8")
    if page.multi:                     # each language in its own block, the reader's own first (site.js)
        body = "".join(f'<div class="multi" lang="{HTML_LANG[x]}" dir="{"ltr" if x == "en" else "rtl"}" data-l="{x}">'
                       + fill(tpl, localise(RAW[x], x, sizes), {**V, "lang": x, "root": PREFIX[x], "home": home_url(x)},
                              f"{page.template} ({x})") + "</div>" for x in LANGS)
    else:
        body = fill(tpl, S, V, f"{page.template} ({lang})")
    runtime = {"no_voice": S["site.no_voice"], "install_help": S["site.install_help"], "weight": S["site.weight"],
               "year_label": S["site.year_label"]}
    if page.id == "home":
        runtime.update(someone_new=S["home.someone_new"], adults=S["home.adults"],
                       pics={a["id"]: a["name"][lang] for a in pics})
    alternates = "" if page.multi else "".join(
        f'<link rel="alternate" hreflang="{HTML_LANG[x]}" href="{page_url(page, x)}">' for x in LANGS)

    def switch(x, current=""):
        href = home_url(x) if page.id == "home" or page.multi else page_url(page, x)
        return f'<a href="{href}" data-switch="{x}" lang="{HTML_LANG[x]}"{current}>{LANG_NAMES[x]}</a>'
    langs = "".join(switch(x, ' aria-current="page"' if x == lang else "") for x in LANGS)
    foot_langs = "".join(switch(x) for x in LANGS if x != lang)
    shell = (SITE / "templates" / page.shell).read_text(encoding="utf-8")
    favicon = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' "
               "height='64' rx='14' fill='%230d7c7e'/%3E%3Cpath d='M18 46l3-10 21-21a4.2 4.2 0 0 1 6 6L27 42z' fill='none' "
               "stroke='%23fff' stroke-width='4.5' stroke-linejoin='round'/%3E%3Cpath d='M16 50h32' stroke='%23f2b134' "
               "stroke-width='4.5' stroke-linecap='round'/%3E%3C/svg%3E")
    W = {"hl": HTML_LANG[lang], "dir": "ltr" if lang == "en" else "rtl", "lang": lang,
         "forward": f"<script>{fwd}</script>\n" if fwd else "", "desc": esc(S.get(f"{page.id}.desc", "")),
         "title": html.escape(re.sub(r"<[^>]+>", "", S[f"{page.id}.title"])), "alternates": alternates, "favicon": favicon,
         "css": css, "sprite": sprite(body, page.id == "home"), "skip_to": page.skip,
         "skip": html.escape(S["home.skip" if page.id == "home" else "site.skip_main"]), "home": home_url(lang),
         "read_page": page.read, "langs": langs, "foot_langs": foot_langs, "root": PREFIX[lang],
         "draft": f'<p class="w draft">{S["site.draft"]}</p>' if raw.get("_draft") else "",
         "body": body, "runtime": json.dumps(runtime, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/"),
         "script": f"<script>{js}</script>" if js else ""}
    W["manifest"] = '<link rel="manifest" href="/manifest.webmanifest">' if page.id == "home" else ""
    out = fill(shell, S, W, f"page.html ({page.id}, {lang})")
    out = re.sub(r">\n\s*<", "><", out).replace("\n\n", "\n")
    scripts = [s for s in re.findall(r"<script>(.*?)</script>", out, re.S)]
    styles = re.findall(r"<style>(.*?)</style>", out, re.S)
    return out, {"scripts": scripts, "styles": styles}


def sha(text: str) -> str:
    return "'sha256-" + base64.b64encode(hashlib.sha256(text.encode("utf-8")).digest()).decode() + "'"


def csp(hashes: dict) -> str:
    """WEBSITE.md 2.9, extended for what the pages really do: media-src for the heading clips (W3) and
    manifest-src for the install prompt."""
    return ("default-src 'none'; script-src " + " ".join(sorted(hashes["scripts"])) + "; style-src "
            + " ".join(sorted(hashes["styles"])) + "; img-src data:; media-src 'self'; connect-src 'self'; "
            "worker-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")


def meta_csp(hashes: dict) -> str:
    """The same policy in a <meta>, for the 404 page: a <meta> cannot say frame-ancestors (the /* rule's
    frame-ancestors 'self' and nosniff still reach it)."""
    return csp(hashes).replace("; frame-ancestors 'none'", "")


SITE_HEADERS = (("Referrer-Policy", "no-referrer"),
                ("Permissions-Policy", "camera=(), microphone=(), geolocation=()"),
                ("X-Frame-Options", "DENY"))


def site_paths() -> list[str]:
    """The _headers rules that cover every site page and nothing of the app's: the Dari home and pages at the root,
    and each other language's whole folder."""
    out = ["/"]
    out += [f"/{p.path}*" if p.path.endswith("/") else f"/{p.path}" for p in PAGES if p.path and p.id != "notfound"]
    out += [f"{PREFIX[x]}*" for x in LANGS if PREFIX[x] != "/"]
    return out


def headers(hashes: dict) -> list[tuple[str, str]]:
    return [("Content-Security-Policy", csp(hashes)), *SITE_HEADERS]


def headers_file(hashes: dict) -> str:
    rule = "".join(f"  {k}: {v}\n" for k, v in headers(hashes))
    return "".join(f"{p}\n{rule}" for p in site_paths())


def lint(path: str, page: str, known: set[str]) -> list[str]:
    out = []
    text = re.sub(r"<script.*?</script>|<style>.*?</style>|<svg.*?</svg>", " ", page, flags=re.S)
    plain = html.unescape(re.sub(r"<[^>]+>", " ", text))
    for name, rx, where in (("a forbidden tag (photo, embed or form)", FORBIDDEN_TAGS, page),
                            ("a share button or map", SHARE_MAPS, page),
                            ("a face", FACES, page),
                            ("a person's title or name", TITLES, plain),
                            ("a middle dot touching a Persian digit (P10)", MIDDLE_DOT, plain)):
        if rx.search(where):
            out.append(f"{path}: {name}: {rx.search(where).group(0)!r}")
    if PHONE.search(re.sub(r'<span class="code m">.*?</span>', "", page).translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789"))):
        out.append(f"{path}: a phone number")
    low = plain.lower()
    for place in PLACES_BELOW_PROVINCE:
        if place in low:
            out.append(f"{path}: a place below the province: {place}")
    if re.search(r"@font-face|@import", page):
        out.append(f"{path}: a web font or an imported stylesheet")
    if re.search(r"\sstyle=|\son[a-z]+=", page):
        out.append(f"{path}: an inline style or event attribute (the CSP allows neither)")
    for m in re.finditer(r'(?:href|src|action)="([^"]*)"', page):
        u = m.group(1)
        if re.match(r"^(https?:)?//", u):
            out.append(f"{path}: a link to another host: {u}")
        elif u.startswith("/") and not APP_LINKS.match(u):
            target = u.split("#", 1)[0].split("?", 1)[0]
            if target not in known and not any(target.endswith(p) for p in PLANNED):
                out.append(f"{path}: a link to a page that does not exist: {u}")
    ids = re.findall(r'\sid="([^"]+)"', page)
    for twice in sorted({i for i in ids if ids.count(i) > 1}):
        out.append(f"{path}: the id {twice!r} is used twice (an icon's id and an anchor must differ)")
    if re.search(r"\{(app_mb|apk_mb|class_code|hub_addr|n)\}", re.sub(r"<script\b.*?</script>", "", page, flags=re.S)):
        out.append(f"{path}: a size or code placeholder was left in the words")
    heads = " ".join(re.findall(r"<(?:title|h1|h2|h3)\b[^>]*>(.*?)</(?:title|h1|h2|h3)>", page, re.S))
    if GIRLS.search(heads) or GIRLS.search(path):
        out.append(f"{path}: \"girls\" in a title, heading or address (the quiet profile)")
    return out


RAW: dict = {}


def render(out: Path, app: Path = APP, *, report_file: bool = True, release: bool = False) -> dict:
    """Every page in every language into `out` (index.html files, or name.html: page_file), plus site-report.json;
    returns the report. `release`: the catalogue lists only signed lessons, as a release server serves. Raises
    SiteError with every problem found."""
    raw = strings()
    RAW.update(raw)
    if damm(EXAMPLE_CODE.replace(" ", "")) != 0:
        raise SiteError("the example bag code's check digit is wrong")
    sizes = {"app": app_bytes(app), "apk": apk_bytes(app), "app_dir": app, "release": release}
    pages, hashes, problems = [], {"scripts": set(), "styles": set()}, []
    known = {page_url(p, x) for p in PAGES for x in LANGS}
    for p in PAGES:
        for lang in (("prs",) if p.multi else LANGS):
            doc, inline = render_page(p, lang, raw[lang], sizes)
            hashes["scripts"] |= {sha(s) for s in inline["scripts"]}
            hashes["styles"] |= {sha(s) for s in inline["styles"]}
            if p.id == "notfound":       # served at any address no file answers, where no _headers rule names it
                own = {"scripts": {sha(x) for x in inline["scripts"]}, "styles": {sha(x) for x in inline["styles"]}}
                doc = doc.replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta http-equiv="Content-Security-'
                                  f'Policy" content="{meta_csp(own)}">', 1)
            url = page_url(p, lang)
            problems += lint(url, doc, known)
            f = out / page_file(p, lang)
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(doc, encoding="utf-8")
            pages.append({"url": url, "page": p.id, "lang": lang, "file": str(f.relative_to(out)),
                          "bytes": len(doc.encode("utf-8")), "multi": p.multi})
    if problems:
        raise SiteError("\n".join(problems))
    report = {"pages": pages, "app_gzip": sizes["app"], "apk": sizes["apk"],
              "app_shell": [str(f.relative_to(app)) for f in shell_files(app)],
              "csp": csp(hashes), "headers": headers_file(hashes),
              "hashes": {k: sorted(v) for k, v in hashes.items()}, "draft": {x: bool(raw[x].get("_draft")) for x in LANGS},
              "version": hashlib.sha256("".join(sorted(p["file"] + str(p["bytes"]) for p in pages)).encode()
                                        + "".join(sorted(hashes["scripts"] | hashes["styles"])).encode()).hexdigest()[:12]}
    if report_file:
        (out / "site-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    return report


# the app's own folders that keep their root address after the move (WEBSITE.md 2.2): staff pages and /get/
MOVED = ("teacher", "admin", "review")
# app/get/ holds only what a release puts there (the APK and apk.json, docs/HOSTING.md): served beside /get/'s page
GET_FILES = re.compile(r"^(apk\.json|qalam-[0-9.]+\.apk)$")
MANIFEST = {"name": "Qalam", "short_name": "Qalam", "start_url": "/app/", "scope": "/", "display": "standalone",
            "background_color": "#ffffff", "theme_color": "#0d7c7e",
            "icons": [{"src": "/app/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any"}]}


def rewrite(text: str) -> str:
    """A staff page or /get/ at its root address: every ../ (the icon, app.css, the page's script, get.js's
    imports and its link back to the app) now points into /app/."""
    return text.replace("../", "/app/")


def site_worker(version: str) -> str:
    return (SITE / "js" / "sw.js").read_text(encoding="utf-8").replace("__VERSION__", version)


def site_root(public: Path, app: Path = APP, *, release: bool = False) -> dict:
    """What sits at the root and is the site's own: the pages, the site's worker at /sw.js and the manifest. The hub
    (tutor_hub/sitetree.py) serves this folder at / and the rest of the tree from app/ itself."""
    report = render(public, app, report_file=False, release=release)
    (public / "sw.js").write_text(site_worker(report["version"]), encoding="utf-8")
    (public / "manifest.webmanifest").write_text(json.dumps(MANIFEST, indent=1), encoding="utf-8")
    return report


def assemble(public: Path, app: Path = APP, *, release: bool = False) -> dict:
    """The whole tree the Worker serves (WEBSITE.md 2.2): site_root(), the app at /app/ (without its tests, voice
    clips and the moved folders), the clips at /audio/, the staff pages and /get/ at their old addresses with ../
    rewritten, and the APK files of app/get/ beside /get/'s page. Returns render()'s report."""
    report = site_root(public, app, release=release)
    skip = set(MOVED) | {"tests", "audio", "get"}

    def ignore(folder, names):
        return [n for n in names if n in ("__pycache__", ".DS_Store") or (Path(folder) == app and n in skip)]
    shutil.copytree(app, public / "app", ignore=ignore)
    if (app / "audio").is_dir():
        shutil.copytree(app / "audio", public / "audio", ignore=shutil.ignore_patterns("__pycache__", ".DS_Store"))
    for d in MOVED:
        if not (app / d).is_dir():
            continue
        shutil.copytree(app / d, public / d, ignore=shutil.ignore_patterns("__pycache__", ".DS_Store"))
        for f in (public / d).rglob("*"):
            if f.suffix in (".html", ".js"):
                f.write_text(rewrite(f.read_text(encoding="utf-8")), encoding="utf-8")
    for f in sorted((app / "get").glob("*")) if (app / "get").is_dir() else []:
        if GET_FILES.match(f.name):
            shutil.copy2(f, public / "get" / f.name)
    return report


if __name__ == "__main__":
    tree = "--tree" in sys.argv          # the whole tree as the Worker serves it (the site, /app/, staff pages)
    argv = [a for a in sys.argv[1:] if a != "--tree"]
    target = Path(argv[0]) if argv else SITE / "build"
    if (target / "site-report.json").is_file() or (target / "index.html").is_file():
        shutil.rmtree(target)                # a site rendered here before, and nothing else
    elif target.exists() and any(target.iterdir()):
        sys.exit(f"make_site: {target} is not empty and holds no site")
    try:
        rep = assemble(target) if tree else render(target)
        if tree:
            (target / "site-report.json").write_text(json.dumps(rep, ensure_ascii=False, indent=1), encoding="utf-8")
    except SiteError as e:
        print(f"make_site: {e}", file=sys.stderr)
        sys.exit(1)
    (target / "_headers").write_text(rep["headers"], encoding="utf-8")
    for p in rep["pages"]:
        raw = (target / p["file"]).read_bytes()
        print(f"{p['url']:<16} {p['lang']:<4} {len(raw) / 1024:6.1f} KB raw, {len(gzip.compress(raw, 9)) / 1024:5.1f} KB gzip")
    print(f"the app's first open: {rep['app_gzip'] / 1e6:.2f} MB (gzip); the APK: "
          f"{rep['apk'] / 1e6:.2f} MB" if rep["apk"] else f"the app's first open: {rep['app_gzip'] / 1e6:.2f} MB (gzip); no APK released yet")
