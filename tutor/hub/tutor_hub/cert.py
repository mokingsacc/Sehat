"""Certificates (P25b, C4.2): what a finished pathway earns, the paper it is printed on, and the page that checks it.

- Earned from her own events, with consent: each lesson of the pathway in her audience (graph.pathway_lessons) counts
  with a `lesson.done` or a `check.done` of 80 or more; every lesson must count; where the pathway names a `final`
  lesson, its `check.done` must be 80 or more (`missing`). Never for Quran or seerah (graph.NO_CERTIFICATE): a
  religious certificate is a scholar's to give.
- The row is `certificates (id, course, version, month, cohort)`: no token hash, band, day, name or name hash.
- The paper: A4 landscape, black on white like sheets, its own CSS under `.cert-paper`. "has finished the lessons and
  practice sheets of", never "passed" or a level: nothing was invigilated. The course in her language, then English;
  the month in Solar Hijri, then Gregorian; the QR holds the check address (C2.1's text-only rule is for sheets).
  The name line is empty here: the phone writes the typed name into `.cert-name` itself and sends it nowhere; the
  hub's print queue prints it blank, for a name written by hand.
- The month in Solar Hijri is the one that holds the 10th of the Gregorian month (most of it), since the row keeps no
  day: October 2027 is Mizan 1406. Afghan month names; a native speaker checks them (drafts).
- `/v/<id>` is a plain page (`check_page`) whose script asks `GET /api/cert/<id>`.
The Dari and Pashto words here are drafts for a native speaker's check.
"""
from datetime import date
from html import escape as esc

from . import graph, qr
from .textnorm import digits_to_fa

MASTERED = 80
WORDS = {
    "head": {"prs": "قلم · تصدیق‌نامه", "ps": "قلم · تصدیق‌لیک", "en": "Qalam · certificate"},
    "finished": {"prs": "درس‌ها و ورق‌های تمرین این دوره را تمام کرده است:",
                 "ps": "د دې دورې درسونه او د تمرین پاڼې یې بشپړې کړې دي:",
                 "en": "has finished the lessons and practice sheets of"},
    "lessons": {"prs": "{n} درس", "ps": "{n} درسونه", "en": "{n} lessons"},
    "check": {"prs": "بررسی کنید:", "ps": "وګورئ:", "en": "Check it:"},
    "names": {"prs": "قلم هیچ نامی نگه نمی‌دارد. این نام را با تذکره مقایسه کنید.",
              "ps": "قلم هیڅ نوم نه ساتي. دا نوم له تذکرې سره پرتله کړئ.",
              "en": "Qalam keeps no names. Compare this name with an ID card."},
}
# the Solar Hijri months, Hamal first (Afghan names): Dari, Pashto, and as English writes them
HIJRI = {
    "prs": ["حمل", "ثور", "جوزا", "سرطان", "اسد", "سنبله", "میزان", "عقرب", "قوس", "جدی", "دلو", "حوت"],
    "ps": ["وری", "غویی", "غبرگولی", "چنگاښ", "زمری", "وږی", "تله", "لړم", "لیندۍ", "مرغومی", "سلواغه", "کب"],
    "en": ["Hamal", "Sawr", "Jawza", "Saratan", "Asad", "Sonbola", "Mizan", "Aqrab", "Qaws", "Jadi", "Dalw", "Hut"],
}
GREGORIAN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
             "November", "December"]


def word(key: str, lang: str, **kw) -> str:
    t = WORDS[key].get(lang) or WORDS[key]["en"]
    for k, v in kw.items():
        t = t.replace("{" + k + "}", str(v))
    return digits_to_fa(t) if lang in ("prs", "ps") else t


# the 33-year leap rules' break years (C5.1 item 8): with them the arithmetic matches the astronomical calendar Iran
# and Afghanistan keep for these centuries. The JavaScript copy is the staff pages' lang.js; one table of known days
# (tests/hijri_dates.json) tests both.
_BREAKS = (-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178)


def _div(a: int, b: int) -> int:
    return int(a / b)


def _mod(a: int, b: int) -> int:
    return a - int(a / b) * b


def nowruz(jy: int) -> int:
    """The day of March on which Solar Hijri year `jy` begins (Hamal 1)."""
    gy, leap_j, jp, jump = jy + 621, -14, _BREAKS[0], 0
    for jm in _BREAKS[1:]:
        jump = jm - jp
        if jy < jm:
            break
        leap_j += _div(jump, 33) * 8 + _div(_mod(jump, 33), 4)
        jp = jm
    n = jy - jp
    leap_j += _div(n, 33) * 8 + _div(_mod(n, 33) + 3, 4)
    if _mod(jump, 33) == 4 and jump - n == 4:
        leap_j += 1
    leap_g = _div(gy, 4) - _div((_div(gy, 100) + 1) * 3, 4) - 150
    return 20 + leap_j - leap_g


def hijri_date(day: date) -> tuple[int, int, int]:
    """(Solar Hijri year, month 1 to 12, day) of a Gregorian day: Hamal first, six months of 31 days, five of 30, Hut
    29 or 30."""
    jy = day.year - 621
    start = date(day.year, 3, nowruz(jy))
    if day < start:
        jy -= 1
        start = date(day.year - 1, 3, nowruz(jy))
    k = (day - start).days
    if k < 186:
        return jy, k // 31 + 1, k % 31 + 1
    return jy, 7 + (k - 186) // 30, (k - 186) % 30 + 1


def hijri(month: str) -> tuple[int, int]:
    """(Solar Hijri year, month 1 to 12) holding the 10th of a Gregorian month "YYYY-MM"."""
    y, m, _ = hijri_date(date(int(month[:4]), int(month[5:7]), 10))
    return y, m


def month_label(month: str, lang: str) -> str:
    """"Mizan 1406" in her language (Dari and Pashto digits), or for English "October 2027"."""
    if lang == "en":
        return f"{GREGORIAN[int(month[5:7]) - 1]} {month[:4]}"
    hy, hm = hijri(month)
    return digits_to_fa(f"{HIJRI[lang][hm - 1]} {hy}")


def month_labels(month: str) -> dict:
    return {lang: month_label(month, lang) for lang in ("prs", "ps", "en")}


def missing(lessons: list[str], final: str | None, results: dict) -> list[str]:
    """The pathway's lessons her events do not show as done (C4.2); empty when the certificate is earned."""
    out = []
    for lid in lessons:
        r = results.get(lid) or {}
        best = r.get("best")
        done = bool(r.get("done")) or (best is not None and best >= MASTERED)
        if lid == final:
            done = best is not None and best >= MASTERED
        if not done:
            out.append(lid)
    if final and final not in lessons:
        r = results.get(final) or {}
        if r.get("best") is None or r["best"] < MASTERED:
            out.append(final)
    return out


def can_certify(g: dict, p: dict) -> bool:
    return bool(p.get("certificate")) and g.get("subject") not in graph.NO_CERTIFICATE


CSS = """
.cert-paper{position:relative;box-sizing:border-box;width:297mm;height:210mm;padding:16mm 20mm;margin:0 auto;
  background:#fff;color:#000;font-family:Vazirmatn,'Noto Naskh Arabic',sans-serif;font-weight:500;text-align:center;
  border:2.4pt solid #000;outline:0.8pt solid #000;outline-offset:-5mm;display:flex;flex-direction:column;
  justify-content:center;gap:5mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;line-height:1.5}
.cert-paper *{box-sizing:border-box}
.cert-paper .cert-head{font-size:15pt;font-weight:800;letter-spacing:.02em}
.cert-paper .cert-name{min-height:16mm;width:150mm;margin:4mm auto 0;border-bottom:1.2pt solid #000;font-size:26pt;
  font-weight:800;line-height:16mm;overflow:hidden;white-space:nowrap}
.cert-paper .cert-did{font-size:13pt}
.cert-paper .cert-course{font-size:24pt;font-weight:800;line-height:1.3}
.cert-paper .cert-course .en{display:block;font-size:15pt;font-weight:500;direction:ltr}
.cert-paper .cert-meta{font-size:12.5pt}
.cert-paper .cert-foot{display:flex;align-items:center;gap:6mm;margin-top:4mm;text-align:start}
.cert-paper .cert-foot svg{flex:none;width:30mm;height:30mm}
.cert-paper .cert-foot p{margin:0;font-size:11pt}
.cert-paper .cert-foot .url{direction:ltr;unicode-bidi:isolate;font-weight:800}
"""


def paper_body(*, titles: dict, lang: str, cid: str, month: str, lessons: int, url: str) -> str:
    """The certificate's paper, with an empty name line (`.cert-name`), as one `.cert-paper` element."""
    lang = lang if lang in ("prs", "ps", "en") else "prs"
    rtl = lang != "en"
    title = titles.get(lang) or titles.get("en") or ""
    en = titles.get("en") or ""
    course = esc(title) + (f'<span class="en" lang="en">{esc(en)}</span>' if rtl and en and en != title else "")
    hy, hm = hijri(month)
    when = f"{HIJRI['en' if lang == 'en' else lang][hm - 1]} {hy}"
    meta = " · ".join([esc(word("lessons", lang, n=lessons)), esc(digits_to_fa(when) if rtl else when),
                       f'<bdi lang="en">{esc(month_label(month, "en"))}</bdi>'])
    return (f'<div class="cert-paper" dir="{"rtl" if rtl else "ltr"}" lang="{"fa-AF" if lang == "prs" else "ps-AF" if lang == "ps" else "en"}">'
            f'<div class="cert-head">{esc(word("head", lang))}</div>'
            f'<div class="cert-name"></div>'
            f'<div class="cert-did">{esc(word("finished", lang))}</div>'
            f'<div class="cert-course">{course}</div>'
            f'<div class="cert-meta">{meta}</div>'
            f'<div class="cert-foot">{qr.svg(url, 30, url=True)}<div>'
            f'<p>{esc(word("check", lang))} <span class="url">{esc(url)}</span></p>'
            f'<p>{esc(word("names", lang))}</p></div></div></div>')


def document(body: str, *, cid: str, fonts: str) -> str:
    """The paper as a page of its own, for the hub's PDF maker (the name line stays blank)."""
    f = fonts.rstrip("/")
    faces = "".join(f"@font-face{{font-family:'Vazirmatn';font-weight:{w};src:url({f}/vazirmatn-{w}.woff2) format('woff2')}}"
                    for w in (500, 800))
    return (f'<!doctype html><html><head><meta charset="utf-8"><title>Qalam certificate {esc(cid)}</title>'
            f'<style>{faces}@page{{size:A4 landscape;margin:0}}body{{margin:0}}{CSS}</style></head>'
            f'<body>{body}</body></html>')


def check_page() -> str:
    """/v/<id>: a plain page in the clean look; its script (app/js/certcheck.js) reads the id from the address."""
    return ('<!doctype html><html lang="fa-AF" dir="rtl" data-look="clean" data-tone="adult"><head>'
            '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
            '<meta name="theme-color" content="#0d7c7e"><meta name="robots" content="noindex">'
            '<title>Qalam</title><link rel="icon" href="/icon.svg" type="image/svg+xml">'
            '<link rel="stylesheet" href="/css/app.css"></head><body>'
            '<main id="v" class="get"><p class="empty">…</p></main>'
            '<div id="toast" role="status" aria-live="polite"></div>'
            '<script type="module" src="/js/certcheck.js"></script></body></html>')
