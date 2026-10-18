"""Where the hub keeps its records, behind one async interface (base.Store): SQLite on the hub, D1 online.

The stores load on first use, so a Python Worker importing D1Store never loads sqlite3 or a thread pool."""
from .base import Store

__all__ = ["Store", "SqliteStore", "D1Store"]


def __getattr__(name):
    if name == "SqliteStore":
        from .sqlite import SqliteStore
        return SqliteStore
    if name == "D1Store":
        from .d1 import D1Store
        return D1Store
    raise AttributeError(name)
