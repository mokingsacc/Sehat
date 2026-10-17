#!/usr/bin/env python3
"""The school bag's crypto (WEBSITE.md 3.6, W5): @noble/ciphers and @noble/hashes, vendored into app/js/vendor/ as
the very files their npm releases hold, pinned by version and by the registry's sha512 of the tarball.

The app runs these files as they are. One line is changed, and only in @noble/hashes' utils.js: it imports
'@noble/hashes/crypto', a bare name a browser cannot load without a bundler, which becomes './crypto.js' (the same
file, vendored beside it). PATCHES below lists it, and the check applies it before comparing.

    python3 tools/vendor_noble.py           write the files and app/js/vendor/noble.json from the pinned tarballs
    python3 tools/vendor_noble.py --check   fetch the pinned tarballs again, check the registry's sha512, and check
                                            that every vendored file is the tarball's (after the patch); CI runs it

app/tests/bag.test.js checks, with no network, that every vendored file matches the sha256 in noble.json, so a file
changed by hand fails the app's tests as well.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import sys
import tarfile
import urllib.request
from pathlib import Path

TUTOR = Path(__file__).resolve().parents[1]
VENDOR = TUTOR / "app" / "js" / "vendor"
MANIFEST = VENDOR / "noble.json"

PINS = {
    "@noble/ciphers": {
        "version": "1.3.0",
        "integrity": "sha512-2I0gnIVPtfnMw9ee9h1dJG7tp81+8Ob3OJb3Mv37rx5L40/b0i7djjCVvGOVqc9AEIQyvyu1i6ypKdFw8R8gQw==",
        "dir": "noble-ciphers",
        # XChaCha20-Poly1305 and what it needs
        "files": ["esm/chacha.js", "esm/_arx.js", "esm/_poly1305.js", "esm/utils.js", "LICENSE"],
    },
    "@noble/hashes": {
        "version": "1.8.0",
        "integrity": "sha512-jCs9ldd7NwzpgXDIf6P3+NrHh9/sD6CQdxHyjQI+h/6rDNo88ypBxxz45UDuZHz9r3tNz7N/VInSVoVdtXEI4A==",
        "dir": "noble-hashes",
        # PBKDF2, HKDF and HMAC over SHA-256, and what they need
        "files": ["esm/pbkdf2.js", "esm/hkdf.js", "esm/hmac.js", "esm/sha2.js", "esm/_md.js", "esm/_u64.js",
                  "esm/utils.js", "esm/crypto.js", "LICENSE"],
    },
}
PATCHES = {("@noble/hashes", "esm/utils.js"): ("from '@noble/hashes/crypto';", "from './crypto.js';")}


def tarball(name: str, pin: dict) -> bytes:
    """The release's tarball from the npm registry, refused unless its sha512 is the pinned one."""
    url = f"https://registry.npmjs.org/{name}/-/{name.split('/')[1]}-{pin['version']}.tgz"
    with urllib.request.urlopen(url, timeout=60) as r:
        data = r.read()
    got = "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode()
    if got != pin["integrity"]:
        raise SystemExit(f"{name}@{pin['version']}: the registry's tarball is {got}, pinned {pin['integrity']}")
    return data


def files_of(name: str, pin: dict, data: bytes) -> dict[str, bytes]:
    out = {}
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        for f in pin["files"]:
            body = tar.extractfile(f"package/{f}").read()
            patch = PATCHES.get((name, f))
            if patch:
                old, new = patch
                if body.count(old.encode()) != 1:
                    raise SystemExit(f"{name} {f}: the line to patch is not there once")
                body = body.replace(old.encode(), new.encode())
            out[f.removeprefix("esm/")] = body
    return out


def manifest(all_files: dict[str, dict[str, bytes]]) -> dict:
    return {"about": "Vendored by tools/vendor_noble.py: the npm release's files, one import line patched (PATCHES)",
            "packages": {name: {"version": pin["version"], "integrity": pin["integrity"], "dir": pin["dir"],
                                "patched": [f.removeprefix("esm/") for (n, f) in PATCHES if n == name],
                                "files": {f: hashlib.sha256(b).hexdigest() for f, b in sorted(all_files[name].items())}}
                         for name, pin in PINS.items()}}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="compare the vendored files with the pinned tarballs")
    args = ap.parse_args(argv)
    got = {name: files_of(name, pin, tarball(name, pin)) for name, pin in PINS.items()}
    want = manifest(got)
    if args.check:
        bad = []
        for name, pin in PINS.items():
            for f, body in got[name].items():
                p = VENDOR / pin["dir"] / f
                if not p.is_file() or p.read_bytes() != body:
                    bad.append(f"{pin['dir']}/{f}")
            extra = {p.name for p in (VENDOR / pin["dir"]).iterdir()} - set(got[name])
            bad += [f"{pin['dir']}/{f} (not in the release)" for f in sorted(extra)]
        if json.loads(MANIFEST.read_text(encoding="utf-8")) != want:
            bad.append("noble.json")
        if bad:
            print("vendored crypto differs from the pinned releases: " + ", ".join(bad), file=sys.stderr)
            return 1
        print(f"vendored crypto matches {', '.join(f'{n}@{p['version']}' for n, p in PINS.items())}")
        return 0
    for name, pin in PINS.items():
        d = VENDOR / pin["dir"]
        d.mkdir(parents=True, exist_ok=True)
        for p in d.iterdir():
            p.unlink()
        for f, body in got[name].items():
            (d / f).write_bytes(body)
    MANIFEST.write_text(json.dumps(want, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {sum(len(v) for v in got.values())} files and {MANIFEST.relative_to(TUTOR)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
