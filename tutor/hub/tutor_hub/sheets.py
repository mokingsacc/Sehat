"""Printable worksheets: a lesson's "sheet" turned into an A4 page (HTML), a PDF for the printer, and an answer key.

Paper is the point: children practise with a pencil, then check their sheet in the app ("Check my sheet").
Sheets are black and white line work (cheap on ink, fine on any printer, and the pictures can be coloured in).
A sheet with a generator gets new numbers on every print; the seed printed in its corner brings back its answers.
"""
import html
import math
import random
import re
from fractions import Fraction

from . import mathcheck
from .packs import picture_file
from .packs import text as pick_text
from .textnorm import digits_to_fa

SUBJECT_NAMES = {
    "maths": {"prs": "ریاضی", "ps": "ریاضي", "en": "Maths"},
    "science": {"prs": "ساینس", "ps": "ساینس", "en": "Science"},
    "english": {"prs": "انگلیسی", "ps": "انګلیسي", "en": "English"},
    "dari": {"prs": "دری", "ps": "دري", "en": "Dari"},
    "pashto": {"prs": "پښتو", "ps": "پښتو", "en": "Pashto"},
}
WORDS = {
    "name": {"prs": "نام", "ps": "نوم", "en": "Name"},
    "date": {"prs": "تاریخ", "ps": "نېټه", "en": "Date"},
    "year": {"prs": "صنف", "ps": "ټولګی", "en": "Year"},
    "starting": {"prs": "آغاز", "ps": "پیل", "en": "Starting"},
    "answers": {"prs": "جواب‌ها", "ps": "ځوابونه", "en": "Answers"},
    "for_teacher": {"prs": "برای معلم یا پدر و مادر", "ps": "د ښوونکي یا مور او پلار لپاره", "en": "For the teacher or parent"},
    "check_in_app": {"prs": "وقتی تمام شد، در برنامه «ورقم را چک کن» را بزن.",
                     "ps": "کله چې خلاصه شوه، په پروګرام کې «زما پاڼه وګوره» کېکاږه.",
                     "en": "When you finish, tap “Check my sheet” in the app."},
    "write_here": {"prs": "این‌جا بنویس", "ps": "دلته ولیکه", "en": "Write here"},
    "working": {"prs": "کار", "ps": "کار", "en": "Working"},
    "challenge": {"prs": "چالش", "ps": "ننګونه", "en": "Challenge"},
    "self": {"prs": "خودت ببین", "ps": "پخپله یې وګوره", "en": "Check it yourself"},
}

CSS = """
@font-face{font-family:'Vazirmatn';font-weight:500;src:url(FONTS/vazirmatn-500.woff2) format('woff2')}
@font-face{font-family:'Vazirmatn';font-weight:800;src:url(FONTS/vazirmatn-800.woff2) format('woff2')}
@font-face{font-family:'Naskh';font-weight:500;src:url(FONTS/naskh-500.woff2) format('woff2')}
@font-face{font-family:'Naskh';font-weight:700;src:url(FONTS/naskh-700.woff2) format('woff2')}
@page{size:A4;margin:12mm 13mm 16mm}
*{box-sizing:border-box}
html{color:#000;background:#fff}
body{margin:0;font-family:Vazirmatn,'Noto Naskh Arabic',sans-serif;font-weight:500;font-size:12.5pt;line-height:1.55}
.page{max-width:184mm;margin:0 auto}
.m{direction:ltr;unicode-bidi:isolate;display:inline-block;font-family:Vazirmatn,sans-serif}
.en{direction:ltr;unicode-bidi:isolate}
header{display:flex;align-items:flex-start;justify-content:space-between;gap:6mm;border-bottom:1.6pt solid #000;padding-bottom:3mm;margin-bottom:4mm}
h1{font-weight:800;font-size:21pt;line-height:1.25;margin:0}
.tag{display:inline-block;border:1.2pt solid #000;border-radius:9pt;padding:0 3mm;font-size:10.5pt;font-weight:800;margin-top:1mm}
.who{font-size:11.5pt;white-space:nowrap;text-align:start}
.who div{margin-bottom:2mm}
.who .line{display:inline-block;min-width:38mm;border-bottom:1pt dotted #000;padding:0 1mm}
.intro{font-size:12pt;margin:0 0 3mm}
.example{border:1.2pt dashed #000;border-radius:3mm;padding:2.5mm 4mm;margin-bottom:4mm}
.item{position:relative;min-height:9mm;margin-bottom:4mm;break-inside:avoid}
[dir=rtl] .item{padding-right:12mm}[dir=ltr] .item{padding-left:12mm}
.num{position:absolute;top:0;width:8mm;height:8mm;border:1.4pt solid #000;border-radius:50%;text-align:center;font-weight:800;font-size:11pt;line-height:7.4mm}
[dir=rtl] .num{right:0}[dir=ltr] .num{left:0}
.body{min-width:0}
.prompt{font-weight:800;margin:0 0 2mm}
.trace{display:table;width:100%;table-layout:fixed;font-family:Naskh,serif;font-weight:700;color:#b5b5b5;font-size:42pt;line-height:1.3;border-bottom:1pt dashed #777;white-space:nowrap}
.trace span{display:table-cell;text-align:center}
.trace.word{font-size:36pt}
.trace.latin{font-family:Vazirmatn,sans-serif;font-weight:500;direction:ltr;font-size:30pt}
.write-row{display:table;width:100%;table-layout:fixed;border-spacing:2.5mm 0;margin-top:2mm}
.write-row span{display:table-cell;height:17mm;border:1.2pt solid #000;border-radius:2.5mm}
.pics{line-height:0}
.pics figure{display:inline-block;margin:0 0 0 4mm;width:28mm}
.pics img{width:28mm;height:28mm;border:1.2pt solid #000;border-radius:4mm;padding:2mm;background:#fff}
.drawbox{height:48mm;border:1.4pt solid #000;border-radius:4mm}
.count{overflow:hidden}
[dir=rtl] .count .eq{float:left}[dir=ltr] .count .eq{float:right}
.count .eq{margin-top:2mm}
.count .objs{line-height:0}
.count img{width:16mm;height:16mm;margin:0 0 1mm 2.5mm}
.box{display:inline-block;width:18mm;height:13mm;border:1.4pt solid #000;border-radius:2mm;vertical-align:middle}
.sums{display:grid;grid-template-columns:1fr 1fr;gap:3mm 6mm}
.sums .item{margin:0}
.sum{font-size:15pt;white-space:nowrap}
.fr{display:inline-block;vertical-align:middle;text-align:center;margin:0 .6mm;line-height:1.15}
.fr .n{display:block;border-bottom:1.1pt solid #000;padding:0 1mm}
.fr .d{display:block;padding:0 1mm}
.work{height:20mm;border:1pt dashed #999;border-radius:2mm;margin-top:1.5mm;font-size:8.5pt;color:#777;padding:.5mm 2mm}
.lines div{height:10mm;border-bottom:1pt solid #000}
.wordbank{margin-bottom:2mm;line-height:2.1}
.wordbank span{display:inline-block;border:1pt solid #000;border-radius:8pt;padding:0 3mm;margin:0 0 0 2.5mm;line-height:1.5}
table.sort{width:100%;border-collapse:collapse}
table.sort th,table.sort td{border:1.2pt solid #000;padding:1.5mm 2mm;text-align:center}
table.sort td{height:28mm}
.foot{display:flex;justify-content:space-between;gap:4mm;font-size:9pt;color:#333;border-top:.8pt solid #999;padding-top:1.2mm;margin-top:6mm}\n@media print{.foot{display:none}}
.foot b{font-weight:800}
.key li{margin-bottom:2mm}
[dir=rtl] .key{list-style-type:persian}
.key .pics img{width:16mm;height:16mm}
.key .pics{line-height:1}
body.small{font-size:15pt}
body.small h1{font-size:26pt}
body.small .prompt{font-size:16pt}
body.small .num{width:10mm;height:10mm;line-height:9.2mm;font-size:13pt}
body.small .trace{font-size:46pt}
body.small .trace.word{font-size:36pt}
body.small .trace.latin{font-size:32pt}
"""


def esc(s) -> str:
    return html.escape(str(s), quote=True)


def is_latin(s: str) -> bool:
    return bool(re.search(r"[A-Za-z]", s)) and not re.search(r"[؀-ۿ]", s)


def digits(s: str, lang: str) -> str:
    return digits_to_fa(s) if lang in ("prs", "ps") else s


def rich(t, lang: str) -> str:
    """Lesson text to HTML: $sums$ shown left to right, digits in the reader's script, English kept left to right."""
    s = pick_text(t, lang)
    if is_latin(s):
        return f'<span class="en">{esc(s)}</span>'
    parts = s.split("$")
    out = []
    for i, part in enumerate(parts):
        if i % 2:
            out.append(f'<span class="m">{esc(digits(part, lang))}</span>')
        else:
            out.append(esc(digits(part, lang)))
    return "".join(out)


def _ops(s: str) -> str:
    return s.replace("*", "×").replace(" - ", " − ")


def stacked(expr: str, lang: str, box: bool = False) -> str:
    """"1/2 + 1/4" with each fraction drawn as a number over a number, the way school books print them.

    box=True adds "= [  ]" inside the same left-to-right line, so the answer box sits after the sum.
    """
    out, last = [], 0
    for m in re.finditer(r"(\d+)\s*/\s*(\d+)", expr):
        out.append(esc(_ops(digits(expr[last:m.start()], lang))))
        out.append(f'<span class="fr"><span class="n">{esc(digits(m.group(1), lang))}</span>'
                   f'<span class="d">{esc(digits(m.group(2), lang))}</span></span>')
        last = m.end()
    out.append(esc(_ops(digits(expr[last:], lang))))
    if box:
        out.append(' = <span class="box"></span>')
    return f'<span class="m sum">{"".join(out)}</span>'


# generators: new numbers on every print, the same numbers again for the same seed

def gen_fraction_add(rng: random.Random, count: int, max_den: int = 12, same_first: int = 2):
    out, seen, tries = [], set(), 0
    while len(out) < count and tries < 5000:
        tries += 1
        if len(out) < same_first:
            d = rng.randint(3, max_den)
            d1 = d2 = d
        else:
            d1, d2 = rng.sample(range(2, max_den + 1), 2)
            if math.lcm(d1, d2) > max_den * 2:
                continue
        a, b = rng.randint(1, d1 - 1), rng.randint(1, d2 - 1)
        if math.gcd(a, d1) != 1 or math.gcd(b, d2) != 1:
            continue
        total = Fraction(a, d1) + Fraction(b, d2)
        if total > 1 or (a, d1, b, d2) in seen or (b, d2, a, d1) in seen:
            continue
        seen.add((a, d1, b, d2))
        out.append({"q": f"{a}/{d1} + {b}/{d2}", "a": mathcheck.fmt(total, fa=False)})
    return out


def gen_add_sub(rng: random.Random, count: int, max_total: int = 10, ops: str = "+-"):
    out, seen, tries = [], set(), 0
    while len(out) < count and tries < 5000:
        tries += 1
        op = rng.choice(ops)
        a, b = rng.randint(0, max_total), rng.randint(0, max_total)
        if op == "+" and a + b > max_total:
            continue
        if op == "-" and a < b:
            continue
        if (a, op, b) in seen:
            continue
        seen.add((a, op, b))
        out.append({"q": f"{a} {op} {b}", "a": str(a + b if op == "+" else a - b)})
    return out


def gen_times(rng: random.Random, count: int, tables=(2, 3, 4, 5)):
    out, seen, tries = [], set(), 0
    while len(out) < count and tries < 5000:
        tries += 1
        a, b = rng.choice(list(tables)), rng.randint(1, 10)
        if (a, b) in seen:
            continue
        seen.add((a, b))
        out.append({"q": f"{a} × {b}", "a": str(a * b)})
    return out


GENERATORS = {"fraction_add": gen_fraction_add, "add_sub": gen_add_sub, "times": gen_times}


def needs_seed(lesson: dict) -> bool:
    return any(it.get("kind") == "generate" for it in (lesson.get("sheet") or {}).get("items", []))


def expand(lesson: dict, seed: int):
    """The sheet's items with generated sums filled in, each with its number on the page."""
    rng = random.Random(f"{lesson['id']}:{seed}")
    out, n = [], 0
    for it in lesson["sheet"]["items"]:
        if it["kind"] == "generate":
            opts = {k: v for k, v in it.items() if k not in ("kind", "type", "count", "prompt", "work")}
            sums = GENERATORS[it["type"]](rng, it["count"], **opts)
            group = []
            for s in sums:
                n += 1
                group.append({"kind": "sum", "n": n, "q": s["q"], "a": s["a"]})
            out.append({"kind": "sums", "prompt": it.get("prompt"), "items": group, "work": it.get("work", True)})
        else:
            n += 1
            x = dict(it, n=n)
            if x["kind"] == "sum" and "a" not in x:
                x["a"] = mathcheck.fmt(mathcheck.evaluate(x["q"]), fa=False)
            out.append(x)
    return out


def answer_key(lesson: dict, seed: int, lang: str, picture_url) -> dict:
    """What the app needs for "Check my sheet": every numbered item and how to check it."""
    rows = []
    for x in expand(lesson, seed):
        for it in (x["items"] if x["kind"] == "sums" else [x]):
            k = it["kind"]
            row = {"n": it["n"], "kind": k}
            if k == "sum":
                row.update(q=it["q"], a=it["a"], check="value")
            elif k == "count":
                row.update(a=str(it["how_many"]), check="value")
            elif k == "write":
                row.update(a=pick_text(it.get("a"), lang) if it.get("a") else "", check="self",
                           prompt=pick_text(it.get("prompt"), lang))
            elif k == "circle":
                row.update(a=[picture_url(p) for p in it.get("answer", [])], check="self",
                           prompt=pick_text(it.get("prompt"), lang))
            elif k == "sort":
                groups = [pick_text(g, lang) for g in it.get("groups", [])]
                row.update(a=[[pick_text(w, lang), groups[g]] for w, g in zip(it.get("words", []), it.get("answer", []))],
                           check="self", prompt=pick_text(it.get("prompt"), lang))
            else:
                row.update(check="none")
            rows.append(row)
    return {"lesson": lesson["id"], "code": lesson["sheet"]["code"], "seed": seed, "items": rows}


def _item_html(x, lang, pic, small):
    k = x["kind"]
    prompt = f'<p class="prompt">{rich(x["prompt"], lang)}</p>' if x.get("prompt") else ""
    if k == "sums":
        cells = []
        for it in x["items"]:
            work = f'<div class="work">{esc(pick_text(WORDS["working"], lang))}</div>' if x.get("work") and not small else ""
            cells.append(f'<div class="item"><div class="num">{esc(digits(it["n"], lang))}</div><div class="body">'
                         f'{stacked(it["q"], lang, box=True)}{work}</div></div>')
        return f'{prompt}<div class="sums">{"".join(cells)}</div>'
    body = ""
    if k == "trace":
        t = str(x["text"])
        word = len(t) > 1
        count = x.get("count", 6 if not word else 3)
        cls = "trace" + (" word" if word else "") + (" latin" if is_latin(t) else "")
        sep = " " if word else " "
        body = f'<div class="{cls}">{sep.join([esc(t)] * count)}</div>'
        boxes = x.get("boxes", min(count, 6) if not word else 3)
        if boxes:
            body += '<div class="write-row">' + "<span></span>" * boxes + "</div>"
    elif k == "circle":
        figs = "".join(f'<figure><img src="{esc(pic(p))}" alt=""></figure>' for p in x.get("pictures", []))
        body = f'<div class="pics">{figs}</div>'
    elif k == "draw":
        body = '<div class="drawbox"></div>'
    elif k == "count":
        objs = "".join(f'<img src="{esc(pic(x["picture"]))}" alt="">' for _ in range(x["how_many"]))
        body = f'<div class="count"><div class="eq"><span class="m sum">= <span class="box"></span></span></div><div class="objs">{objs}</div></div>'
    elif k == "sum":
        body = stacked(x["q"], lang, box=True)
    elif k == "write":
        body = '<div class="lines">' + "<div></div>" * x.get("lines", 2) + "</div>"
    elif k == "sort":
        words = "".join(f"<span>{rich(w, lang)}</span>" for w in x.get("words", []))
        heads = "".join(f"<th>{rich(g, lang)}</th>" for g in x.get("groups", []))
        cells = "".join("<td></td>" for _ in x.get("groups", []))
        body = f'<div class="wordbank">{words}</div><table class="sort"><tr>{heads}</tr><tr>{cells}</tr></table>'
    return (f'<section class="item"><div class="num">{esc(digits(x["n"], lang))}</div>'
            f'<div class="body">{prompt}{body}</div></section>')


def page(lesson: dict, *, lang: str, seed: int, kind: str = "worksheet", name: str | None = None,
         fonts: str = "/fonts", picture_url=lambda name_: name_, hub_name: str = "Qalam") -> str:
    """The sheet (or its answer page) as one HTML page.

    fonts is a URL or file:// folder; picture_url(name) gives each picture's URL (web) or file:// path (PDF).
    """
    lang = lang if lang in ("prs", "ps", "en") else "prs"
    sheet = lesson["sheet"]
    small = lesson["year"] <= 6
    pic = picture_url
    title = rich(sheet.get("title") or lesson["title"], lang)
    year = (pick_text(WORDS["year"], lang) + " " + digits(lesson["year"], lang)) if lesson["year"] else pick_text(WORDS["starting"], lang)
    tag = f'{esc(pick_text(SUBJECT_NAMES[lesson["subject"]], lang))} · {esc(year)}'
    code = sheet["code"] + (f"-{seed}" if needs_seed(lesson) else "")
    d = "ltr" if lang == "en" else "rtl"
    htmllang = {"prs": "fa-AF", "ps": "ps-AF", "en": "en"}[lang]
    if kind == "answers":
        key = answer_key(lesson, seed, lang, pic)
        lis = []
        for r in key["items"]:
            if r["check"] == "value":
                lis.append(f"<li>{stacked(r['q'] + ' = ' + r['a'] if r.get('q') else r['a'], lang)}</li>")
            elif r["kind"] == "circle":
                lis.append('<li><div class="pics">' + "".join(f'<img src="{esc(u)}" alt="">' for u in r["a"]) + "</div></li>")
            elif r["kind"] == "sort":
                lis.append("<li>" + "، ".join(f"{esc(w)}: {esc(g)}" for w, g in r["a"]) + "</li>")
            elif r["check"] == "self" and r.get("a"):
                lis.append(f"<li>{rich(r['a'], lang)}</li>")
            else:
                lis.append(f"<li>{esc(pick_text(WORDS['self'], lang))}</li>")
        body = (f'<p class="intro">{esc(pick_text(WORDS["for_teacher"], lang))}</p>'
                f'<ol class="key">{"".join(lis)}</ol>')
        heading = f'{esc(pick_text(WORDS["answers"], lang))} · {title}'
        who = ""
    else:
        parts = []
        if sheet.get("intro"):
            parts.append(f'<p class="intro">{rich(sheet["intro"], lang)}</p>')
        if sheet.get("example"):
            ex = sheet["example"]
            exm = f'<div>{stacked(ex["math"], lang)}</div>' if ex.get("math") else ""
            parts.append(f'<div class="example">{rich(ex.get("text", ""), lang)}{exm}</div>')
        parts += [_item_html(x, lang, pic, small) for x in expand(lesson, seed)]
        body = "".join(parts)
        heading = title
        nm = f'<span class="line">{esc(name)}</span>' if name else '<span class="line"></span>'
        who = (f'<div class="who"><div>{esc(pick_text(WORDS["name"], lang))}: {nm}</div>'
               f'<div>{esc(pick_text(WORDS["date"], lang))}: <span class="line"></span></div></div>')
    foot = (f'<div class="foot"><span><b>{esc(code)}</b></span><span>{esc(pick_text(WORDS["check_in_app"], lang)) if kind != "answers" else ""}</span>'
            f'<span>{esc(hub_name)}</span></div>')
    css = CSS.replace("FONTS", fonts.rstrip("/")) + margin_boxes(code, "" if kind == "answers" else pick_text(WORDS["check_in_app"], lang), hub_name)
    return (f'<!doctype html><html lang="{htmllang}" dir="{d}"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width, initial-scale=1"><title>{esc(pick_text(lesson["title"], lang))}</title>'
            f'<style>{css}</style></head><body class="{"small" if small else "big"}"><div class="page">'
            f'<header><div><h1>{heading}</h1><span class="tag">{tag}</span></div>{who}</header>'
            f'{body}{foot}</div></body></html>')


def _css_string(s: str) -> str:
    return '"' + str(s).replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ") + '"'


def margin_boxes(code: str, note: str, hub_name: str) -> str:
    """The sheet's code (with its seed) in the bottom corner of every printed page, where "Check my sheet" asks for it."""
    font = "font-family:Vazirmatn,sans-serif;font-size:9pt;color:#333"
    return (f"@page{{@bottom-left{{content:{_css_string(code)};{font};font-weight:800;font-size:11pt}}"
            f"@bottom-center{{content:{_css_string(note)};{font}}}"
            f"@bottom-right{{content:{_css_string(hub_name)};{font}}}}}")


def render_pdf(html_text: str, base_url: str):
    """(PDF bytes, number of pages). Needs WeasyPrint; raises RuntimeError with a plain message without it."""
    try:
        from weasyprint import HTML
    except Exception as e:   # ImportError, or OSError when the Pango library is missing
        raise RuntimeError("the PDF maker (WeasyPrint) is not installed on this hub: see docs/HUB-SETUP.md") from e
    doc = HTML(string=html_text, base_url=base_url).render()
    return doc.write_pdf(), len(doc.pages)


def hub_card(*, name: str, url: str, ssid: str | None, password: str | None, fonts: str = "/fonts") -> str:
    """A card to pin up at the hub: scan one code to join the Wi-Fi, another to open the app."""
    def qr(data):
        try:
            import segno
        except ImportError:
            return ""
        return segno.make_qr(data, error="m").svg_inline(scale=7, dark="#000", light="#fff")

    def wifi_escape(s):
        return re.sub(r'([\\;,:"])', r"\\\1", s)

    blocks = []
    if ssid:
        wifi = f"WIFI:T:{'WPA' if password else 'nopass'};S:{wifi_escape(ssid)};" + (f"P:{wifi_escape(password)};" if password else "") + ";"
        blocks.append(f'<section class="card"><h2><span class="m">1</span> وای‌فای · وای فای · Wi-Fi</h2>{qr(wifi)}'
                      f'<p class="m big">{esc(ssid)}</p>' + (f'<p class="m">{esc(password)}</p>' if password else "") + "</section>")
    blocks.append(f'<section class="card"><h2><span class="m">2</span> برنامه · پروګرام · App</h2>{qr(url)}'
                  f'<p class="m big">{esc(url)}</p></section>')
    css = CSS.replace("FONTS", fonts.rstrip("/")) + """
.cards{display:flex;gap:10mm;justify-content:center;margin-top:8mm}
.card{border:1.6pt solid #000;border-radius:5mm;padding:6mm;text-align:center;width:80mm}
.card h2{font-size:15pt;margin:0 0 3mm}.card svg{width:56mm;height:56mm}.big{font-size:16pt;font-weight:800}
"""
    return (f'<!doctype html><html lang="fa-AF" dir="rtl"><head><meta charset="utf-8"><title>{esc(name)}</title>'
            f'<style>{css}</style></head><body><div class="page"><header><div><h1>{esc(name)}</h1>'
            f'<span class="tag">مرکز درسی · د زده کړې مرکز · Learning hub</span></div></header>'
            f'<p class="intro">با کمره‌ی تلفن کد را اسکن کن. · د ټیلیفون په کمره کوډ سکن کړه. · Scan with the phone camera.</p>'
            f'<div class="cards">{"".join(blocks)}</div></div></body></html>')


__all__ = ["page", "answer_key", "render_pdf", "hub_card", "needs_seed", "expand", "picture_file"]
