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

worker/build.py and the hub (W2) use render() and headers(); tools/site_check.mjs checks the pages in a browser.
"""
import ast
import base64
import gzip
import hashlib
import html
import json
import re
import sys
from dataclasses import dataclass, field
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
    forward: bool = False            # the homes: the forward script first in the head
    skip: str = "main"               # where "skip" leads
    read: str = ".ph"                # what the header's speaker reads
    extra: dict = field(default_factory=dict)


PAGES = (
    Page("home", "", "home.html", css=("base", "home"), forward=True, skip="doors", read="#hero .ht,#dh"),
    Page("privacy", "privacy/", "privacy.html"),
)
# pages the ruling names that later phases build (W3): a link to one is allowed before it exists
PLANNED = ("families/", "teachers/", "partners/", "credits/", "lessons/")
# the app's own addresses, which the site may link to (WEBSITE.md 2.1)
APP_LINKS = re.compile(r"^/(app/|get/|teacher/|admin/|review/|m(?:$|#))")

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
    v = n / 1e6
    return num(f"{v:.1f}" if v >= 0.095 else "0.1", lang)


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
            "{apk_mb}", mb(sizes["apk"], lang) if sizes.get("apk") else "{apk_mb}")
    return S


def render_page(page: Page, lang: str, raw: dict, sizes: dict) -> tuple[str, dict]:
    S = localise(raw, lang, sizes)
    css = minify_css("".join((SITE / "css" / f"{c}.css").read_text(encoding="utf-8") for c in page.css))
    js = minify_js((SITE / "js" / "site.js").read_text(encoding="utf-8"))
    fwd = minify_js((SITE / "js" / "forward.js").read_text(encoding="utf-8")) if page.forward else None
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
    body = fill((SITE / "templates" / page.template).read_text(encoding="utf-8"), S, V, f"{page.template} ({lang})")
    runtime = {"no_voice": S["site.no_voice"], "install_help": S["site.install_help"], "weight": S["site.weight"],
               "year_label": S["site.year_label"]}
    if page.id == "home":
        runtime.update(someone_new=S["home.someone_new"], adults=S["home.adults"],
                       pics={a["id"]: a["name"][lang] for a in pics})
    alternates = "".join(f'<link rel="alternate" hreflang="{HTML_LANG[x]}" href="{page_url(page, x)}">' for x in LANGS)
    def switch(x, current=""):
        href = home_url(x) if page.id == "home" else page_url(page, x)
        return f'<a href="{href}" data-switch="{x}" lang="{HTML_LANG[x]}"{current}>{LANG_NAMES[x]}</a>'
    langs = "".join(switch(x, ' aria-current="page"' if x == lang else "") for x in LANGS)
    foot_langs = "".join(switch(x) for x in LANGS if x != lang)
    shell = (SITE / "templates" / "page.html").read_text(encoding="utf-8")
    favicon = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' "
               "height='64' rx='14' fill='%230d7c7e'/%3E%3Cpath d='M18 46l3-10 21-21a4.2 4.2 0 0 1 6 6L27 42z' fill='none' "
               "stroke='%23fff' stroke-width='4.5' stroke-linejoin='round'/%3E%3Cpath d='M16 50h32' stroke='%23f2b134' "
               "stroke-width='4.5' stroke-linecap='round'/%3E%3C/svg%3E")
    W = {"hl": HTML_LANG[lang], "dir": "ltr" if lang == "en" else "rtl", "lang": lang,
         "forward": f"<script>{fwd}</script>\n" if fwd else "", "desc": esc(S[f"{page.id}.desc"]),
         "title": html.escape(re.sub(r"<[^>]+>", "", S[f"{page.id}.title"])), "alternates": alternates, "favicon": favicon,
         "css": css, "sprite": sprite(body, page.id == "home"), "skip_to": page.skip,
         "skip": html.escape(S["home.skip" if page.id == "home" else "site.skip_main"]), "home": home_url(lang),
         "read_page": page.read, "langs": langs, "foot_langs": foot_langs, "root": PREFIX[lang],
         "draft": f'<p class="w draft">{S["site.draft"]}</p>' if raw.get("_draft") else "",
         "body": body, "runtime": json.dumps(runtime, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/"),
         "js": js}
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


SITE_HEADERS = (("Referrer-Policy", "no-referrer"),
                ("Permissions-Policy", "camera=(), microphone=(), geolocation=()"),
                ("X-Frame-Options", "DENY"))


def site_paths() -> list[str]:
    """The _headers rules that cover every site page and nothing of the app's: the Dari home and pages at the root,
    and each other language's whole folder."""
    out = ["/"]
    out += [f"/{p.path}*" for p in PAGES if p.path]
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
    heads = " ".join(re.findall(r"<(?:title|h1|h2|h3)\b[^>]*>(.*?)</(?:title|h1|h2|h3)>", page, re.S))
    if GIRLS.search(heads) or GIRLS.search(path):
        out.append(f"{path}: \"girls\" in a title, heading or address (the quiet profile)")
    return out


def render(out: Path, app: Path = APP) -> dict:
    """Every page in every language into `out` (index.html files), plus site-report.json; returns the report.
    Raises SiteError with every problem found."""
    raw = strings()
    if damm(EXAMPLE_CODE.replace(" ", "")) != 0:
        raise SiteError("the example bag code's check digit is wrong")
    sizes = {"app": app_bytes(app), "apk": apk_bytes(app)}
    pages, hashes, problems = [], {"scripts": set(), "styles": set()}, []
    known = {page_url(p, x) for p in PAGES for x in LANGS}
    for p in PAGES:
        for lang in LANGS:
            doc, inline = render_page(p, lang, raw[lang], sizes)
            hashes["scripts"] |= {sha(s) for s in inline["scripts"]}
            hashes["styles"] |= {sha(s) for s in inline["styles"]}
            url = page_url(p, lang)
            problems += lint(url, doc, known)
            f = out / url.lstrip("/") / "index.html"
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(doc, encoding="utf-8")
            pages.append({"url": url, "page": p.id, "lang": lang, "file": str(f.relative_to(out)),
                          "bytes": len(doc.encode("utf-8"))})
    if problems:
        raise SiteError("\n".join(problems))
    report = {"pages": pages, "app_gzip": sizes["app"], "apk": sizes["apk"],
              "app_shell": [str(f.relative_to(app)) for f in shell_files(app)],
              "csp": csp(hashes), "headers": headers_file(hashes),
              "hashes": {k: sorted(v) for k, v in hashes.items()}, "draft": {x: bool(raw[x].get("_draft")) for x in LANGS}}
    (out / "site-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    return report


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else SITE / "build"
    try:
        rep = render(target)
    except SiteError as e:
        print(f"make_site: {e}", file=sys.stderr)
        sys.exit(1)
    (target / "_headers").write_text(rep["headers"], encoding="utf-8")
    for p in rep["pages"]:
        raw = (target / p["file"]).read_bytes()
        print(f"{p['url']:<16} {p['lang']:<4} {len(raw) / 1024:6.1f} KB raw, {len(gzip.compress(raw, 9)) / 1024:5.1f} KB gzip")
    print(f"the app's first open: {rep['app_gzip'] / 1e6:.2f} MB (gzip); the APK: "
          f"{rep['apk'] / 1e6:.2f} MB" if rep["apk"] else f"the app's first open: {rep['app_gzip'] / 1e6:.2f} MB (gzip); no APK released yet")
