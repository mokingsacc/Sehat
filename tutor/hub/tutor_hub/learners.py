"""Learners the server knows, without names: tokens, class codes, alias pictures and consent texts (P10).

A learner joins (`POST /api/join`) with her band, language and the alias picture her phone picked, and, when she
has one, the class code from her teacher's card. The server draws a number for the picture ("Book 27"), makes a
random token, keeps only the token's SHA-256 and gives the token to the phone, which sends it as the
`X-Learner-Token` header. Without a class code she joins this server's own cohort (the hub's, or online the one
`TUTOR_COHORT` names).

The consent record is the guardian's (or, for adults, her own) agreement to the text the server names: its kind,
the text's version and the minute, never who agreed. Without it no event of hers is kept (the phone sends none, and
the server refuses them). The texts are versioned data in content/consent/<lang>/<version>.json: one version for
the village hub ("nothing leaves the village") and one for the online home (OpenAI reads questions), drafts until
reviewers and the solicitor sign them.
"""
import hashlib
import json
import re
import secrets
from datetime import datetime, timezone
from pathlib import Path

from .config import TUTOR

ALIASES = TUTOR / "content" / "aliases.json"
CONSENT = TUTOR / "content" / "consent"
CONSENT_KINDS = ("guardian-on-phone", "self", "partner-paper")
CONSENT_VERSIONS = {"hub": "hub-2026-10", "online": "online-2026-10"}
HEADER = "X-Learner-Token"
TOKEN = re.compile(r"^[A-Za-z0-9_-]{20,64}$")
CODE_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"     # no 0/O, 1/I/L: a code is read off a card and typed
CODE_LENGTH = 8
MINUTE = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$")
IDLE_DAYS = 365                                       # a learner not seen for 12 months is deleted


def new_token() -> str:
    return secrets.token_urlsafe(24)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_class_code() -> str:
    """A class code for a teacher's card, like K7QM-4PRT."""
    raw = "".join(secrets.choice(CODE_LETTERS) for _ in range(CODE_LENGTH))
    return raw[:4] + "-" + raw[4:]


def normal_code(code: str | None) -> str | None:
    """A typed or scanned code as it was made: capitals, no dashes or spaces; None if it cannot be one."""
    if not isinstance(code, str):
        return None
    c = re.sub(r"[\s\-_.]", "", code).upper()
    return c if len(c) == CODE_LENGTH and all(ch in CODE_LETTERS for ch in c) else None


def code_hash(code: str) -> str:
    return hashlib.sha256(("qalam-class:" + code).encode()).hexdigest()


def load_aliases(path: Path = ALIASES) -> list[str]:
    """The alias picture ids, in order."""
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    return [p["id"] for p in doc["pictures"]]


def load_consent(folder: Path = CONSENT) -> dict[tuple[str, str], dict]:
    """(lang, version) -> the consent text, for every file under content/consent."""
    out = {}
    for f in sorted(Path(folder).glob("*/*.json")):
        doc = json.loads(f.read_text(encoding="utf-8"))
        if doc.get("lang") == f.parent.name and doc.get("version") == f.stem:
            out[(f.parent.name, f.stem)] = doc
    return out


def minute(t: datetime | None = None) -> str:
    return (t or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M")


def day(t: datetime | None = None) -> str:
    return (t or datetime.now(timezone.utc)).strftime("%Y-%m-%d")


def consent_at(at: str | None) -> str:
    """The phone's minute for a consent given offline, if it is a real minute and not in the future; else now."""
    now = minute()
    if isinstance(at, str) and MINUTE.match(at):
        try:
            datetime.strptime(at, "%Y-%m-%dT%H:%M")
            return min(at, now)
        except ValueError:
            pass
    return now


def public(row: dict, cohort: dict | None) -> dict:
    """What a learner may see of her own record (GET /api/me): never the token's hash."""
    consent = ({"kind": row["consent_kind"], "version": row["consent_version"], "at": row["consent_at"]}
               if row.get("consent_kind") else None)
    return {"cohort": {"id": cohort["id"], "label": cohort["label"]} if cohort else None, "band": row["band"],
            "picture": row["picture"], "number": row["number"], "consent": consent}
