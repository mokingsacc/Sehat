"""Cohorts and their module switches (flags), and which modules are on for a learner.

A cohort is a group with the same settings: a class, an open online group, a village hub. Its id is random and its
label neutral, so a seized server describes no one (F4). The seed files tutor/cohorts/{hub,staging,open}.json fill
empty tables at start; after that only the admin panel (P21) changes flags, and every change is logged.

A module is on for a learner when (BUILD-PLAN 3.3):
- its flag is on in her cohort (no flag means off),
- every module it depends on is on by these same rules,
- its maturity is one the cohort takes (`settings.maturity`; pilot cohorts take pilot and stable only),
- her band is one the module lists and the cohort serves (when her band is known),
- the host can meet its `needs`: the online Worker lacks a printer and the teacher's PIN (`TUTOR_LACKS`), so print
  and teacher are off there whatever the cohort says; the phone itself judges `internet` and `camera`;
- none of its capabilities is blocked (`share.public`, `child.contact`), unless the cohort's moderation is
  `paid-human` (P21: the admin panel refuses the switch too).
The committee dropped the manifest's `core` field (C0.1), so there is no core version to match yet.
"""
import json
import logging
import re
from pathlib import Path

from . import timetable
from .modules import BANDS, MATURITY, risk

log = logging.getLogger("tutor.flags")

LANGS = ("prs", "ps", "en")
COHORT_ID = re.compile(r"^[a-z0-9]{8,32}$")
COHORT_FIELDS = ("id", "label", "langs", "bands", "settings", "modules")
DEFAULT_MATURITY = ("stable",)       # a cohort that says nothing takes only stable modules
SEEDS = ("hub", "staging", "open")
# a cohort's settings (BUILD-PLAN 3.3), each checked here: the maturities it takes; its school-day timetable (P19:
# "default" or a template, timetable.py); since P21, `ai` (false is the kill switch "AI off"; unset counts as on),
# `ai_budget` (AI tokens a UTC day for this cohort, instead of TUTOR_AI_BUDGET) and `moderation` (who reads what
# learners send: none, teacher or paid-human; only paid-human lets a blocked capability on)
SETTINGS = ("maturity", "timetable", "ai", "ai_budget", "moderation")
MODERATION = ("none", "teacher", "paid-human")
AI_BUDGET_MAX = 10_000_000
# F4: a cohort's label names no one. Words that would say who is in it, in English and (drafts for a native
# speaker's check) in Dari and Pashto; a word matches at the start of a label's word, so plurals are caught too
LABEL_WORDS = ("girl", "boy", "female", "male", "woman", "women", "out of school", "banned",
               "دختر", "پسر", "زن", "زنان", "بانو", "نسوان", "اناث", "بیرون از مکتب", "خارج از مکتب", "ممنوع", "محروم",
               "نجل", "نجون", "هلک", "ښځ", "ښځې", "له ښوونځي بهر", "بند")


def label_problem(label) -> str | None:
    """Why a cohort label is refused (F4), or None: neutral words only, 1 to 40 characters."""
    if not isinstance(label, str) or not 1 <= len(label.strip()) <= 40:
        return "label must be a short neutral name"
    words = re.findall(r"\w+", label.lower())
    text = " ".join(words)
    for w in LABEL_WORDS:
        parts = w.split()
        if len(parts) > 1:
            if f" {w} " in f" {text} ":
                return f"a label must not say who is in the class ({w})"
        elif any(x.startswith(w) and (w not in ("زن", "بند", "male") or x == w) for x in words):
            return f"a label must not say who is in the class ({w})"
    return None


def settings_problems(s) -> list[str]:
    """The problems with a cohort's settings object (BUILD-PLAN 3.3); empty when it may be kept."""
    if not isinstance(s, dict) or set(s) - set(SETTINGS):
        return [f"settings may only hold {', '.join(SETTINGS)} for now"]
    p = []
    if "maturity" in s and (not isinstance(s["maturity"], list) or any(x not in MATURITY for x in s["maturity"])):
        p.append(f"settings.maturity must list some of {', '.join(MATURITY)}")
    if "timetable" in s:
        p += [f"settings.{x}" for x in timetable.check(s["timetable"])]
    if "ai" in s and not isinstance(s["ai"], bool):
        p.append("settings.ai is true or false")
    if "ai_budget" in s and (type(s["ai_budget"]) is not int or not 0 <= s["ai_budget"] <= AI_BUDGET_MAX):
        p.append(f"settings.ai_budget is a whole number of tokens from 0 to {AI_BUDGET_MAX}")
    if "moderation" in s and s["moderation"] not in MODERATION:
        p.append(f"settings.moderation is one of {', '.join(MODERATION)}")
    return p


def ai_on(cohort: dict | None) -> bool:
    """The cohort's AI kill switch: off only when its settings say `ai: false`."""
    return (((cohort or {}).get("settings") or {}).get("ai", True)) is not False


def paid_human(cohort: dict | None) -> bool:
    return ((cohort or {}).get("settings") or {}).get("moderation") == "paid-human"


def check_cohort(c) -> list[str]:
    if not isinstance(c, dict):
        return ["a cohort is one JSON object"]
    p = []
    unknown, missing = set(c) - set(COHORT_FIELDS), [f for f in COHORT_FIELDS if f not in c]
    if unknown:
        p.append(f"unknown fields: {', '.join(sorted(unknown))}")
    if missing:
        return p + [f"missing fields: {', '.join(missing)}"]
    if not isinstance(c["id"], str) or not COHORT_ID.match(c["id"]):
        p.append("id must be 8 to 32 random lower-case letters and digits")
    if (why := label_problem(c["label"])):
        p.append(why)
    for key, allowed in (("langs", LANGS), ("bands", BANDS)):
        v = c[key]
        if not isinstance(v, list) or not v or any(x not in allowed for x in v):
            p.append(f"{key} must list some of {', '.join(allowed)}")
    p += settings_problems(c["settings"])
    # a module is true or false, or {enabled, settings} when the seed sets its settings too (7a: open's photo limit)
    if not isinstance(c["modules"], dict) or not all(
            isinstance(v, bool) or (isinstance(v, dict) and set(v) == {"enabled", "settings"}
                                    and isinstance(v["enabled"], bool) and isinstance(v["settings"], dict))
            for v in c["modules"].values()):
        p.append("modules must map module ids to true or false, or to {enabled, settings}")
    return p


def load_seeds(folder: Path) -> tuple[dict[str, dict], list[str]]:
    """The seed cohorts by file name (hub, staging, open), and the problems of any left out."""
    found, problems = {}, []
    for name in SEEDS:
        f = Path(folder) / f"{name}.json"
        try:
            c = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            problems.append(f"{name}: not readable ({e})")
            continue
        p = check_cohort(c)
        if p:
            problems += [f"{name}: {x}" for x in p]
        else:
            found[name] = c
    for p in problems:
        log.warning("cohort seed left out: %s", p)
    return found, problems


def enabled(manifests: dict[str, dict], cohort: dict, flags: dict[str, dict], band: str | None = None,
            lacks=()) -> list[str]:
    """The ids of the modules that are on, in id order. `flags` maps module id -> {"enabled": bool, ...};
    `lacks` the needs this host cannot meet."""
    maturity = set((cohort.get("settings") or {}).get("maturity") or DEFAULT_MATURITY)
    moderated = paid_human(cohort)
    memo: dict[str, bool] = {}

    def on(mid: str, path: tuple) -> bool:
        if mid in memo:
            return memo[mid]
        m = manifests.get(mid)
        ok = (m is not None and mid not in path                       # a loop of depends switches all of it off
              and bool((flags.get(mid) or {}).get("enabled"))
              and m["maturity"] in maturity
              and (band is None or (band in m["bands"] and band in cohort.get("bands", ())))
              and not set(m["needs"]) & set(lacks)
              and (moderated or risk(m) != "blocked")
              and all(on(d, path + (mid,)) for d in m["depends"]))
        memo[mid] = ok
        return ok

    return [mid for mid in sorted(manifests) if on(mid, ())]


def module_settings(manifest: dict, chosen: dict | None) -> dict:
    """The module's settings for a cohort: each manifest default, replaced by the cohort's value when that is valid."""
    out = {}
    for name, spec in manifest.get("settings", {}).items():
        v = (chosen or {}).get(name, spec["default"])
        ok = type(v) is type(spec["default"])
        if ok and isinstance(v, int) and not isinstance(v, bool):
            ok = spec.get("min", v) <= v <= spec.get("max", v)
        out[name] = v if ok else spec["default"]
    return out


def seed_rows(seeds: dict[str, dict]) -> list[dict]:
    """The seed cohorts as the store's seed_cohorts() takes them."""
    return [{"id": c["id"], "label": c["label"], "langs": c["langs"], "bands": c["bands"], "settings": c["settings"],
             "flags": {mid: ({"enabled": on, "settings": {}} if isinstance(on, bool) else dict(on))
                       for mid, on in c["modules"].items()}}
            for c in seeds.values()]
