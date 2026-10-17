"""The hub serves the same tree as the Worker (WEBSITE.md 2.2 and 2.8): the website at /, the app at /app/, the voice
clips at /audio/, and the staff pages and /get/ at their old addresses. worker/build.py copies that tree into its
static assets (tools/make_site.py `assemble`); the hub renders only the site's own files, once per process into a
folder of its own, and serves everything else from app/ as it is on disk, so a voice pack or an APK written there
is served at once:

    /                     the site's pages (/m and the 404 page among them), /sw.js and /manifest.webmanifest
                          (make_site.site_root)
    /get/                 the site's page (naming the APK app/get/apk.json named when the hub started), and the APK
                          and apk.json a release put in app/get/ (W3)
    /app/                 app/, without its tests, its clips and the folders below
    /audio/               app/audio/
    /teacher/ /admin/ /review/
                          app/<folder>/, with every ../ in an .html or .js file read as /app/ (make_site.rewrite)

The site's pages carry their own headers (make_site.headers: a CSP of hashes, no-referrer, the Permissions-Policy,
X-Frame-Options); StaffHeaders in server.py still adds the staff pages' headers, and the app gets none, as before
(the review page frames it). An address without its last slash (/app, /teacher) goes to the one with it.
"""
from __future__ import annotations

import atexit
import importlib.util
import shutil
import tempfile
from pathlib import Path

from starlette.exceptions import HTTPException
from starlette.responses import FileResponse, RedirectResponse, Response
from starlette.staticfiles import StaticFiles

TUTOR = Path(__file__).resolve().parents[2]
MAKE_SITE = TUTOR / "tools" / "make_site.py"

_tool = None
_roots: dict[str, tuple[Path, list[tuple[bytes, bytes]]]] = {}


def make_site():
    """tools/make_site.py, loaded once (it is a script, not a package)."""
    global _tool
    if _tool is None:
        spec = importlib.util.spec_from_file_location("qalam_make_site", MAKE_SITE)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _tool = mod
    return _tool


def site_root(app_dir: Path, release: bool = False) -> tuple[Path, list[tuple[bytes, bytes]]]:
    """The site's files for this app folder, rendered once per process (the price tags read the app's files), and the
    headers its pages carry. A page the lint refuses stops the hub here, as it stops the Worker's build."""
    key = f"{app_dir.resolve()}|{release}"
    if key not in _roots:
        ms = make_site()
        out = Path(tempfile.mkdtemp(prefix="qalam-site-"))
        atexit.register(shutil.rmtree, out, True)
        report = ms.site_root(out, app_dir, release=release)
        hashes = {k: set(v) for k, v in report["hashes"].items()}
        _roots[key] = (out, [(k.lower().encode(), v.encode()) for k, v in ms.headers(hashes)])
    return _roots[key]


class SiteFiles(StaticFiles):
    """The site at /: its pages with the site's headers; /app, /teacher and the like without their slash go to it."""

    def __init__(self, *, directory: Path, headers, folders, apk_dir: Path | None = None):
        super().__init__(directory=directory, html=True)       # html: a missing file answers 404.html, as online
        self.site_headers = headers
        self.folders = set(folders)
        self.apk_dir = apk_dir

    async def get_response(self, path: str, scope) -> Response:
        if path.split("/", 1)[0] in ("api", "v"):                  # the API's own 404, in JSON, never the site's page
            raise HTTPException(status_code=404)
        if path in self.folders:
            q = scope.get("query_string", b"").decode("latin-1")
            return RedirectResponse(f"/{path}/" + (f"?{q}" if q else ""), status_code=307)
        if path.split("/", 1)[0] == "get" and self.apk_dir and (self.apk_dir / path[4:]).is_file() \
                and make_site().GET_FILES.match(path[4:]):
            return FileResponse(self.apk_dir / path[4:])            # the release's APK and apk.json
        if "." not in path.rsplit("/", 1)[-1] and Path(self.directory, path + ".html").is_file():
            path += ".html"                                         # /m, as Workers static assets serve m.html
        r = await super().get_response(path, scope)
        if r.media_type == "text/html" or r.headers.get("content-type", "").startswith("text/html"):
            r.headers.update({k.decode(): v.decode() for k, v in self.site_headers})
        return r


class AppFiles(StaticFiles):
    """app/ at /app/, without what has an address of its own (or none): the tests, the clips, the moved folders."""

    def __init__(self, *, directory: Path, hidden):
        super().__init__(directory=directory, html=True)
        self.hidden = set(hidden)

    async def get_response(self, path: str, scope) -> Response:
        if path.split("/", 1)[0] in self.hidden:
            raise HTTPException(status_code=404)
        return await super().get_response(path, scope)


class MovedFiles(StaticFiles):
    """A staff page or /get/ at its old address, its files still in app/<folder>: ../ means /app/ (make_site.rewrite)."""

    async def get_response(self, path: str, scope) -> Response:
        r = await super().get_response(path, scope)
        if isinstance(r, FileResponse) and Path(r.path).suffix in (".html", ".js"):
            text = make_site().rewrite(Path(r.path).read_text(encoding="utf-8"))
            return Response(text, status_code=r.status_code, media_type=r.media_type,
                            headers={"cache-control": "no-cache"})
        return r


def mount(app, app_dir: Path, release: bool = False) -> None:
    """Every static mount, after the API's routes (server.py create_app). `release`: the catalogue lists only the
    lessons a release hub serves."""
    ms = make_site()
    root, headers = site_root(app_dir, release)
    app.mount("/fonts", StaticFiles(directory=app_dir / "fonts"), name="fonts")
    app.mount("/app", AppFiles(directory=app_dir, hidden=(*ms.MOVED, "tests", "audio", "get")), name="app")
    if (app_dir / "audio").is_dir():
        app.mount("/audio", StaticFiles(directory=app_dir / "audio"), name="audio")
    for d in ms.MOVED:
        if (app_dir / d).is_dir():
            app.mount(f"/{d}", MovedFiles(directory=app_dir / d, html=True), name=d)
    app.mount("/", SiteFiles(directory=root, headers=headers, folders=("app", *ms.MOVED), apk_dir=app_dir / "get"),
              name="site")
