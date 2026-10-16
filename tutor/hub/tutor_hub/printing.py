"""Sending sheets to the printer: press Print on a phone, the page comes out of the hub's printer.

Two ways out:
- cups:   the hub's printer through CUPS (`lp`). Any IPP Everywhere / AirPrint / Mopria printer works driverless
          over USB or Wi-Fi (setup/printer.sh adds it). An ink-tank printer suits solar power; a laser does not.
- outbox: PDFs are saved in the hub's outbox folder instead (no printer yet, testing, or to copy to a USB stick).
- off:    no printer and no outbox (the online Worker, which lacks `printer`, so the print module is off there).

One job prints at a time, in order. A child's name, if they chose to have it printed, is used for that one page
and never written down.
"""
import logging
import queue
import shutil
import subprocess
import threading
import time
from pathlib import Path

log = logging.getLogger("tutor.print")


class Printer:
    def __init__(self, backend: str = "auto", name: str | None = None, outbox: Path | None = None):
        if backend == "auto":
            backend = "cups" if shutil.which("lp") else "outbox"
        self.backend = backend
        self.name = name
        self.outbox = Path(outbox) if outbox else None
        if self.outbox and backend != "off":
            self.outbox.mkdir(parents=True, exist_ok=True)

    def status(self) -> dict:
        """{'ok': can print now, 'state': ready / busy / off / outbox, 'name': ..., 'detail': plain words}."""
        if self.backend == "off":
            return {"ok": False, "state": "off", "name": None, "detail": "no printer here"}
        if self.backend == "outbox":
            return {"ok": True, "state": "outbox", "name": "outbox", "detail": "PDFs are saved on the hub"}
        try:
            name = self.name or self._default()
            if not name:
                return {"ok": False, "state": "off", "name": None, "detail": "no printer is set up on the hub"}
            out = subprocess.run(["lpstat", "-p", name], capture_output=True, text=True, timeout=5)
        except (OSError, subprocess.SubprocessError) as e:
            return {"ok": False, "state": "off", "name": self.name, "detail": f"cannot ask CUPS: {e}"}
        text = (out.stdout + out.stderr).lower()
        if out.returncode != 0 or "disabled" in text:
            return {"ok": False, "state": "off", "name": name, "detail": (out.stdout + out.stderr).strip()[:200]}
        return {"ok": True, "state": "busy" if "printing" in text else "ready", "name": name, "detail": ""}

    def _default(self) -> str | None:
        out = subprocess.run(["lpstat", "-d"], capture_output=True, text=True, timeout=5)
        # "system default destination: Printer_Name"
        return out.stdout.split(":", 1)[1].strip() if ":" in out.stdout else None

    def send(self, pdf: bytes, *, copies: int, title: str) -> tuple[bool, str]:
        copies = max(1, int(copies))
        if self.backend == "off":
            return False, "no printer here"
        if self.backend == "outbox":
            stamp = time.strftime("%Y%m%d-%H%M%S")
            safe = "".join(c if c.isalnum() or c in "-_" else "-" for c in title)[:60]
            f = self.outbox / f"{stamp}-{safe}-x{copies}.pdf"
            f.write_bytes(pdf)
            return True, str(f)
        cmd = ["lp", "-n", str(copies), "-t", title[:60], "-o", "media=A4", "-o", "fit-to-page"]
        if self.name:
            cmd[1:1] = ["-d", self.name]
        try:
            out = subprocess.run(cmd + ["-"], input=pdf, capture_output=True, timeout=60)
        except (OSError, subprocess.SubprocessError) as e:
            return False, f"could not reach the printer: {e}"
        msg = (out.stdout or out.stderr).decode("utf-8", "replace").strip()
        return out.returncode == 0, msg[:200]


class PrintQueue:
    """A background worker that renders and prints one job at a time."""

    def __init__(self, store, printer: Printer, render):
        self.store, self.printer, self.render = store, printer, render
        self.q: queue.Queue = queue.Queue()
        self.thread = threading.Thread(target=self._run, name="print-queue", daemon=True)
        self.thread.start()

    def add(self, job_id: int, spec: dict):
        self.q.put((job_id, spec))

    def _run(self):
        while True:
            job_id, spec = self.q.get()
            try:
                self.store.set_print(job_id, "printing")
                pdf, pages = self.render(spec)
                ok, detail = self.printer.send(pdf, copies=spec["copies"], title=spec["title"])
                status = ("saved" if self.printer.backend == "outbox" else "done") if ok else "failed"
                self.store.set_print(job_id, status, detail=detail, pages=pages)
            except Exception as e:   # one bad job must never stop the queue
                log.exception("print job %s failed", job_id)
                self.store.set_print(job_id, "failed", detail=str(e)[:200])
            finally:
                spec.pop("name", None)
                self.q.task_done()

    def wait(self, timeout: float = 30.0):
        """For tests: block until every queued job is finished."""
        end = time.monotonic() + timeout
        while self.q.unfinished_tasks and time.monotonic() < end:
            time.sleep(0.05)
