"""A D1 database as a Python Worker sees it, with SQLite behind it, for the store contract tests.

A Python Worker reaches D1 through a JavaScript binding (`self.env.DB`), so everything the store gets back is a
JavaScript value seen from Python. This fake gives the store exactly that shape, and is strict wherever D1 is, so a
mistake fails here rather than on Cloudflare (developers.cloudflare.com/d1/worker-api/ and Pyodide's type
conversions):

- `prepare(sql)` -> a statement; `.bind(*values)` -> a new statement (positional `?` and `?NNN` only, at most 100
  values); `await .all()` and `await .run()` -> a result with `.success`, `.results` and `.meta` (`changes`,
  `last_row_id`, `duration`, `rows_read`, `rows_written`, ...); `await .first()` -> the first row, or JS null when
  there is none; `.first(column)` -> that column's value (an error when the row has no such column).
- `await batch(js_array_of_statements)` -> a JS array of results, all statements in one transaction: one failure
  rolls back every one. It is the only way to group writes: BEGIN, COMMIT, ROLLBACK, SAVEPOINT and RELEASE are
  refused in any statement, as D1 refuses them.
- `await exec(sql)` -> `{count, duration}`: the text is split at every newline and each line runs as a query on its
  own, committed as it goes; a statement spread over several lines therefore fails, as it does on D1.
- No PRAGMA at all (stricter than D1, which allows a few read-only ones, so the stores never come to rely on one), no
  ATTACH, DETACH or VACUUM. Foreign keys are enforced, as D1 does by default.
- Values in: str, int (within JavaScript's safe integers; D1 takes no BigInt), float, bool (stored as 1 or 0) and
  JS null (`ffi.jsnull`). Python None is refused: Pyodide turns it into `undefined`, which D1 rejects with
  D1_TYPE_ERROR, so a store must send `jsnull` for SQL NULL.
- Values out are JS proxies: `results`, rows and `meta` are objects with attribute access and `.to_py()`, never
  subscripts. `to_py()` turns arrays into lists and plain objects into dicts, and leaves JS null as `jsnull`
  (Pyodide 0.28 and later), not None. A whole number stored as REAL comes back as int, since a JavaScript number
  carries no type.
- Every call awaits once before it runs, so concurrent callers interleave as separate Worker isolates would.
- Errors are `JsException` with D1's message prefix (`D1_ERROR: ...`, `D1_TYPE_ERROR: ...`).

`ffi` stands in for `pyodide.ffi` (its `jsnull` and `to_js`), and is what tests hand to D1Store.
"""
import asyncio
import re
import sqlite3
import time
from types import SimpleNamespace

MAX_PARAMS = 100                       # D1: bound parameters per query
MAX_SAFE = 2 ** 53 - 1                 # JavaScript's Number.MAX_SAFE_INTEGER
_NAMED = re.compile(r"(^|[^?\w])[:@$][A-Za-z_]")      # :name, @name, $name outside quotes


class JsException(Exception):
    """What a rejected D1 promise raises in a Python Worker (pyodide.ffi.JsException)."""


class _JsNull:
    """JavaScript's null as Pyodide shows it in Python: a singleton that is not None."""
    _one = None

    def __new__(cls):
        if cls._one is None:
            cls._one = super().__new__(cls)
        return cls._one

    def __repr__(self):
        return "jsnull"

    def __bool__(self):
        return False


JS_NULL = _JsNull()


class JsObject:
    """A JavaScript object seen from Python: attributes, and `to_py()` for a dict; no `obj["key"]`."""

    def __init__(self, **fields):
        self.__dict__["_fields"] = fields

    def __getattr__(self, name):
        try:
            return self._fields[name]
        except KeyError:
            raise AttributeError(name) from None   # as Pyodide does for a property the object does not have

    def __setattr__(self, name, value):
        raise AttributeError("read-only in this fake")

    def to_py(self):
        return {k: _to_py(v) for k, v in self._fields.items()}


class JsArray:
    """A JavaScript array seen from Python: len, index, iterate, and `to_py()` for a list."""

    def __init__(self, items):
        self._items = list(items)

    def __len__(self):
        return len(self._items)

    def __getitem__(self, i):
        return self._items[i]

    def __iter__(self):
        return iter(self._items)

    def to_py(self):
        return [_to_py(v) for v in self._items]


def _to_py(v):
    return v.to_py() if isinstance(v, (JsObject, JsArray)) else v


def _to_js_value(v):
    """A value from SQLite, as JavaScript holds it and Pyodide then shows it."""
    if v is None:
        return JS_NULL
    if isinstance(v, float) and v.is_integer() and abs(v) <= MAX_SAFE:
        return int(v)
    if isinstance(v, bytes):
        return JsArray(v)
    return v


def _to_js(obj):
    """pyodide.ffi.to_js for what a store sends: a list becomes a JS array (statements stay as they are)."""
    if isinstance(obj, (list, tuple)):
        return JsArray(obj)
    if isinstance(obj, (str, int, float, bool)) or obj is JS_NULL or isinstance(obj, Statement):
        return obj
    raise TypeError(f"this fake converts lists only, not {type(obj).__name__}")


ffi = SimpleNamespace(jsnull=JS_NULL, to_js=_to_js, JsException=JsException)


def _bind_value(v):
    if v is None:
        raise JsException("D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'")
    if v is JS_NULL:
        return None
    if isinstance(v, bool):
        return int(v)
    if isinstance(v, int):
        if abs(v) > MAX_SAFE:
            raise JsException("D1_TYPE_ERROR: Type 'bigint' not supported for value '%d'" % v)
        return v
    if isinstance(v, (str, float)):
        return v
    raise JsException(f"D1_TYPE_ERROR: Type '{type(v).__name__}' not supported for value '{v!r}'")


class Statement:
    """A D1PreparedStatement: only methods, run when awaited."""

    def __init__(self, db: "FakeD1", sql: str, params: tuple = ()):
        self._db, self._sql, self._params = db, sql, params

    def bind(self, *values, **named):
        if named:
            raise JsException("D1_ERROR: named parameters are not supported")
        if len(values) > MAX_PARAMS:
            raise JsException(f"D1_ERROR: too many SQL variables: {len(values)} > {MAX_PARAMS}")
        return Statement(self._db, self._sql, tuple(_bind_value(v) for v in values))

    async def all(self):
        await asyncio.sleep(0)
        return self._db._result(*self._db._execute(self._sql, self._params))

    run = all                                  # D1: run() is all() under another name

    async def first(self, column=None):
        await asyncio.sleep(0)
        _, rows, _ = self._db._execute(self._sql, self._params)
        if not rows:
            return JS_NULL
        row = rows[0]
        if column is None:
            return JsObject(**{k: _to_js_value(v) for k, v in row.items()})
        if column not in row:
            raise JsException(f"D1_ERROR: Column not found: {column}")
        return _to_js_value(row[column])

    async def raw(self):
        await asyncio.sleep(0)
        _, rows, _ = self._db._execute(self._sql, self._params)
        return JsArray(JsArray(_to_js_value(v) for v in r.values()) for r in rows)


class FakeD1:
    """The binding (`env.DB`). `sqlite` is the database behind it, for tests that look underneath."""

    _DENIED = {sqlite3.SQLITE_PRAGMA: "PRAGMA", sqlite3.SQLITE_TRANSACTION: "a transaction statement",
               sqlite3.SQLITE_SAVEPOINT: "SAVEPOINT", sqlite3.SQLITE_ATTACH: "ATTACH",
               sqlite3.SQLITE_DETACH: "DETACH"}

    def __init__(self, path=":memory:"):
        self.sqlite = sqlite3.connect(str(path), isolation_level=None, check_same_thread=False)
        self.sqlite.row_factory = sqlite3.Row
        self.sqlite.execute("PRAGMA foreign_keys=ON")        # D1 enforces foreign keys by default
        self._inside = False                                 # True while the fake itself opens or ends a batch
        self.sqlite.set_authorizer(self._authorize)
        self.queries = 0                                     # statements run, for tests that count round trips

    def _authorize(self, action, arg1, arg2, dbname, source):
        if action in self._DENIED and not self._inside:
            return sqlite3.SQLITE_DENY
        return sqlite3.SQLITE_OK

    def _own(self, sql):
        self._inside = True
        try:
            self.sqlite.execute(sql)
        finally:
            self._inside = False

    # the binding's methods

    def prepare(self, sql: str) -> Statement:
        if not isinstance(sql, str):
            raise JsException("D1_TYPE_ERROR: the query must be a string")
        return Statement(self, sql)

    async def batch(self, statements):
        await asyncio.sleep(0)
        if not isinstance(statements, JsArray):
            raise JsException("D1_TYPE_ERROR: batch() takes a JavaScript array of statements (use to_js)")
        if not all(isinstance(s, Statement) for s in statements):
            raise JsException("D1_TYPE_ERROR: batch() takes prepared statements only")
        self._own("BEGIN")
        try:
            out = [self._result(*self._execute(s._sql, s._params)) for s in statements]
            self._own("COMMIT")
        except BaseException:
            if self.sqlite.in_transaction:
                self._own("ROLLBACK")
            raise
        return JsArray(out)

    async def exec(self, sql: str):
        await asyncio.sleep(0)
        started, count = time.monotonic(), 0
        for line in sql.split("\n"):
            if not line.strip():
                continue
            self._execute(line, ())
            count += 1
        return JsObject(count=count, duration=round((time.monotonic() - started) * 1000, 3))

    def withSession(self, constraint=None):      # noqa: N802 (D1's own name)
        return self                              # one database here: every session sees every write

    # underneath

    def _execute(self, sql, params):
        if len(params) > MAX_PARAMS:
            raise JsException(f"D1_ERROR: too many SQL variables: {len(params)} > {MAX_PARAMS}")
        if _NAMED.search(re.sub(r"'(?:[^']|'')*'", "", sql)):
            raise JsException("D1_ERROR: named parameters are not supported")
        self.queries += 1
        try:
            before = self.sqlite.total_changes
            cur = self.sqlite.execute(sql, params)
            rows = [dict(r) for r in cur.fetchall()]
            changed = self.sqlite.total_changes - before
        except sqlite3.Error as e:            # also several statements at once, or the wrong number of values
            raise JsException(f"D1_ERROR: {e}") from None
        return cur, rows, changed

    def _result(self, cur, rows, changed):
        meta = JsObject(served_by="fake-d1", duration=0, changes=changed, last_row_id=cur.lastrowid or 0,
                        changed_db=changed > 0, size_after=0, rows_read=len(rows), rows_written=changed)
        return JsObject(success=True, meta=meta,
                        results=JsArray(JsObject(**{k: _to_js_value(v) for k, v in r.items()}) for r in rows))
