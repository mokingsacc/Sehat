"""Put a signed Qalam APK on /get (P23): copies it to app/get/qalam-<version>.apk and writes app/get/apk.json
{version, file, size, sha256, cert}, which /get/ shows (site/templates/get.html, rendered by tools/make_site.py: "For teachers: check the file"). Any older APK there is
removed. Refuses a file over 25 MiB (a Worker static asset's limit) or a version that is not like 1.2.3.

    python3 tools/apk_record.py path/to/signed.apk --version 0.1.0 --cert "AB:CD:..."

--cert is the signing certificate's SHA-256, as `apksigner verify --print-certs signed.apk` prints it. Then set
TUTOR_APK_LATEST (and TUTOR_APK_MIN when old ones must stop) where the server reads its settings, and commit.
"""
import argparse
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

GET = Path(__file__).resolve().parent.parent / "app" / "get"
LIMIT = 25 * 1024 * 1024


def record(apk: Path, version: str, cert: str = "", get: Path = GET) -> dict:
    if not re.fullmatch(r"\d{1,4}(\.\d{1,4}){0,3}", version):
        raise ValueError("the version is like 1.2.3")
    data = apk.read_bytes()
    if len(data) >= LIMIT:
        raise ValueError("the APK must stay under 25 MiB to be served from the Worker")
    if data[:2] != b"PK":
        raise ValueError("that is not an APK")
    if cert and not re.fullmatch(r"[0-9A-Fa-f:]{64,95}", cert.strip()):
        raise ValueError("the certificate is its SHA-256, hex digits with or without colons")
    name = f"qalam-{version}.apk"
    get.mkdir(parents=True, exist_ok=True)               # since W3 the folder holds only the release's files
    for old in get.glob("qalam-*.apk"):
        old.unlink()
    shutil.copyfile(apk, get / name)
    info = {"version": version, "file": name, "size": len(data), "sha256": hashlib.sha256(data).hexdigest(),
            "cert": cert.strip().upper()}
    (get / "apk.json").write_text(json.dumps(info, indent=1) + "\n", encoding="utf-8")
    return info


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("apk", type=Path)
    ap.add_argument("--version", required=True)
    ap.add_argument("--cert", default="")
    a = ap.parse_args()
    try:
        print(json.dumps(record(a.apk, a.version, a.cert), indent=1))
    except (ValueError, OSError) as e:
        sys.exit(f"apk_record: {e}")
