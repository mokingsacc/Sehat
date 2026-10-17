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
  not in the ASGI lifespan, which the Workers adapter would run around every request;
- the retention job (P24) is the Worker's cron (`[triggers] crons` in wrangler.toml): `scheduled` runs the hub's own
  `prune()` once a day (expired reset codes, 90-day wishes, old questions, events, AI usage, idle learners, two-year
  logs), since an isolate may live for days without a restart.

On staging only (`QALAM_SPIKE = "on"`), `GET /api/_spike` answers the P7 spike's questions about this runtime
(docs/HOSTING.md): does `pyodide.ffi.jsnull` exist, does a `to_js` list work with `batch()`, how many D1 queries one
request may make (`?n=`, at most 1100), and how big the WebAssembly memory is. It reads and writes no table.
"""
import json
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "hub"))
for k, v in json.loads((HERE / "vars.json").read_text(encoding="utf-8")).items():
    os.environ[k] = str(v)

from workers import asgi, import_from_javascript  # noqa: E402

from tutor_hub.ai import make_provider  # noqa: E402
from tutor_hub.config import Config  # noqa: E402
from tutor_hub.server import create_app  # noqa: E402
from tutor_hub.staff import mode_of as staff_mode  # noqa: E402
from tutor_hub.stores import D1Store  # noqa: E402

store = D1Store(None)                         # the binding arrives with the first request
app = create_app(Config.from_env(), store=store)
_started = False


def _env():
    return import_from_javascript("cloudflare:workers").env       # the plain JavaScript env, not the SDK's wrapper


# staff pages (staff.py): the Access team, its audience and the pepper are Worker secrets Mo sets once Access is in
# place (docs/HOSTING.md); without all three the staff gate stays off. Bindings exist only from the first request.
STAFF_SETTINGS = (("TUTOR_ACCESS_TEAM", "access_team"), ("TUTOR_ACCESS_AUD", "access_aud"),
                  ("TUTOR_STAFF_PEPPER", "staff_pepper"))
# the AI providers' keys (the AI provider switch, docs/HOSTING.md): Worker secrets Mo sets with `wrangler secret
# put`; a cohort picks its provider in the admin panel. Read from the env here, never from D1 or vars
KEY_SETTINGS = (("OPENAI_API_KEY", "openai_key"), ("ANTHROPIC_API_KEY", "anthropic_key"),
                ("GEMINI_API_KEY", "gemini_key"), ("TUTOR_COMPAT_API_KEY", "compat_key"))
# live audio classes (P30a, C6.1): Cloudflare Realtime's app id and secret and its TURN key, Worker secrets Mo sets
# per environment (docs/HOSTING.md, "Live classes: the Realtime set-up"); without the first two `live` stays held off
RTC_SETTINGS = (("TUTOR_RTC_APP", "rtc_app"), ("TUTOR_RTC_SECRET", "rtc_secret"),
                ("TUTOR_RTC_TURN_KEY", "rtc_turn_key"), ("TUTOR_RTC_TURN_SECRET", "rtc_turn_secret"))


async def _start():
    global _started
    env = _env()
    store.db = env.DB
    hub = app.state.hub
    for name, attr in STAFF_SETTINGS + KEY_SETTINGS + RTC_SETTINGS:
        v = getattr(env, name, None)
        if isinstance(v, str) and v:
            setattr(hub.cfg, attr, v)
    hub.staff.mode = staff_mode(hub.cfg)
    # the hub's default provider was made at import, before the secrets could be read: made again with them
    await hub.gateway.aclose()
    hub.gateway.provider = make_provider(hub.cfg)
    await hub.start()
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
    done, stop, t0 = 0, None, time.time()    # a Worker's clock moves only across I/O, so this is D1 wait time
    for _ in range(n):                        # one query at a time, after the batch above
        try:
            await db.prepare("SELECT 1 AS x").first()
            done += 1
        except Exception as e:
            stop = str(e)[:300]
            break
    ms = (time.time() - t0) * 1000
    out["queries"] = {"tried": n, "single_after_batch": done, "stopped_by": stop, "wall_ms": round(ms),
                      "ms_per_query": round(ms / done, 1) if done else None}
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


async def retention():
    """The daily cron: start the hub if this isolate has not (start prunes), else prune."""
    if not _started:
        await _start()
    else:
        await app.state.hub.prune()


class Default(asgi.entrypoint(qalam)):
    async def scheduled(self, *args):          # (controller, env, ctx): nothing from them is needed
        await retention()
