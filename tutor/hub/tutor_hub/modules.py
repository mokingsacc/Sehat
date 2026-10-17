"""Module manifests: what each part of Qalam is, which age bands it serves, where it shows, and what it can do.

One file per module, tutor/modules/<id>/module.json, in the shape the design committee settled (C0.1, BUILD-PLAN
section 3.2): exactly `id`, `version`, `maturity`, `depends`, `bands`, `slots`, `capabilities`, `ai`, `settings`,
`needs`, `offline`, of which only `ai` may be left out. A manifest that fails these checks is left out, with its
reason logged, as a broken lesson is; tools/validate_modules.py runs the same checks in CI.

The risk the admin sees comes from this file's table, never from the module: a module cannot rate itself.
"""
import json
import logging
import re
from pathlib import Path

log = logging.getLogger("tutor.modules")

BANDS = ("ey", "p1", "p2", "s1", "s2", "ad")
SLOTS = ("home.action", "lesson.end", "settings.row", "teacher.panel", "admin.panel")
MATURITY = ("draft", "pilot", "stable")
NEEDS = ("internet", "printer", "camera", "pin")     # pin: the teacher's PIN, kept on the hub only
OFFLINE = ("yes", "partly", "no")
AI_PURPOSES = ("explain", "hint", "read_sheet", "plan", "screen")
# the core's table (BUILD-PLAN 3.2); "blocked" unless the cohort's moderation is paid-human (P21)
CAPABILITY_RISK = {"photo.upload": "high", "audio.record": "high", "free.text": "medium", "ai.call": "medium",
                   "share.public": "blocked", "child.contact": "blocked",
                   # P32 (C4.8): learners' own questions shown to their class; registered and blocked, with no screen
                   # or route behind it in 2027 (the `made` module does not list it)
                   "share.cohort": "blocked"}
RISK_ORDER = ("none", "medium", "high", "blocked")
# the core's sentence for each capability, which the admin reads before turning a module on (P21); English, for the
# admin, who reads English by default
RISK_SENTENCE = {
    "photo.upload": "Learners send a strip of their answer cells to be read; online it goes to the AI provider and is "
                    "never kept.",
    "audio.record": "A learner's voice leaves her phone: live to her class when given the floor (adults only, never "
                    "recorded), or to be written as text (not built).",
    "free.text": "Learners type their own words; what they type reaches the server and may reach a teacher or the "
                 "AI provider.",
    "ai.call": "Questions go to the AI provider (OpenAI online, the hub's own model in the village), within the "
               "cohort's daily budget.",
    "share.public": "Learners' work could be seen by people outside the class. Blocked unless moderation is paid "
                    "human moderation.",
    "child.contact": "Learners could reach other people directly. Blocked unless moderation is paid human "
                     "moderation.",
    "share.cohort": "Learners' own work could be seen by their class. Blocked unless moderation is paid human "
                    "moderation.",
}
FIELDS = ("id", "version", "maturity", "depends", "bands", "slots", "capabilities", "ai", "settings", "needs",
          "offline")
OPTIONAL = {"ai"}
SETTING_TYPES = {"int": int, "bool": bool, "str": str}

ID = re.compile(r"^[a-z][a-z0-9]{1,23}$")
SEMVER = re.compile(r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$")


def _str_list(m: dict, key: str, allowed=None, problems=None) -> None:
    v = m.get(key)
    if not isinstance(v, list) or not all(isinstance(x, str) for x in v):
        problems.append(f"{key} must be a list of words")
        return
    if len(set(v)) != len(v):
        problems.append(f"{key} lists something twice")
    if allowed is not None:
        bad = [x for x in v if x not in allowed]
        if bad:
            problems.append(f"{key}: unknown {', '.join(bad)} (allowed: {', '.join(allowed)})")


def _check_setting(name: str, spec, problems: list) -> None:
    if not re.match(r"^[a-z][a-z0-9_]*$", name) or not isinstance(spec, dict):
        problems.append(f"settings.{name}: a lower-case name with an object describing it")
        return
    t = SETTING_TYPES.get(spec.get("type"))
    if t is None:
        problems.append(f"settings.{name}: type must be one of {', '.join(SETTING_TYPES)}")
        return
    extra = set(spec) - {"type", "default", "min", "max"}
    if extra:
        problems.append(f"settings.{name}: unknown {', '.join(sorted(extra))}")
    d = spec.get("default")
    if type(d) is not t:                     # bool is not an int here
        problems.append(f"settings.{name}: default must be {spec['type']}")
        return
    if t is int:
        lo, hi = spec.get("min"), spec.get("max")
        if any(x is not None and type(x) is not int for x in (lo, hi)):
            problems.append(f"settings.{name}: min and max must be whole numbers")
        elif (lo is not None and d < lo) or (hi is not None and d > hi):
            problems.append(f"settings.{name}: default is outside min and max")
    elif "min" in spec or "max" in spec:
        problems.append(f"settings.{name}: only int settings have min and max")


def check(m, folder: str | None = None) -> list[str]:
    """Every problem with one manifest, in plain words; an empty list means it is fine."""
    if not isinstance(m, dict):
        return ["a manifest is one JSON object"]
    p: list[str] = []
    unknown = set(m) - set(FIELDS)
    missing = [f for f in FIELDS if f not in m and f not in OPTIONAL]
    if unknown:
        p.append(f"unknown fields: {', '.join(sorted(unknown))}")
    if missing:
        p.append(f"missing fields: {', '.join(missing)}")
        return p
    if not isinstance(m["id"], str) or not ID.match(m["id"]):
        p.append("id must be lower case letters and digits, starting with a letter")
    elif folder is not None and m["id"] != folder:
        p.append(f"id {m['id']!r} is not the folder's name {folder!r}")
    if not isinstance(m["version"], str) or not SEMVER.match(m["version"]):
        p.append("version must be like 1.2.3")
    if m["maturity"] not in MATURITY:
        p.append(f"maturity must be one of {', '.join(MATURITY)}")
    _str_list(m, "depends", None, p)
    if isinstance(m["depends"], list) and m.get("id") in m["depends"]:
        p.append("a module cannot depend on itself")
    _str_list(m, "bands", BANDS, p)
    if isinstance(m["bands"], list) and not m["bands"]:
        p.append("bands: at least one band")
    _str_list(m, "slots", SLOTS, p)
    _str_list(m, "capabilities", tuple(CAPABILITY_RISK), p)
    _str_list(m, "needs", NEEDS, p)
    if m["offline"] not in OFFLINE:
        p.append(f"offline must be one of {', '.join(OFFLINE)}")
    if not isinstance(m["settings"], dict):
        p.append("settings must be an object")
    else:
        for name, spec in m["settings"].items():
            _check_setting(name, spec, p)
    if "ai" in m:
        ai = m["ai"]
        if not isinstance(ai, dict) or set(ai) - {"purposes", "max_calls_per_learner_day"} or "purposes" not in ai:
            p.append("ai must be {purposes, max_calls_per_learner_day (optional)}")
        else:
            _str_list(ai, "purposes", AI_PURPOSES, p)
            n = ai.get("max_calls_per_learner_day")
            if n is not None and (type(n) is not int or n < 1):
                p.append("ai.max_calls_per_learner_day must be a whole number above 0")
        if isinstance(m["capabilities"], list) and "ai.call" not in m["capabilities"]:
            p.append("a module with ai must list the ai.call capability")
    elif isinstance(m["capabilities"], list) and "ai.call" in m["capabilities"]:
        p.append("a module with the ai.call capability must say its ai purposes")
    return p


def risk(m: dict) -> str:
    """The highest risk among the module's capabilities, from the core's table."""
    levels = [CAPABILITY_RISK[c] for c in m.get("capabilities", [])] or ["none"]
    return max(levels, key=RISK_ORDER.index)


def risk_sentence(m: dict) -> str:
    """What the module's capabilities let learners do, in the core's words: the sentence beside the admin's switch."""
    return " ".join(RISK_SENTENCE[c] for c in m.get("capabilities", []) if c in RISK_SENTENCE)


def load(folder: Path) -> tuple[dict[str, dict], list[str]]:
    """Every valid manifest under folder, by id, and the problems of the ones left out.

    A module whose `depends` names a module that is missing or left out is left out too, so nothing half-works."""
    found: dict[str, dict] = {}
    problems: list[str] = []
    for f in sorted(Path(folder).glob("*/module.json")):
        name = f.parent.name
        try:
            m = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            problems.append(f"{name}: not readable JSON ({e})")
            continue
        p = check(m, name)
        if p:
            problems += [f"{name}: {x}" for x in p]
        else:
            found[name] = m
    changed = True
    while changed:                            # drop modules whose dependencies are gone, until nothing changes
        changed = False
        for mid, m in list(found.items()):
            gone = [d for d in m["depends"] if d not in found]
            if gone:
                problems.append(f"{mid}: depends on {', '.join(gone)}, which is missing or left out")
                del found[mid]
                changed = True
    for p in problems:
        log.warning("module left out: %s", p)
    return found, problems
