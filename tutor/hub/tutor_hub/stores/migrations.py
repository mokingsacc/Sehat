"""The one migration mechanism every store shares: which files, in which order, as which statements, recorded where.

The tables come from `tutor/migrations/NNNN_name.sql`, plain SQL that the hub's SQLite and D1 both run: no PRAGMA,
no BEGIN or COMMIT, no trigger, every CREATE with IF NOT EXISTS. A file is applied once, as one atomic group: the
row recording it in `schema_migrations(id, applied_at)` first, then its statements. Only how the group is made
atomic differs between stores: SQLite wraps it in BEGIN and COMMIT (stores/sqlite.py), D1 sends it as one `batch()`
(stores/d1.py), because D1 has no transactions through `prepare()`. Recording the row first means that when two
callers race to apply the same file, the second fails on the row before touching any table, and changes nothing.

`schema_migrations` is the only record of what was applied, on the hub and online alike; nothing else (Wrangler's
`d1 migrations apply` keeps its own table) may apply these files. ARCHITECTURE.md says how the deploy runs them.

No sqlite3 here: this module also runs inside a Python Worker.
"""
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from ..config import TUTOR

MIGRATIONS = TUTOR / "migrations"
NAME = re.compile(r"^[0-9]{4}_[a-z0-9_]+$")
LEDGER = "CREATE TABLE IF NOT EXISTS schema_migrations(id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
APPLIED = "SELECT id FROM schema_migrations ORDER BY id"
RECORD = "INSERT INTO schema_migrations(id, applied_at) VALUES(?, ?)"
_REFUSED = re.compile(r"^(PRAGMA|BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE|ATTACH|DETACH|VACUUM)\b"
                      r"|^CREATE\s+(TEMP\w*\s+)?TRIGGER\b", re.I)


@dataclass(frozen=True)
class Migration:
    id: str                     # the file's name without .sql, like 0003_events
    statements: tuple[str, ...]


def applied_at() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def migration_files(folder: Path = MIGRATIONS) -> list[Path]:
    files = sorted(Path(folder).glob("*.sql"))
    bad = [f.name for f in files if not NAME.match(f.stem)]
    if bad:
        raise ValueError(f"migration files must be named like 0001_init.sql: {', '.join(bad)}")
    return files


def statements(sql: str) -> list[str]:
    """Split a migration into its statements, without comments or the closing `;`. Quotes ('', "", ``, []) may
    hold a `;` or `--`. Refuses what D1 refuses and what a split at `;` would break (a trigger's BEGIN ... END)."""
    out, buf, i, n = [], [], 0, len(sql)

    def end():
        s = "".join(buf).strip()
        buf.clear()
        if s:
            if _REFUSED.match(s):
                raise ValueError(f"not allowed in a shared migration: {s.split()[0]} ...")
            out.append(s)

    while i < n:
        c = sql[i]
        if sql.startswith("--", i):
            j = sql.find("\n", i)
            i = n if j < 0 else j
        elif sql.startswith("/*", i):
            j = sql.find("*/", i + 2)
            if j < 0:
                raise ValueError("a /* comment is never closed")
            buf.append(" ")
            i = j + 2
        elif c in "'\"`[":
            close, j = ("]" if c == "[" else c), i + 1
            while True:
                k = sql.find(close, j)
                if k < 0:
                    raise ValueError(f"a {c} quote is never closed")
                if close != "]" and sql.startswith(close * 2, k):
                    j = k + 2
                    continue
                break
            buf.append(sql[i:k + 1])
            i = k + 1
        elif c == ";":
            end()
            i += 1
        else:
            buf.append(c)
            i += 1
    end()
    return out


def plan(done, folder: Path = MIGRATIONS) -> list[Migration]:
    """The migrations not in `done` (ids already in schema_migrations), in order, each split into statements."""
    return [Migration(f.stem, tuple(statements(f.read_text(encoding="utf-8"))))
            for f in migration_files(folder) if f.stem not in done]
