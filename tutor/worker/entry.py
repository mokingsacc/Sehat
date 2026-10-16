"""Qalam online: the village hub's FastAPI app, unchanged, as a Cloudflare Python Worker (BUILD-PLAN 3.6, P7).

build.py copies the hub's own code (hub/tutor_hub) and its data files next to this file, in the hub's layout, so
the hub's defaults find the migrations, manifests, cohorts and lessons; the app and pictures are static assets.

What differs from the hub, all of it through the hub's existing seams:
- settings come from wrangler.toml's [vars], which build.py also writes next to this file (vars.json), so the app
  can be built when this module is imported: Cloudflare runs the import once at deploy time and keeps a memory
  snapshot, so a new isolate starts with the app, the lessons and the manifests already in memory;
- the store is `D1Store(env.DB)`, which applies tutor/migrations itself when it opens. It gets the D1 binding on
  the first request an isolate serves (bindings do not exist at deploy time), and the plain JavaScript binding
  from `cloudflare:workers`: the SDK's `self.env` wraps bindings in its own Python converters, while D1Store does
  its own conversions (jsnull, to_js, to_py), as its contract and its strict test fake expect;
- `TUTOR_LACKS=printer,pin` switches print and teacher off through their manifests' `needs`;
- the hub starts (store opened, migrations, seeds, prunes, search index) once per isolate, on its first request,
  not in the ASGI lifespan, which the Workers adapter would run around every request.

On staging only (`QALAM_SPIKE = "on"`), `GET /api/_spike` answers the P7 spike's questions about this runtime
(docs/HOSTING.md): does `pyodide.ffi.jsnull` exist, does a `to_js` list work with `batch()`, how many D1 queries one
request may make (`?n=`, at most 1100), and how big the WebAssembly memory is. It reads and writes no table.
"""
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "hub"))
for k, v in json.loads((HERE / "vars.json").read_text(encoding="utf-8")).items():
    os.environ[k] = str(v)

from workers import asgi, import_from_javascript  # noqa: E402

from tutor_hub.config import Config  # noqa: E402
from tutor_hub.server import create_app  # noqa: E402
from tutor_hub.stores import D1Store  # noqa: E402

store = D1Store(None)                         # the binding arrives with the first request
app = create_app(Config.from_env(), store=store)
_started = False


def _env():
    return import_from_javascript("cloudflare:workers").env       # the plain JavaScript env, not the SDK's wrapper


async def _start():
    global _started
    store.db = _env().DB
    await app.state.hub.start()
    _started = True


async def _spike(n: int) -> dict:
    import pyodide.ffi as ffi
    db = _env().DB
    out = {"python": sys.version.split()[0], "jsnull": hasattr(ffi, "jsnull")}
    try:
        res = await db.batch(ffi.to_js([db.prepare("SELECT ? AS a").bind(ffi.jsnull), db.prepare("SELECT 2 AS b")]))
        rows = [r.results.to_py() for r in res]
        out["batch_to_js"] = {"ok": rows[0][0]["a"] is ffi.jsnull and rows[1][0]["b"] == 2, "calls": 1}
    except Exception as e:
        out["batch_to_js"] = {"ok": False, "error": str(e)[:300]}
    done, stop = 0, None
    for _ in range(n):                        # one query at a time, after the batch above
        try:
            await db.prepare("SELECT 1 AS x").first()
            done += 1
        except Exception as e:
            stop = str(e)[:300]
            break
    out["queries"] = {"tried": n, "single_after_batch": done, "stopped_by": stop}
    try:
        import pyodide_js
        out["wasm_memory_mib"] = round(pyodide_js._module.HEAP8.length / 2 ** 20, 1)
    except Exception as e:
        out["wasm_memory_mib"] = f"not readable: {type(e).__name__}"
    out["hub_started_in_this_isolate"] = _started
    return out


async def qalam(scope, receive, send):
    if scope["type"] == "lifespan":           # not acknowledged: the adapter then serves without a lifespan
        return
    if scope["path"] == "/api/_spike" and os.environ.get("QALAM_SPIKE") == "on":
        q = dict(p.split("=", 1) for p in scope.get("query_string", b"").decode().split("&") if "=" in p)
        n = min(int(q["n"]), 1100) if q.get("n", "").isdigit() else 60
        body = json.dumps(await _spike(n)).encode()
        await send({"type": "http.response.start", "status": 200,
                    "headers": [(b"content-type", b"application/json"), (b"cache-control", b"no-store")]})
        await send({"type": "http.response.body", "body": body})
        return
    if not _started:
        # two first requests at once may both start: migrations and seeds are safe to race (stores/migrations.py)
        await _start()
    await app(scope, receive, send)


Default = asgi.entrypoint(qalam)
