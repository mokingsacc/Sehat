"""The 60-learner load test (P24, BUILD-PLAN 8's pilot gate): a whole class opening Qalam at the same minute.

    python3 tools/load_test.py                       60 learners, the village hub (SQLite) and online (the D1 fake)
    python3 tools/load_test.py --learners 120 --store d1 --json out.json

Each learner is her own phone (her own address on the hub's Wi-Fi), and all of them start together, which is harder
than a real lesson, where phones arrive over a few minutes. Each one: hello, joins with consent (a band, a language
and an alias picture), her record, the lesson list, a lesson, a sheet's key, the school day, a sum and a lesson
question for Ask, three batches of events, a goal for "I want to learn this", and the hello a phone sends when it
comes back. The hub's own app runs in this process with the fake AI provider: no network, nothing personal sent.
Online is the hub's app on D1Store over the test fake (SQLite behind D1's call shape), as test_worker.py runs it,
which counts the D1 queries a class costs, the number that matters for D1's daily limits (docs/HOSTING.md); it
does not measure Cloudflare's own CPU time, which only `tutor-worker.yml`'s measurements on staging can.

Prints how many requests failed, the times (median, 95th percentile, slowest) and, online, D1 queries per learner.
Exit status 0 when no request failed.
"""
import argparse
import asyncio
import json
import os
import statistics
import sys
import tempfile
import time
from pathlib import Path

TUTOR = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(TUTOR / "hub"), str(TUTOR / "hub" / "tests")]

import httpx  # noqa: E402

STAGING = "qg1j2918yx"
SETTINGS = ("TUTOR_HOME", "TUTOR_LACKS", "TUTOR_COHORT", "TUTOR_RELEASE", "TUTOR_AI_PROVIDER")


def make_app(store_kind: str, data: Path, undo: list):
    """The app, and its D1 query counter online; `undo` collects what puts the counting back (run() calls it)."""
    from tutor_hub.config import Config
    from tutor_hub.server import create_app
    for k in SETTINGS:
        os.environ.pop(k, None)
    os.environ["TUTOR_AI_PROVIDER"] = "fake"
    counter = None
    if store_kind == "d1":
        from fakes.d1 import FakeD1, Statement, ffi
        from tutor_hub.stores import D1Store
        os.environ.update(TUTOR_HOME="online", TUTOR_LACKS="printer,pin", TUTOR_COHORT=STAGING)
        counter = {"queries": 0}
        for name in ("all", "first", "run", "raw"):
            real = getattr(Statement, name)

            async def counted(self, *a, _real=real, **kw):
                counter["queries"] += 1
                return await _real(self, *a, **kw)
            setattr(Statement, name, counted)
            undo.append(lambda name=name, real=real: setattr(Statement, name, real))
        real_batch = FakeD1.batch
        undo.append(lambda: setattr(FakeD1, "batch", real_batch))

        async def batch(self, statements):
            counter["queries"] += 1                    # a batch is one D1 call
            return await real_batch(self, statements)
        FakeD1.batch = batch
        store = D1Store(FakeD1(data / "d1.db"), ffi=ffi)
        return create_app(Config.from_env(data=data), store=store), counter
    return create_app(Config.from_env(data=data, print_backend="outbox", llm_url=None)), counter


async def learner(app, n: int, timings: list, failures: list, pictures: list[str]):
    addr = (f"10.42.{n // 200}.{10 + n % 200}", 40000 + n)
    transport = httpx.ASGITransport(app=app, client=addr)
    async with httpx.AsyncClient(transport=transport, base_url="http://10.42.0.1", timeout=120) as c:
        async def call(method, path, body=None, token=None, ok=(200,)):
            headers = {"X-Learner-Token": token} if token else {}
            t = time.perf_counter()
            r = await c.request(method, path, json=body, headers=headers)
            timings.append((path.split("?")[0], (time.perf_counter() - t) * 1000))
            if r.status_code not in ok:
                failures.append(f"learner {n}: {method} {path} -> {r.status_code} {r.text[:120]}")
            return r

        hello = (await call("GET", "/api/hello")).json()
        on = {m["id"] for m in hello["modules"]}
        j = await call("POST", "/api/join", {"band": "s1", "lang": ("prs", "ps")[n % 2], "picture": pictures[n % len(pictures)],
                                             "consent": {"kind": "guardian-on-phone", "version": hello["consent"]}})
        if j.status_code != 200:
            return
        tok = j.json()["token"]
        await call("GET", "/api/me", token=tok)
        await call("GET", "/api/packs")
        await call("GET", "/api/lessons/maths-7-fractions-add")
        if "sheets" in on:
            await call("GET", f"/api/sheets/maths-7-fractions-add/key?seed={1000 + n}&lang=prs")
        if "timetable" in on:
            await call("GET", "/api/m/timetable?band=s1", token=tok)
        if "ask" in on:
            await call("POST", "/api/ask", {"text": "۱/۲ + ۱/۴ چند می‌شود؟", "lang": "prs", "year": 7}, token=tok)
            await call("POST", "/api/ask", {"text": "چرا یخ آب می‌شود؟", "lang": "prs", "year": 7,
                                            "subject": "science"}, token=tok)
        now = time.strftime("%Y-%m-%dT%H:%M", time.gmtime())
        for verb, value in (("lesson.start", None), ("lesson.done", 3), ("check.done", 75)):
            ev = {"at": now, "verb": verb, "object": "maths-7-fractions-add"}
            if value is not None:
                ev["value"] = value
            await call("POST", "/api/events", {"events": [ev]}, token=tok)
        if "plan" in on:
            await call("POST", "/api/m/plan", {"goal": "کسرها", "lang": "prs", "band": "s1"}, token=tok)
        await call("GET", "/api/hello")


async def run(store_kind: str, learners: int) -> dict:
    from tutor_hub.learners import load_aliases
    saved, undo = {k: os.environ.get(k) for k in SETTINGS}, []
    try:
        with tempfile.TemporaryDirectory() as tmp:
            app, counter = make_app(store_kind, Path(tmp), undo)
            timings, failures = [], []
            async with app.router.lifespan_context(app):
                q0 = counter["queries"] if counter else 0
                t = time.perf_counter()
                await asyncio.gather(*(learner(app, n, timings, failures, load_aliases()) for n in range(learners)))
                wall = time.perf_counter() - t
    finally:                                   # leave the process as it was (the test suite runs this in-process)
        for f in undo:
            f()
        for k, v in saved.items():
            os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)
        ms = sorted(m for _, m in timings)
        paths = sorted({p for p, _ in timings})
        out = {"store": store_kind, "learners": learners, "requests": len(ms), "failed": len(failures),
               "wall_s": round(wall, 2), "median_ms": round(statistics.median(ms), 1),
               "p95_ms": round(ms[int(len(ms) * 0.95) - 1], 1), "max_ms": round(ms[-1], 1),
               "routes": paths, "failures": failures[:10]}
        if counter:
            out["d1_queries"] = counter["queries"] - q0
            out["d1_queries_per_learner"] = round(out["d1_queries"] / learners, 1)
        return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--learners", type=int, default=60)
    ap.add_argument("--store", choices=("sqlite", "d1", "both"), default="both")
    ap.add_argument("--json", help="write the results to this file")
    a = ap.parse_args(argv)
    results = [asyncio.run(run(s, a.learners)) for s in (("sqlite", "d1") if a.store == "both" else (a.store,))]
    for r in results:
        where = "the village hub (SQLite)" if r["store"] == "sqlite" else "online (D1 fake)"
        print(f"{where}: {r['learners']} learners, {r['requests']} requests in {r['wall_s']} s, {r['failed']} failed; "
              f"median {r['median_ms']} ms, 95% {r['p95_ms']} ms, slowest {r['max_ms']} ms"
              + (f"; {r['d1_queries']} D1 queries ({r['d1_queries_per_learner']} a learner)" if "d1_queries" in r else ""))
        print("  routes: " + ", ".join(r["routes"]))
        for f in r["failures"]:
            print("  " + f)
    if a.json:
        Path(a.json).write_text(json.dumps(results, indent=1), encoding="utf-8")
    return 1 if any(r["failed"] for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())
