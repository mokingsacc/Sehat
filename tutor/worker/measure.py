"""Measure a running Qalam Worker for docs/HOSTING.md: cold start, warm latency, CPU time, memory, bundle size, and
the spike's answers (jsnull, batch with to_js, D1 queries per request). Standard library only.

    python3 measure.py BASE_URL [--first-ms N] [--deploy-log deploy.log] [--tail tail.jsonl] [--d1 "jurisdiction eu"]
                       [--where "Cloudflare (workers.dev)"] [--out measurements.json] [--summary FILE]

Latencies are wall-clock times seen from the machine running this (a GitHub runner in CI), network included.
CPU time comes from `wrangler tail --format json` when the token allows it; the Worker cannot time itself (its clock
stands still while it computes). Sends nothing personal: a sum, lesson reads and hello.
"""
import argparse
import json
import re
import statistics
import time
import urllib.error
import urllib.request


def get(url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method="POST" if data else "GET",
                                 headers={"Content-Type": "application/json", "User-Agent": "qalam-measure"})
    t = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            status, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    return status, raw, (time.perf_counter() - t) * 1000


def spread(ms):
    ms = sorted(ms)
    return {"n": len(ms), "median": round(statistics.median(ms), 1), "p90": round(ms[int(0.9 * (len(ms) - 1))], 1),
            "max": round(ms[-1], 1)} if ms else None


def warm(base):
    runs = {"GET /api/hello": ("/api/hello", None, 20), "GET /api/lessons/{id}": ("/api/lessons/maths-7-fractions-add",
                                                                                  None, 10),
            "POST /api/ask (a sum)": ("/api/ask", {"text": "1/2 + 1/4", "lang": "en"}, 10),
            "GET / (static asset)": ("/", None, 10)}
    out, bad = {}, []
    for name, (path, body, n) in runs.items():
        ms = []
        for _ in range(n):
            s, raw, t = get(base + path, body)
            if s != 200:
                bad.append(f"{name}: {s} {raw[:120]!r}")
            ms.append(t)
        out[name] = spread(ms)
    return out, bad


def deploy_facts(path):
    try:
        text = open(path, encoding="utf-8", errors="replace").read()
    except OSError:
        return {}
    text = re.sub(r"\x1b\[[0-9;]*m", "", text)
    facts = {}
    m = re.search(r"Total Upload:\s*([\d.]+)\s*KiB\s*/\s*gzip:\s*([\d.]+)\s*KiB", text)
    if m:
        facts["upload_kib"], facts["upload_gzip_kib"] = float(m[1]), float(m[2])
    m = re.search(r"Worker Startup Time:\s*(\d+)\s*ms", text)
    if m:
        facts["startup_ms"] = int(m[1])
    m = re.search(r"Total \((\d+) modules\)\s*│\s*│\s*([\d.]+) KiB", text)
    if m:
        facts["modules"], facts["bundle_kib"] = int(m[1]), float(m[2])
    m = re.search(r"Vendored Modules\s*│\s*│\s*([\d.]+) KiB", text)
    if m:
        facts["vendored_kib"] = float(m[1])
    return facts


def tail_facts(path):
    """CPU and wall time per request from `wrangler tail --format json` (one JSON object per event)."""
    try:
        text = open(path, encoding="utf-8", errors="replace").read()
    except OSError:
        return None
    events, dec, i = [], json.JSONDecoder(), 0
    while True:
        j = text.find("{", i)
        if j < 0:
            break
        try:
            obj, i = dec.raw_decode(text, j)
        except ValueError:
            i = j + 1
            continue
        if isinstance(obj, dict) and "outcome" in obj:
            events.append(obj)
    if not events:
        return {"events": 0}
    cpu = [e["cpuTime"] for e in events if isinstance(e.get("cpuTime"), (int, float))]
    wall = [e["wallTime"] for e in events if isinstance(e.get("wallTime"), (int, float))]
    outcomes, by_path = {}, {}
    for e in events:
        outcomes[e["outcome"]] = outcomes.get(e["outcome"], 0) + 1
        url = ((e.get("event") or {}).get("request") or {}).get("url") or ""
        path = re.sub(r"^https?://[^/]+", "", url).split("?")[0]
        path = re.sub(r"/api/ask/[0-9a-f]+", "/api/ask/{token}", re.sub(r"/api/lessons/[^/]+", "/api/lessons/{id}", path))
        if isinstance(e.get("cpuTime"), (int, float)):
            by_path.setdefault(path or "?", []).append(e["cpuTime"])
    return {"events": len(events), "outcomes": outcomes, "cpu_ms": spread(cpu), "wall_ms": spread(wall),
            "cpu_first_ms": cpu[0] if cpu else None, "cpu_by_path": {p: spread(v) for p, v in sorted(by_path.items())}}


def table(rows):
    return "\n".join(["| What | Measured |", "|---|---|"] + [f"| {a} | {b} |" for a, b in rows])


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("base")
    ap.add_argument("--first-ms", type=float, help="the first request after the deploy (a cold isolate), in ms")
    ap.add_argument("--deploy-log")
    ap.add_argument("--tail")
    ap.add_argument("--d1", default="")
    ap.add_argument("--where", default="")
    ap.add_argument("--out")
    ap.add_argument("--summary")
    a = ap.parse_args(argv)
    base = a.base.rstrip("/")

    s, raw, _ = get(base + "/api/_spike")
    spike = json.loads(raw) if s == 200 else {"status": s, "body": raw[:200].decode("utf-8", "replace")}
    s, raw, _ = get(base + "/api/_spike?n=1001")         # past the Free plan's documented 50, to its 1000
    probe = json.loads(raw).get("queries") if s == 200 else {"status": s, "body": raw[:160].decode("utf-8", "replace")}
    lat, bad = warm(base)
    m = {"where": a.where, "d1": a.d1, "first_request_ms": a.first_ms, "warm_ms": lat, "errors": bad,
         "deploy": deploy_facts(a.deploy_log) if a.deploy_log else {}, "tail": tail_facts(a.tail) if a.tail else None,
         "spike": spike, "query_probe": probe}

    d, t, q = m["deploy"], m["tail"] or {}, spike.get("queries", {}) if isinstance(spike, dict) else {}
    rows = [("Where", a.where or "?"), ("D1", a.d1 or "?"),
            ("Cold start (first request after the deploy, hub start included)",
             f"{a.first_ms:.0f} ms" if a.first_ms else "not measured"),
            ("Startup time Cloudflare reports at deploy", f"{d['startup_ms']} ms" if "startup_ms" in d else "not reported"),
            ("Bundle", f"{d['bundle_kib']:.0f} KiB in {d['modules']} modules" if "bundle_kib" in d else "not reported"),
            ("Upload", f"{d['upload_kib']:.0f} KiB, gzip {d['upload_gzip_kib']:.0f} KiB" if "upload_kib" in d
             else "not reported"),
            ("WebAssembly memory (the isolate's linear memory)", f"{spike.get('wasm_memory_mib')} MiB"
             if isinstance(spike, dict) and "wasm_memory_mib" in spike else "not measured")]
    for name, v in lat.items():
        rows.append((f"Warm {name}", f"median {v['median']} ms, p90 {v['p90']} ms, max {v['max']} ms (n={v['n']})"))
    if t.get("cpu_ms"):
        rows.append(("CPU time per request (wrangler tail)", f"median {t['cpu_ms']['median']} ms, p90 "
                     f"{t['cpu_ms']['p90']} ms, max {t['cpu_ms']['max']} ms (n={t['cpu_ms']['n']}); "
                     f"outcomes {t['outcomes']}"))
        for p, v in t.get("cpu_by_path", {}).items():
            rows.append((f"CPU {p}", f"median {v['median']} ms, p90 {v['p90']} ms, max {v['max']} ms (n={v['n']})"))
    else:
        rows.append(("CPU time per request", "not measured (no tail events)" if a.tail else "not measured"))
    if isinstance(spike, dict) and "jsnull" in spike:
        rows += [("Python", spike.get("python")), ("pyodide.ffi.jsnull exists", spike["jsnull"]),
                 ("A to_js list works with batch()", spike.get("batch_to_js")),
                 ("D1 queries one request may make", f"{q.get('single_after_batch')} of {q.get('tried')} single "
                  f"queries after one batch; stopped by: {q.get('stopped_by') or 'nothing'}"),
                 ("Probing to 1001 queries in one request", str(probe))]
    if bad:
        rows.append(("Errors during the warm runs", "; ".join(bad[:5])))
    md = "### Qalam staging: measurements\n\n" + table(rows) + "\n"
    print(md)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            json.dump(m, f, indent=1)
    if a.summary:
        with open(a.summary, "a", encoding="utf-8") as f:
            f.write(md + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
