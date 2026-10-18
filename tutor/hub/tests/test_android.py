"""The Android app's server side (P23, DESIGN-C2C3-SPECS item 15): hello's `apk {latest, min}` from two plain
settings; the APK's own page (https://appassets.androidplatform.net) may call the hub, and online only when
TUTOR_ORIGINS names it (staging does); /get is served as a static page; the worker's build leaves the APK copy of
the app without staff pages. No network."""
import hashlib
import json
import tomllib
from pathlib import Path

from fastapi.testclient import TestClient

from tutor_hub.config import Config
from tutor_hub.server import create_app

TUTOR = Path(__file__).resolve().parents[2]
APK_ORIGIN = "https://appassets.androidplatform.net"


def test_hello_has_no_apk_until_a_version_is_set(hub_client):
    assert hub_client.get("/api/hello").json()["apk"] is None


def test_hello_carries_the_latest_and_the_oldest_allowed_version(cfg, monkeypatch):
    monkeypatch.setenv("TUTOR_APK_LATEST", "1.2.0")
    monkeypatch.setenv("TUTOR_APK_MIN", "1.0")
    c = Config.from_env(data=cfg.data)
    assert (c.apk_latest, c.apk_min) == ("1.2.0", "1.0")
    with TestClient(create_app(c)) as client:
        assert client.get("/api/hello").json()["apk"] == {"latest": "1.2.0", "min": "1.0"}
    monkeypatch.setenv("TUTOR_APK_LATEST", "1.2.0-beta; drop")
    assert Config.from_env(data=cfg.data).apk_latest is None       # anything but a version is no version


def test_the_apk_page_may_call_the_hub(hub_client):
    r = hub_client.get("/api/hello", headers={"Origin": APK_ORIGIN})
    assert r.headers.get("access-control-allow-origin") in ("*", APK_ORIGIN)


def test_online_only_the_origins_named_and_staging_names_the_apk(cfg):
    cfg.home = "online"
    cfg.origins = ()
    with TestClient(create_app(cfg)) as client:
        assert "access-control-allow-origin" not in client.get("/api/hello", headers={"Origin": APK_ORIGIN}).headers
    cfg.origins = (APK_ORIGIN,)
    with TestClient(create_app(cfg)) as client:
        r = client.get("/api/hello", headers={"Origin": APK_ORIGIN})
        assert r.headers["access-control-allow-origin"] == APK_ORIGIN
        assert "access-control-allow-origin" not in client.get("/api/hello", headers={"Origin": "https://evil.example"}).headers
    staging = tomllib.loads((TUTOR / "worker" / "wrangler.toml").read_text())["vars"]
    assert staging["TUTOR_ORIGINS"] == APK_ORIGIN


def test_get_is_a_static_page_and_any_apk_there_matches_its_record(hub_client):
    r = hub_client.get("/get/")              # the site's page now (WEBSITE.md W3); app/get holds only a release's files
    assert r.status_code == 200 and 'lang="fa-AF"' in r.text and "default-src 'none'" in r.headers["content-security-policy"]
    get = TUTOR / "app" / "get"
    assert not (get / "index.html").exists() and not (get / "get.js").exists()
    apks = list(get.glob("*.apk")) if get.is_dir() else []   # none until a release puts one there with apk.json (docs/HOSTING.md)
    if apks:
        info = json.loads((get / "apk.json").read_text())
        assert [a.name for a in apks] == [info["file"]] and info["file"] == f"qalam-{info['version']}.apk"
        data = apks[0].read_bytes()
        assert len(data) == info["size"] < 25 * 1024 * 1024                  # a Worker static asset: under 25 MiB
        assert hashlib.sha256(data).hexdigest() == info["sha256"]


def test_the_apk_copy_of_the_app_leaves_out_the_staff_pages():
    sync = (TUTOR / "android" / "sync-web.sh").read_text()
    for gone in ('"$OUT/admin"', '"$OUT/teacher"', '"$OUT/review"', '"$OUT/get"', '"$OUT/tests"'):
        assert gone in sync
    gradle = (TUTOR / "android" / "app" / "build.gradle").read_text()
    assert "QALAM_KEYSTORE_FILE" in gradle and "ANDROID_KEYSTORE" not in gradle          # never Sehat's keys


def test_apk_record_puts_a_signed_apk_on_get_with_its_fingerprint(tmp_path):
    import importlib.util
    spec = importlib.util.spec_from_file_location("apk_record", TUTOR / "tools" / "apk_record.py")
    tool = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tool)
    apk = tmp_path / "signed.apk"
    apk.write_bytes(b"PK\x03\x04" + b"x" * 100)
    get = tmp_path / "get"
    get.mkdir()
    (get / "qalam-0.0.1.apk").write_bytes(b"old")
    info = tool.record(apk, "0.1.0", "ab:" * 31 + "ab", get=get)
    assert info["file"] == "qalam-0.1.0.apk" and info["size"] == 104 and info["cert"].startswith("AB:")
    assert sorted(p.name for p in get.iterdir()) == ["apk.json", "qalam-0.1.0.apk"]
    for bad in (("1.0-beta", ""), ("1.0", "not a cert")):
        try:
            tool.record(apk, *bad, get=get)
            raise AssertionError(bad)
        except ValueError:
            pass
