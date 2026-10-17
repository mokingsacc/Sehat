"""A smoke test over HTTP against any running Qalam: the village hub, `pywrangler dev`, or the staging Worker.

    python3 tests/smoke_http.py https://qalam-staging.example.workers.dev [--timings out.json]

Standard library only, so it runs anywhere. It sends nothing personal: no name, and the only questions are a sum
and a lesson question. Each module the server lists is checked; each one it leaves out must answer 404, as a
switched-off module does. Exit status 0 when every check passes. `--timings` writes how long each request took
(milliseconds), for docs/HOSTING.md.

Not collected by pytest (its name does not start with test_): it needs a server.
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request

ROUTES_OF = {      # a route of each module, which must answer 404 while that module is off
    "lessons": ("GET", "/api/packs"),
    "ask": ("GET", "/api/ask/0000000000000000"),
    "print": ("GET", "/api/print/1"),
    "sheets": ("GET", "/api/sheets/maths-7-fractions-add/key?seed=4821"),
    "teacher": ("GET", "/api/m/teacher/me"),
    "photo": ("POST", "/api/m/photo/mark"),
    "plan": ("POST", "/api/m/plan"),
}
SOURCES = {"rules", "maths", "bank", "approved", "ai", "lesson", "none"}


class Smoke:
    def __init__(self, base: str):
        self.base = base.rstrip("/")
        self.timings: list[dict] = []
        self.failed: list[str] = []

    def call(self, method, path, body=None, token=None):
        data = json.dumps(body).encode() if body is not None else None
        headers = {"Content-Type": "application/json", "User-Agent": "qalam-smoke"}
        if token:
            headers["X-Learner-Token"] = token
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=headers)
        t = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                status, raw, ctype = r.status, r.read(), r.headers.get("Content-Type", "")
        except urllib.error.HTTPError as e:
            status, raw, ctype = e.code, e.read(), e.headers.get("Content-Type", "")
        ms = round((time.perf_counter() - t) * 1000, 1)
        self.timings.append({"method": method, "path": path.split("?")[0], "status": status, "ms": ms})
        doc = json.loads(raw) if "json" in ctype and raw else raw
        return status, doc

    def check(self, what, ok, detail=""):
        print(("ok    " if ok else "FAIL  ") + what + (f"  ({detail})" if detail and not ok else ""))
        if not ok:
            self.failed.append(what)
        return ok

    def run(self):
        s, page = self.call("GET", "/")
        self.check("the app's page", s == 200 and b"<html" in page.lower(), f"{s}")
        s, hello = self.call("GET", "/api/hello")
        if not self.check("GET /api/hello", s == 200 and isinstance(hello, dict) and hello.get("hub"), f"{s} {hello}"):
            return
        on = {m["id"] for m in hello.get("modules", [])}
        print(f"      cohort {hello.get('cohort')}, modules on: {', '.join(sorted(on)) or 'none'}")
        self.check("a cohort", bool(hello.get("cohort")), str(hello.get("cohort")))
        self.check("the hub's version", bool(hello.get("version")))
        for mid, (method, path) in ROUTES_OF.items():
            if mid not in on:
                s, _ = self.call(method, path)
                self.check(f"{mid} is off, so {path.split('?')[0]} is 404", s == 404, f"{s}")

        if "lessons" in on:
            s, packs = self.call("GET", "/api/packs")
            lessons = [l["id"] for p in (packs or {}).get("packs", []) for l in p.get("lessons", [])] if s == 200 else []
            self.check("lessons are listed", s == 200 and len(lessons) == hello.get("lessons", -1) and lessons,
                       f"{s} {len(lessons)} of {hello.get('lessons')}")
            if "maths-7-fractions-add" in lessons:
                s, l = self.call("GET", "/api/lessons/maths-7-fractions-add")
                self.check("a lesson", s == 200 and l.get("steps"), f"{s}")
                pics = [st["picture"] for st in (l or {}).get("steps", []) if isinstance(st, dict) and st.get("picture")]
                if self.check("the lesson has a picture", bool(pics)):
                    s, svg = self.call("GET", pics[0])
                    self.check("its picture loads", s == 200 and len(svg) > 50, f"{s} {pics[0]}")
            s, _ = self.call("GET", "/api/lessons/no-such-lesson")
            self.check("an unknown lesson is 404", s == 404, f"{s}")

        if "sheets" in on:
            s, k = self.call("GET", "/api/sheets/maths-7-fractions-add/key?seed=4821&lang=prs")
            self.check("Check my sheet's key", s == 200 and k.get("items"), f"{s}")
            s, page = self.call("GET", "/api/sheets/maths-7-fractions-add.html?seed=4821&lang=prs")
            self.check("the sheet, for the browser to print", s == 200 and b"M7-03-48217" in (page or b""), f"{s}")

        # a learner joins with consent (a band, a language and an alias picture: nothing personal), asks, sends
        # events, then deletes herself, so each run leaves nothing behind
        s, c = self.call("GET", f"/api/consent?lang=en&version={hello.get('consent')}")
        self.check("the consent text hello names", s == 200 and set(c.get("rows", {})) == {"does", "keeps", "sees", "stop"},
                   f"{s}")
        s, j = self.call("POST", "/api/join", {"band": "s1", "lang": "en", "picture": "key",
                                                "consent": {"kind": "guardian-on-phone", "version": hello.get("consent")}})
        if not self.check("a learner joins", s == 200 and j.get("token") and j.get("number"), f"{s} {j}"):
            return
        t = j["token"]
        if "ask" in on:
            if hello.get("home") == "online":       # a question may reach the AI provider there: only with consent
                s, _ = self.call("POST", "/api/ask", {"text": "۱ + ۱", "lang": "prs"})
                self.check("online, Ask without a learner is refused", s == 401, f"{s}")
            s, a = self.call("POST", "/api/ask", {"text": "۱/۲ + ۱/۴ چند می‌شود؟", "lang": "prs", "year": 7}, token=t)
            self.check("Ask works out a sum exactly", s == 200 and a.get("source") == "maths", f"{s} {a}")
            if s == 200:
                s2, st = self.call("GET", f"/api/ask/{a['id']}")
                self.check("the question's status", s2 == 200 and st.get("status"), f"{s2}")
            s, a = self.call("POST", "/api/ask", {"text": "Why does water boil?", "lang": "en", "year": 7,
                                                  "subject": "science"}, token=t)
            self.check("Ask answers a lesson question", s == 200 and a.get("source") in SOURCES, f"{s} {a}")
            s, _ = self.call("POST", "/api/ask", {"text": "", "lang": "prs"}, token=t)
            self.check("an empty question is refused", s == 422, f"{s}")

        now = time.strftime("%Y-%m-%dT%H:%M", time.gmtime())
        evs = [{"at": now, "verb": "lesson.start", "object": "maths-7-fractions-add"},
               {"at": now, "verb": "check.done", "object": "maths-7-fractions-add", "value": 75}]
        s, _ = self.call("POST", "/api/events", {"events": evs})
        self.check("events without a learner are refused", s == 401, f"{s}")
        s, r = self.call("POST", "/api/events", {"events": evs}, token=t)
        self.check("events from a phone's queue", s == 200 and r == {"saved": 2, "expired": 0}, f"{s} {r}")
        s, _ = self.call("POST", "/api/events", {"events": [dict(evs[0], note="free text")]}, token=t)
        self.check("an event with free text is refused", s == 422, f"{s}")
        s, _ = self.call("POST", "/api/events", {"events": [dict(evs[0], verb="print.queued", value=1)]}, token=t)
        self.check("a hub-only verb from a phone is refused", s == 422, f"{s}")
        s, r = self.call("DELETE", "/api/me", token=t)
        self.check("she deletes her record", s == 200 and r == {"deleted": True}, f"{s} {r}")
        s, _ = self.call("GET", "/api/me", token=t)
        self.check("and it is gone", s == 401, f"{s}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("base", help="the server's address, such as http://127.0.0.1:8787")
    ap.add_argument("--timings", help="write each request's time (ms) to this JSON file")
    a = ap.parse_args(argv)
    smoke = Smoke(a.base)
    smoke.run()
    if a.timings:
        with open(a.timings, "w", encoding="utf-8") as f:
            json.dump(smoke.timings, f, indent=1)
    print(f"{len(smoke.timings)} requests, {len(smoke.failed)} failed" + (f": {', '.join(smoke.failed)}"
                                                                           if smoke.failed else ""))
    return 1 if smoke.failed else 0


if __name__ == "__main__":
    sys.exit(main())
