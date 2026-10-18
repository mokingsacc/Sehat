"""Make and refresh the Quran set, tutor/content/quran/ (P29, C4.7). Every file goes in as downloaded; nothing is typed.

    python3 tools/quran_set.py text --file quran-uthmani.txt --metadata quran-data.xml --edition Uthmani --version 1.1
        the Tanzil text (tanzil.net/download, with its notice block) and Tanzil's metadata, copied byte for byte
    python3 tools/quran_set.py translation --sqlite dari_badkhashani.sqlite --lang prs --key dari_badkhashani \\
            --title "..." --translator "..." --publisher "..." --version 1.0.0 --issued 2021-02-16
        a QuranEnc translation (quranenc.com/downloads/sqlite/<key>.sqlite): its rows as published, footnotes kept;
        a language's earlier translation is replaced (the scholar picks one per language)
    python3 tools/quran_set.py audio-list --edition ar.husary --reciter "..." --surahs 1,78-114 [--from DIR]
        one Hafs reciter's per-verse list from Islamic Network (cdn.islamic.network/quran/audio/64/<edition>/<n>.mp3,
        n counting verses from 1 across the Quran), each file's SHA-256 and size; --from reads files downloaded
        before instead of fetching them
    python3 tools/quran_set.py fetch-audio [--surah N]
        download the listed files (all, or one surah's) into audio/<edition>/, each checked against the list; the
        hub serves them from there. Git keeps Al-Fatiha's only (.gitignore): the rest are tens of MB
    python3 tools/quran_set.py check
        the hub's own checks (tutor_hub/quran.py), and the set's hash for the scholar's signature

Each command rewrites index.json's `files` with the new hashes, so the set's hash changes and an earlier signature no
longer counts: a new version of anything is a new signature (C4.7).
"""
import argparse
import json
import shutil
import sqlite3
import sys
import urllib.request
from datetime import date
from pathlib import Path

TUTOR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TUTOR / "hub"))
from tutor_hub import licences, quran  # noqa: E402

SET = TUTOR / "content" / "quran"
CDN = "https://cdn.islamic.network/quran/audio/{bitrate}/{edition}/{n}.mp3"


def load_index(folder: Path) -> dict:
    f = folder / quran.INDEX
    if f.is_file():
        return json.loads(f.read_text(encoding="utf-8"))
    return {"version": 1, "text": {}, "metadata": {}, "translations": [], "audio": [], "files": {},
            "review": {"status": "draft", "needs": [quran.SCHOLAR], "signoffs": []}}


def save_index(folder: Path, idx: dict) -> None:
    files = {}
    for rel in [idx["text"].get("file"), idx["metadata"].get("file")] + [m["file"] for m in idx["translations"]] + \
            [m["list"] for m in idx["audio"]]:
        if rel and (folder / rel).is_file():
            files[rel] = quran.sha_file(folder / rel)
    idx["files"] = dict(sorted(files.items()))
    (folder / quran.INDEX).write_text(json.dumps(idx, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def today() -> str:
    return date.today().isoformat()


def cmd_text(a, folder: Path):
    raw = Path(a.file).read_bytes()
    verses, notice = quran.parse_tanzil(raw.decode("utf-8"))
    if len(verses) != quran.VERSES or "CHANGING IT IS NOT ALLOWED" not in notice:
        sys.exit(f"{a.file}: not a whole Tanzil text with its notice ({len(verses)} verses)")
    surahs = quran.parse_metadata(Path(a.metadata).read_text(encoding="utf-8"))
    if len(surahs) != quran.SURAHS:
        sys.exit(f"{a.metadata}: not Tanzil's metadata")
    folder.mkdir(parents=True, exist_ok=True)
    name = f"tanzil-{a.edition.lower()}.txt"
    (folder / name).write_bytes(raw)                       # byte for byte
    shutil.copyfile(a.metadata, folder / "tanzil-data.xml")
    idx = load_index(folder)
    idx["text"] = {"source": "tanzil-quran-text", "file": name, "edition": a.edition, "version": a.version,
                   "url": "https://tanzil.net/download/", "checked": a.checked or today()}
    idx["metadata"] = {"source": "tanzil-quran-text", "file": "tanzil-data.xml",
                       "url": "https://tanzil.net/res/text/metadata/quran-data.xml", "checked": a.checked or today()}
    save_index(folder, idx)
    print(f"{name}: {len(verses)} verses; tanzil-data.xml: {len(surahs)} surahs")


def cmd_translation(a, folder: Path):
    raw = Path(a.sqlite).read_bytes()
    con = sqlite3.connect(f"file:{Path(a.sqlite).resolve()}?mode=ro", uri=True)
    rows = [[int(s), int(v), t or "", f or ""] for s, v, t, f in
            con.execute("select sura, aya, translation, footnotes from translations order by id")]
    con.close()
    if len(rows) != quran.VERSES:
        sys.exit(f"{a.sqlite}: {len(rows)} rows, not {quran.VERSES}")
    (folder / "translations").mkdir(parents=True, exist_ok=True)
    rel = f"translations/{a.key}.json"
    doc = {"key": a.key, "lang": a.lang, "from": f"https://quranenc.com/downloads/sqlite/{a.key}.sqlite",
           "note": "QuranEnc's rows as published: [surah, verse, translation, footnotes]; nothing changed",
           "verses": rows}
    (folder / rel).write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    idx = load_index(folder)
    old = [m for m in idx["translations"] if m["lang"] == a.lang]
    for m in old:
        if m["file"] != rel and (folder / m["file"]).is_file():
            (folder / m["file"]).unlink()
    idx["translations"] = [m for m in idx["translations"] if m["lang"] != a.lang] + [{
        "lang": a.lang, "key": a.key, "source": "quranenc-translations", "title": a.title,
        "translator": a.translator, "publisher": a.publisher, "version": a.version, "issued": a.issued,
        "url": f"https://quranenc.com/en/browse/{a.key}", "file": rel,
        "source_sha256": licences.sha256_bytes(raw), "checked": a.checked or today()}]
    idx["translations"].sort(key=lambda m: m["lang"])
    save_index(folder, idx)
    print(f"{rel}: {len(rows)} verses, {sum(1 for r in rows if r[3])} with footnotes")


def surah_range(spec: str) -> list[int]:
    out = []
    for part in spec.split(","):
        lo, _, hi = part.partition("-")
        out += list(range(int(lo), int(hi or lo) + 1))
    return sorted(set(out))


def cmd_audio_list(a, folder: Path):
    idx = load_index(folder)
    surahs = quran.parse_metadata((folder / idx["metadata"]["file"]).read_text(encoding="utf-8"))
    files = {}
    for n in surah_range(a.surahs):
        s = surahs[n - 1]
        for v in range(1, s["ayas"] + 1):
            url = CDN.format(bitrate=a.bitrate, edition=a.edition, n=s["start"] + v)
            name = f"{n}_{v}.mp3"
            if a.from_dir:
                data = (Path(a.from_dir) / name).read_bytes()
            else:
                with urllib.request.urlopen(url, timeout=60) as r:
                    data = r.read()
            files[f"{n}:{v}"] = {"file": name, "url": url, "sha256": licences.sha256_bytes(data), "bytes": len(data)}
    rel = f"audio/{a.edition}.json"
    (folder / "audio").mkdir(parents=True, exist_ok=True)
    (folder / rel).write_text(json.dumps({"edition": a.edition, "files": files}, indent=0) + "\n", encoding="utf-8")
    idx["audio"] = [{"edition": a.edition, "reciter": a.reciter, "riwaya": "Hafs", "bitrate": a.bitrate,
                     "source": "alquran-cloud-recitations", "list": rel,
                     "url": f"https://cdn.islamic.network/quran/audio/{a.bitrate}/{a.edition}/",
                     "checked": a.checked or today()}]
    save_index(folder, idx)
    print(f"{rel}: {len(files)} verses, {sum(x['bytes'] for x in files.values()) / 1e6:.1f} MB")


def cmd_fetch_audio(a, folder: Path):
    idx = load_index(folder)
    if not idx["audio"]:
        sys.exit("no recitation list yet: audio-list first")
    m = idx["audio"][0]
    lst = json.loads((folder / m["list"]).read_text(encoding="utf-8"))
    out = folder / "audio" / m["edition"]
    out.mkdir(parents=True, exist_ok=True)
    got = 0
    for ref, it in lst["files"].items():
        if a.surah and int(ref.split(":")[0]) != a.surah:
            continue
        f = out / it["file"]
        if f.is_file() and quran.sha_file(f) == it["sha256"]:
            continue
        with urllib.request.urlopen(it["url"], timeout=60) as r:
            data = r.read()
        if licences.sha256_bytes(data) != it["sha256"]:
            sys.exit(f"{it['url']}: not the file the list names (changed upstream?): stopped, nothing kept")
        f.write_bytes(data)
        got += 1
    print(f"audio/{m['edition']}/: {got} file(s) fetched, every one checked")


def cmd_check(a, folder: Path):
    s = quran.QuranSet(folder, licences.Sources(TUTOR / "content" / "sources.json"))
    for p in s.problems:
        print("problem:", p)
    if s.present:
        print(f"set hash {s.hash} ({s.state}); {len(s.text)} verses; translations {', '.join(sorted(s.tr))}; "
              f"recitation {s.edition() or 'none'}")
    return 1 if s.problems or not s.present else 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--set", type=Path, default=SET, help="the set's folder (default content/quran)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("text")
    t.add_argument("--file", required=True)
    t.add_argument("--metadata", required=True)
    t.add_argument("--edition", default="Uthmani")
    t.add_argument("--version", required=True)
    t.add_argument("--checked")
    tr = sub.add_parser("translation")
    for k in ("sqlite", "lang", "key", "title", "translator", "publisher", "version", "issued"):
        tr.add_argument("--" + k, required=True)
    tr.add_argument("--checked")
    au = sub.add_parser("audio-list")
    au.add_argument("--edition", required=True)
    au.add_argument("--reciter", required=True)
    au.add_argument("--surahs", default="1,78-114")
    au.add_argument("--bitrate", type=int, default=64)
    au.add_argument("--from", dest="from_dir")
    au.add_argument("--checked")
    fa = sub.add_parser("fetch-audio")
    fa.add_argument("--surah", type=int)
    sub.add_parser("check")
    a = ap.parse_args(argv)
    return {"text": cmd_text, "translation": cmd_translation, "audio-list": cmd_audio_list,
            "fetch-audio": cmd_fetch_audio, "check": cmd_check}[a.cmd](a, a.set) or 0


if __name__ == "__main__":
    sys.exit(main())
