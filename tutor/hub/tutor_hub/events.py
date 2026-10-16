"""Events: what learners did, as verbs and ids only, so progress can be counted without knowing who anyone is.

An event is `{at, verb, object, value}`: the minute it happened (UTC), a verb from the list below, an id (a lesson,
an answer source) and a number when the verb has one. The module comes from the verb. Nothing else is taken: no
name, no free text, no phone number (an object with a run of five digits or more is refused), and no field this
file does not know (the API refuses the whole batch).

Some verbs come from the phone's queue (a lesson started or finished, a sheet marked on Check my sheet, even offline);
the others only the hub writes, from its own routes (Ask, printing, the teacher's review), so a phone cannot send them.
A phone's events carry the hash of the learner's token (P10) and are kept only when she has consent; the hub's own
events carry none.
"""
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

MAX_BATCH = 100
KEEP_DAYS = 365                         # 12 months (BUILD-PLAN 3.4); counts later
AT = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$")
LESSON = re.compile(r"^[a-z][a-z0-9]*(-[a-z0-9]+)*$")
DIGIT_RUN = re.compile(r"[0-9]{5,}")
SOURCES = ("rules", "maths", "bank", "approved", "ai", "lesson", "none")


@dataclass(frozen=True)
class Verb:
    module: str
    obj: str | None                     # what the object is: "lesson", "source", or None for no object
    value: tuple[int, int] | None       # the allowed range of the value, or None for no value
    phone: bool                         # True: the phone sends it; False: only the hub writes it


VERBS = {
    "lesson.start": Verb("lessons", "lesson", None, True),
    "lesson.done": Verb("lessons", "lesson", (0, 3), True),            # stars
    "ask.answered": Verb("ask", "source", None, False),                # where the answer came from
    "ask.to_teacher": Verb("ask", None, None, False),
    "print.queued": Verb("print", "lesson", (1, 60), False),           # copies
    "check.done": Verb("check", "lesson", (0, 100), True),             # a sheet marked: percent right
    "review.approved": Verb("teacher", "lesson", None, False),
    "review.rejected": Verb("teacher", "lesson", None, False),
}


def minute(t: datetime | None = None) -> str:
    return (t or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M")


def lesson_id(x) -> str | None:
    """x if it looks like a lesson id (and nothing else could hide in it), else None."""
    return x if isinstance(x, str) and len(x) <= 64 and LESSON.match(x) and not DIGIT_RUN.search(x) else None


def check(e: dict, *, phone: bool) -> list[str]:
    """The problems with one event; empty when it may be kept. `phone`: it came from a phone, not the hub."""
    v = VERBS.get(e.get("verb"))
    if v is None:
        return [f"unknown verb {str(e.get('verb'))[:32]!r}"]
    p = []
    if phone and not v.phone:
        p.append(f"{e['verb']} is written by the hub only")
    at = e.get("at")
    if not isinstance(at, str) or not AT.match(at):
        p.append("at must be a UTC minute like 2026-10-16T09:41")
    else:
        try:
            datetime.strptime(at, "%Y-%m-%dT%H:%M")
        except ValueError:
            p.append("at is not a real time")
    o = e.get("object")
    if v.obj is None and o is not None:
        p.append(f"{e['verb']} takes no object")
    elif v.obj == "lesson" and lesson_id(o) is None:
        p.append(f"{e['verb']} takes a lesson id")
    elif v.obj == "source" and o not in SOURCES:
        p.append(f"{e['verb']} takes an answer source")
    n = e.get("value")
    if v.value is None and n is not None:
        p.append(f"{e['verb']} takes no value")
    elif v.value is not None and (type(n) is not int or not v.value[0] <= n <= v.value[1]):
        p.append(f"{e['verb']} takes a value from {v.value[0]} to {v.value[1]}")
    return p


def row(e: dict, *, cohort: str, token_hash: str | None = None, now: datetime | None = None) -> dict | None:
    """The store's row for a checked event, or None when it is older than events are kept.

    A time in the future (a phone's clock running fast) becomes now."""
    now = now or datetime.now(timezone.utc)
    at = datetime.strptime(e["at"], "%Y-%m-%dT%H:%M").replace(tzinfo=timezone.utc)
    if at < now - timedelta(days=KEEP_DAYS):
        return None
    return {"at": minute(min(at, now)), "token_hash": token_hash, "cohort": cohort, "module": VERBS[e["verb"]].module,
            "verb": e["verb"], "object": e.get("object"), "value": e.get("value")}
