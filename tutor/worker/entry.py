"""Qalam online: the village hub's FastAPI app, unchanged, as a Cloudflare Python Worker (BUILD-PLAN 3.6, P7).

build.py copies the hub's own code (hub/tutor_hub) and its data files next to this file, in the hub's layout, so
the hub's defaults find the migrations, manifests, cohorts and lessons; the app and pictures are static assets.

What differs from the hub, all of it through the hub's existing seams:
- the store is `D1Store(env.DB)`, which applies tutor/migrations itself when it opens. It is given the JavaScript
  binding itself, from `cloudflare:workers`: the SDK's `self.env` wraps bindings in its own Python converters,
  while D1Store does its own conversions (jsnull, to_js, to_py), as its contract and its strict test fake expect;
- settings come from the Worker's vars (wrangler.toml) instead of the hub's environment;
- `TUTOR_LACKS=printer,pin` switches print and teacher off through their manifests' `needs`;
- the hub starts (store opened, migrations, seeds, search index) once per isolate, on its first request, not in
  the ASGI lifespan, which the Workers adapter runs around every request.

On staging only (`QALAM_SPIKE = "on"`), `GET /api/_spike` answers the P7 spike's questions about this runtime
(docs/HOSTING.md): does `pyodide.ffi.jsnull` exist, does a `to_js` list work with `batch()`, how many D1 queries one
request may make, and how big the WebAssembly memory is. It reads nothing and writes nothing.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "hub"))

import json  # noqa: E402
import os  # noqa: E402

from workers import asgi, import_from_javascript  # noqa: E402

from tutor_hub.config import Config  # noqa: E402
from tutor_hub.server import create_app  # noqa: E402
from tutor_hub.stores import D1Store  # noqa: E402

SETTINGS = ("TUTOR_NAME", "TUTOR_COHORT", "TUTOR_AI_PROVIDER", "TUTOR_AI_BUDGET", "TUTOR_AI_LANGS", "TUTOR_LACKS",
            "TUTOR_KEEP_DAYS", "TUTOR_PUBLIC_URL")

_app = None


async def _start():
    env = import_from_javascript("cloudflare:workers").env       # the plain JavaScript env, not the SDK's wrapper
    for k in SETTINGS:
        v = getattr(env, k, None)
        if isinstance(v, str):
            os.environ[k] = v
    app = create_app(Config.from_env(), store=D1Store(env.DB))
    await app.state.hub.start()
    return app


async def _spike() -> dict:
    import pyodide.ffi as ffi
    db = import_from_javascript("cloudflare:workers").env.DB
    out = {"python": sys.version.split()[0], "jsnull": hasattr(ffi, "jsnull")}
    try:
        res = await db.batch(ffi.to_js([db.prepare("SELECT ? AS a").bind(ffi.jsnull), db.prepare("SELECT 2 AS b")]))
        rows = [r.results.to_py() for r in res]
        out["batch_to_js"] = {"ok": rows[0][0]["a"] is ffi.jsnull and rows[1][0]["b"] == 2, "calls": 1}
    except Exception as e:
        out["batch_to_js"] = {"ok": False, "error": str(e)[:300]}
    n, stop = 0, None
    for _ in range(60):                       # one query at a time, after the batch above
        try:
            await db.prepare("SELECT 1 AS x").first()
            n += 1
        except Exception as e:
            stop = str(e)[:300]
            break
    out["queries"] = {"single_after_batch": n, "stopped_by": stop}
    try:
        import pyodide_js
        out["wasm_memory_mib"] = round(pyodide_js._module.HEAP8.length / 2 ** 20, 1)
    except Exception as e:
        out["wasm_memory_mib"] = f"not readable: {type(e).__name__}"
    out["hub_started_in_this_isolate"] = _app is not None
    return out


async def qalam(scope, receive, send):
    global _app
    if scope["type"] == "lifespan":           # not acknowledged: the adapter then serves without a lifespan
        return
    if scope["path"] == "/api/_spike" and getattr(import_from_javascript("cloudflare:workers").env, "QALAM_SPIKE",
                                                  None) == "on":
        body = json.dumps(await _spike()).encode()
        await send({"type": "http.response.start", "status": 200,
                    "headers": [(b"content-type", b"application/json"), (b"cache-control", b"no-store")]})
        await send({"type": "http.response.body", "body": body})
        return
    if _app is None:
        # two first requests at once may both start: migrations and seeds are safe to race (stores/migrations.py)
        _app = await _start()
    await _app(scope, receive, send)


Default = asgi.entrypoint(qalam)
