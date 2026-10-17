"""The virtual school day's timetable (P19; C2.4 and C3.1, DESIGN-C2C3-SPECS.md item 10).

A cohort's setting `timetable` is a template per band: the school days of the week, holidays, Ramadan's shorter
day, and for each band a start time and the day's blocks in order (opening, periods, a break, sheet time, close).
`"default"` names the core's own template below. The phone fetches its band's part without a token
(`GET /api/m/timetable?cohort=&band=`, mods/timetable.py), keeps it, and works out the day itself: the clock, the
bells and which lesson fills each period. Nothing about the school day is sent back and no event is recorded (F5).

Bands: p1 to s2. Early years have no school day; adults wait for C4's study time. A band the template does not list
has no school day in that cohort, so Home asks nothing and shows the band's usual Home.
"""
import re

DAYS = ("sat", "sun", "mon", "tue", "wed", "thu", "fri")
KINDS = ("opening", "period", "break", "sheet", "close")
BANDS = ("p1", "p2", "s1", "s2")
SUBJECTS = ("auto", "maths", "science", "english", "dari", "pashto")
FIELDS = {"days", "holidays", "bands", "ramadan"}
MAX_BLOCKS = 16
MAX_DAY_MIN = 9 * 60                          # a school day of at most nine hours

_TIME = re.compile(r"^([01][0-9]|2[0-3]):([0-5][0-9])$")
_DATE = re.compile(r"^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$")


def _day(start: str, periods: int, minutes: int, break_after: int) -> dict:
    blocks = [{"kind": "opening", "min": 5}]
    for i in range(periods):
        blocks.append({"kind": "period", "subject": "auto", "min": minutes})
        if i + 1 == break_after:
            blocks.append({"kind": "break", "min": 15})
    blocks += [{"kind": "sheet", "min": 30}, {"kind": "close", "min": 5}]
    return {"start": start, "blocks": blocks}


# The spec's defaults: p1 two periods of 25 minutes, p2 three of 30, s1 and s2 four of 40; each day an opening, one
# break, sheet time and a close; Saturday to Thursday. The holiday and Ramadan's dates are the spec's example and
# the admin's to change (P21).
DEFAULT = {
    "days": ["sat", "sun", "mon", "tue", "wed", "thu"],
    "holidays": ["2027-03-21"],
    "bands": {"p1": _day("08:00", 2, 25, 1), "p2": _day("08:00", 3, 30, 2),
              "s1": _day("08:00", 4, 40, 2), "s2": _day("08:00", 4, 40, 2)},
    "ramadan": {"from": "2027-02-08", "to": "2027-03-09", "start": "09:30", "period_min": 30},
}


def minutes(hhmm: str) -> int:
    m = _TIME.match(hhmm)
    return int(m.group(1)) * 60 + int(m.group(2))


def _check_band(b, where) -> list[str]:
    if not isinstance(b, dict) or set(b) != {"start", "blocks"}:
        return [f"{where}: a band is exactly {{start, blocks}}"]
    p = []
    if not isinstance(b["start"], str) or not _TIME.match(b["start"]):
        p.append(f"{where}.start: a time like 08:00")
    blocks = b["blocks"]
    if not isinstance(blocks, list) or not 1 <= len(blocks) <= MAX_BLOCKS:
        return p + [f"{where}.blocks: 1 to {MAX_BLOCKS} blocks"]
    total = 0
    for i, x in enumerate(blocks):
        w = f"{where}.blocks[{i}]"
        if not isinstance(x, dict) or x.get("kind") not in KINDS:
            p.append(f"{w}: kind is one of {', '.join(KINDS)}")
            continue
        allowed = {"kind", "min", "subject"} if x["kind"] == "period" else {"kind", "min"}
        if set(x) - allowed:
            p.append(f"{w}: unknown {', '.join(sorted(set(x) - allowed))}")
        if type(x.get("min")) is not int or not 5 <= x["min"] <= 120:
            p.append(f"{w}.min: 5 to 120 minutes")
        else:
            total += x["min"]
        if x["kind"] == "period" and x.get("subject", "auto") not in SUBJECTS:
            p.append(f"{w}.subject: one of {', '.join(SUBJECTS)}")
    if not any(isinstance(x, dict) and x.get("kind") == "period" for x in blocks):
        p.append(f"{where}: at least one period")
    if total > MAX_DAY_MIN:
        p.append(f"{where}: a day of at most {MAX_DAY_MIN // 60} hours")
    if isinstance(b["start"], str) and _TIME.match(b["start"]) and minutes(b["start"]) + total > 22 * 60:
        p.append(f"{where}: the day must end by 22:00")
    return p


def check(t) -> list[str]:
    """Every problem with a timetable setting, in plain words: "default", or a template."""
    if t == "default":
        return []
    if not isinstance(t, dict):
        return ["timetable is \"default\" or a template object"]
    p = []
    if set(t) - FIELDS or not {"days", "bands"} <= set(t):
        p.append("timetable has days and bands, and may have holidays and ramadan; nothing else")
    days = t.get("days")
    if not isinstance(days, list) or not days or len(set(days)) != len(days) or any(d not in DAYS for d in days):
        p.append(f"timetable.days: some of {', '.join(DAYS)}, each once")
    hol = t.get("holidays", [])
    if not isinstance(hol, list) or len(hol) > 60 or any(not isinstance(d, str) or not _DATE.match(d) for d in hol):
        p.append("timetable.holidays: at most 60 dates like 2027-03-21")
    bands = t.get("bands")
    if not isinstance(bands, dict) or not bands:
        p.append("timetable.bands: at least one band")
    else:
        for band, b in bands.items():
            if band not in BANDS:
                p.append(f"timetable.bands.{band}: the school day is for {', '.join(BANDS)} only")
            else:
                p += _check_band(b, f"timetable.bands.{band}")
    r = t.get("ramadan")
    if r is not None:
        if not isinstance(r, dict) or set(r) != {"from", "to", "start", "period_min"}:
            p.append("timetable.ramadan: exactly {from, to, start, period_min}")
        else:
            if not all(isinstance(r[k], str) and _DATE.match(r[k]) for k in ("from", "to")) or r["from"] > r["to"]:
                p.append("timetable.ramadan: from and to are dates, from first")
            if not isinstance(r["start"], str) or not _TIME.match(r["start"]):
                p.append("timetable.ramadan.start: a time like 09:30")
            if type(r["period_min"]) is not int or not 10 <= r["period_min"] <= 60:
                p.append("timetable.ramadan.period_min: 10 to 60 minutes")
    return p


def template(setting) -> dict | None:
    """The cohort's template: its own, the core's default, or None when it has none (no school day)."""
    if setting is None or check(setting):
        return None
    return DEFAULT if setting == "default" else setting


def for_band(setting, band: str) -> dict | None:
    """What a phone in this band needs: {days, holidays, ramadan, start, blocks}; None when the band has no day."""
    t = template(setting)
    if t is None or band not in BANDS or band not in t["bands"]:
        return None
    b = t["bands"][band]
    return {"days": list(t["days"]), "holidays": list(t.get("holidays", [])), "ramadan": t.get("ramadan"),
            "start": b["start"], "blocks": [dict(x) for x in b["blocks"]]}
