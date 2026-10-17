"""The Quran set (P29, C4.7): the reader's whole text, kept verbatim and checked by hash, in tutor/content/quran/.

    index.json                  what the set holds: each file's SHA-256, the text's edition, each translation's
                                version and exact credit, the recitation lists, and the scholar's `review` block
    tanzil-uthmani.txt          the Tanzil text as downloaded, its notice block included (the only Quran text in the
                                repository: no verse is typed anywhere else, docs and tests included)
    tanzil-data.xml             Tanzil's metadata: the surahs, their verse counts and names
    translations/<key>.json     a QuranEnc translation of the meanings, its rows as QuranEnc publishes them
                                ([surah, verse, translation, footnotes]); nothing changed, added or deleted
    audio/<edition>.json        one Hafs reciter's per-verse files: "s:a" -> {file, url, sha256, bytes}
    audio/<edition>/<s>_<a>.mp3 the files as published (no re-encoding, no trimming); only those fetched with
                                tools/quran_set.py fetch-audio, checked against the list (git keeps Al-Fatiha only)

`tools/quran_set.py` makes and refreshes the folder; this module reads it at start and refuses a set whose files do
not match their hashes, whose text does not have the surahs' verse counts, or whose translation lacks a verse. A
lesson's `ayah` step names a verse; the hub fills in its text, translation and recitation from here, so a verse is
never copied into a lesson (packs.py).

The set is signed as a whole: its hash covers index.json without its review block, and index.json holds every file's
hash, so a new QuranEnc version or a new reciter is a new hash and needs a new signature. Until a "Hanafi scholar"
has signed the current hash, the admin cannot switch `quran` on (admin.py, lock "scholar") and a release hub serves
none of it. No AI reads any of it: the set never enters Ask's index or a prompt.
"""
import json
import logging
import re
from pathlib import Path

from . import licences

log = logging.getLogger("tutor.quran")

TUTOR = Path(__file__).resolve().parents[2]
FOLDER = TUTOR / "content" / "quran"
INDEX = "index.json"
LIGHT = "light.json"        # the Worker's copy (worker/build.py): the checks' results, not the text
SCHOLAR = "Hanafi scholar"
VERSES = 6236
SURAHS = 114
LANGS = ("prs", "ps")
INDEX_KEYS = {"version", "text", "metadata", "translations", "audio", "files", "review"}
_LINE = re.compile(r"^(\d{1,3})\|(\d{1,3})\|(.+)$")
_SHA = re.compile(r"^sha256:[0-9a-f]{64}$")
_KEY = re.compile(r"^[a-z][a-z0-9_]{1,40}$")
_EDITION = re.compile(r"^[a-z]{2}\.[a-z0-9]{2,30}$")
_FILE = re.compile(r"^\d{1,3}_\d{1,3}\.mp3$")


def parse_tanzil(text: str) -> tuple[dict, str]:
    """Tanzil's text file: {(surah, verse): text} and its notice block (every comment line, as written)."""
    verses, notice = {}, []
    for line in text.splitlines():
        if line.startswith("#"):
            notice.append(line)
            continue
        if not line.strip():
            continue
        m = _LINE.match(line)
        if not m:
            raise ValueError(f"not a Tanzil line: {line[:20]!r}")
        verses[(int(m[1]), int(m[2]))] = m[3]
    return verses, "\n".join(notice).strip()


def parse_metadata(xml: str) -> list[dict]:
    """The surahs from Tanzil's quran-data.xml: [{n, ayas, start, ar, tname, ename}]."""
    import xml.etree.ElementTree as ET
    root = ET.fromstring(xml)
    out = []
    for s in root.iter("sura"):
        out.append({"n": int(s.get("index")), "ayas": int(s.get("ayas")), "start": int(s.get("start")),
                    "ar": s.get("name"), "tname": s.get("tname"), "ename": s.get("ename")})
    return sorted(out, key=lambda x: x["n"])


def sha_file(f: Path) -> str:
    return licences.sha256_bytes(Path(f).read_bytes())


def set_hash(index: dict) -> str:
    """What the scholar signs: index.json without its review block (it holds every file's hash)."""
    body = {k: v for k, v in index.items() if k != "review"}
    return licences.sha256_text(json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":")))


class QuranSet:
    """The set in `folder`, checked once. `ok` is False when it is missing or any check failed (`problems`)."""

    def __init__(self, folder: Path | None = None, sources=None):
        self.dir = Path(folder or FOLDER)
        self.sources = sources
        self.problems: list[str] = []
        self.index: dict = {}
        self.text: dict = {}
        self.notice = ""
        self.surahs: list[dict] = []
        self.tr: dict[str, dict] = {}          # lang -> {"meta": ..., "verses": {(s, a): (t, f)}}
        self.audio: dict[str, dict] = {}       # edition -> {"meta": ..., "files": {"s:a": {...}}}
        self.hash = ""
        self.state = "draft"
        self.light: dict | None = None
        self.present = self.dir.is_dir() and (self.dir / INDEX).is_file()
        if not self.present and (self.dir / LIGHT).is_file():
            # online: build.py checked the whole set and kept only what the hub needs (its hash and state, the
            # surah list and credits, the hashes of the verses lessons name); the text itself is static, in public/
            self.light = json.loads((self.dir / LIGHT).read_text(encoding="utf-8"))
            self.present, self.hash, self.state = True, self.light["hash"], self.light["state"]
            self.surahs = self.light["surahs"]
            self.light["listed"] = set(self.light.get("listed") or [])
        elif self.present:
            try:
                self._load()
            except Exception as e:             # a broken set is reported, never a crash at start
                self.problems.append(f"the Quran set could not be read ({type(e).__name__}: {e})")
        for p in self.problems:
            log.warning("quran set: %s", p)

    @property
    def ok(self) -> bool:
        return self.present and not self.problems

    @property
    def signed(self) -> bool:
        return self.ok and self.state == "signed"

    def _load(self):
        from . import packs                     # the review block is the packs' shape
        idx = json.loads((self.dir / INDEX).read_text(encoding="utf-8"))
        p = self.problems
        if not isinstance(idx, dict) or set(idx) - INDEX_KEYS:
            p.append(f"index.json holds only {', '.join(sorted(INDEX_KEYS))}")
            return
        self.index = idx
        files = idx.get("files") or {}
        if not isinstance(files, dict) or not files:
            p.append("index.json files: every file of the set with its sha256")
            return
        for rel, want in files.items():
            f = self.dir / rel
            if not isinstance(want, str) or not _SHA.match(want):
                p.append(f"{rel}: its sha256 in index.json is not one")
            elif ".." in Path(rel).parts or not f.is_file():
                p.append(f"{rel}: listed in index.json but not in the set")
            elif sha_file(f) != want:
                p.append(f"{rel}: does not match its sha256 (changed since import: nothing may be changed)")
        if p:
            return
        t = idx.get("text") or {}
        if t.get("file") not in files or t.get("source") != "tanzil-quran-text":
            p.append("text: the Tanzil file, listed in files, with source tanzil-quran-text")
            return
        self.text, self.notice = parse_tanzil((self.dir / t["file"]).read_text(encoding="utf-8"))
        if "CHANGING IT IS NOT ALLOWED" not in self.notice:
            p.append("text: the Tanzil notice block must travel with the text")
        md = idx.get("metadata") or {}
        if md.get("file") not in files:
            p.append("metadata: Tanzil's quran-data.xml, listed in files")
            return
        self.surahs = parse_metadata((self.dir / md["file"]).read_text(encoding="utf-8"))
        if len(self.surahs) != SURAHS or sum(s["ayas"] for s in self.surahs) != VERSES:
            p.append(f"metadata: {SURAHS} surahs and {VERSES} verses")
        want_keys = {(s["n"], a) for s in self.surahs for a in range(1, s["ayas"] + 1)}
        if set(self.text) != want_keys:
            p.append(f"text: {len(self.text)} verses, not the {VERSES} the metadata lists")
        seen_langs = set()
        for i, m in enumerate(idx.get("translations") or [], 1):
            w = f"translations {i}"
            need = ("lang", "key", "source", "title", "translator", "publisher", "version", "issued", "url",
                    "file", "source_sha256", "checked")
            if not isinstance(m, dict) or any(not isinstance(m.get(k), str) or not m[k] for k in need):
                p.append(f"{w}: needs {', '.join(need)}")
                continue
            if m["lang"] not in LANGS or m["lang"] in seen_langs:
                p.append(f"{w}: one translation per language, of {', '.join(LANGS)} (the scholar picks it)")
                continue
            if m["source"] != "quranenc-translations" or not _KEY.match(m["key"]) or m["file"] not in files:
                p.append(f"{w}: a QuranEnc translation, its key, and its file listed in files")
                continue
            seen_langs.add(m["lang"])
            doc = json.loads((self.dir / m["file"]).read_text(encoding="utf-8"))
            rows = doc.get("verses") if isinstance(doc, dict) else None
            if doc.get("key") != m["key"] or not isinstance(rows, list):
                p.append(f"{w}: {m['file']} is {{key, verses: [[surah, verse, translation, footnotes]]}}")
                continue
            verses = {}
            for r in rows:
                if not (isinstance(r, list) and len(r) == 4 and isinstance(r[2], str) and isinstance(r[3], str)):
                    p.append(f"{w}: a row is [surah, verse, translation, footnotes]")
                    break
                verses[(r[0], r[1])] = (r[2], r[3])
            if set(verses) != want_keys:
                p.append(f"{w}: {m['key']} has {len(verses)} verses, not {VERSES} (nothing may be left out)")
            self.tr[m["lang"]] = {"meta": m, "verses": verses}
        for i, m in enumerate(idx.get("audio") or [], 1):
            w = f"audio {i}"
            need = ("edition", "reciter", "riwaya", "bitrate", "source", "list", "checked")
            if not isinstance(m, dict) or any(m.get(k) in (None, "") for k in need):
                p.append(f"{w}: needs {', '.join(need)}")
                continue
            if not _EDITION.match(str(m["edition"])) or m["list"] not in files or m["riwaya"] != "Hafs":
                p.append(f"{w}: an edition like ar.husary, a Hafs recitation, its list listed in files")
                continue
            if self.audio:
                p.append(f"{w}: one reciter (the scholar picks); a swap is a new list")
                continue
            lst = json.loads((self.dir / m["list"]).read_text(encoding="utf-8"))
            items = lst.get("files") if isinstance(lst, dict) else None
            if lst.get("edition") != m["edition"] or not isinstance(items, dict):
                p.append(f"{w}: {m['list']} is {{edition, files: {{\"s:a\": {{file, url, sha256, bytes}}}}}}")
                continue
            for ref, it in items.items():
                s, _, a = str(ref).partition(":")
                ok = (s.isdigit() and a.isdigit() and (int(s), int(a)) in want_keys and isinstance(it, dict)
                      and _FILE.match(str(it.get("file", ""))) and it.get("file") == f"{s}_{a}.mp3"
                      and isinstance(it.get("sha256"), str) and _SHA.match(it["sha256"])
                      and str(it.get("url", "")).startswith("https://") and type(it.get("bytes")) is int)
                if not ok:
                    p.append(f"{w}: {ref} must be a verse with {{file: s_a.mp3, url, sha256, bytes}}")
                    break
            self.audio[m["edition"]] = {"meta": m, "files": items}
        if self.sources is not None:            # every source the set names is registered and copyable
            ids = [t.get("source"), md.get("source")] + [m.get("source") for m in idx.get("translations") or []] + \
                  [m.get("source") for m in idx.get("audio") or []]
            for sid in ids:
                cls = self.sources.effective_class(sid) if sid in self.sources.by_id else None
                if cls not in licences.COPYABLE:
                    p.append(f"source {sid!r} is not one Qalam may copy ({cls or 'not in sources.json'})")
        for x in packs.check_review(idx.get("review"), "the Quran set"):
            p.append(x)
        self.hash = set_hash(idx)
        self.state = packs.review_state(idx, self.hash)
        if SCHOLAR not in ((idx.get("review") or {}).get("needs") or []):
            p.append(f"review: needs a {SCHOLAR}")
        # the audio on disk: each fetched file must be the one the list names
        for ed, a in self.audio.items():
            for ref, it in a["files"].items():
                f = self.dir / "audio" / ed / it["file"]
                if f.is_file() and (f.stat().st_size != it["bytes"] or sha_file(f) != it["sha256"]):
                    p.append(f"audio/{ed}/{it['file']}: not the file as published (its sha256 differs)")

    # --- reading ---

    def has(self, s, a) -> bool:
        if self.light is not None:
            return type(s) is int and type(a) is int and 1 <= s <= len(self.surahs) and 1 <= a <= self.ayas(s)
        return (s, a) in self.text

    def ayas(self, s: int) -> int:
        return self.surahs[s - 1]["ayas"] if 1 <= s <= len(self.surahs) else 0

    def audio_path(self, edition: str, fname: str) -> Path | None:
        """A fetched recitation file, only when the list names it."""
        a = self.audio.get(edition)
        if not a or not _FILE.match(fname):
            return None
        s, a_ = fname[:-4].split("_")
        it = a["files"].get(f"{int(s)}:{int(a_)}")
        f = self.dir / "audio" / edition / fname
        return f if it and it["file"] == fname and f.is_file() else None

    def audio_sources(self) -> list[str]:
        """The sources.json ids the recitation comes from."""
        if self.light is not None:
            return list(self.light.get("audio_sources") or [])
        return [a["meta"]["source"] for a in self.audio.values()]

    def edition(self) -> str | None:
        return next(iter(self.audio), None)

    def recitation(self, s: int, a: int) -> dict | None:
        """{url, sha256} of the verse's recitation where its file is here, else None."""
        ed = self.edition()
        it = self.audio[ed]["files"].get(f"{s}:{a}") if ed else None
        if not it or not (self.dir / "audio" / ed / it["file"]).is_file():
            return None
        return {"url": f"/quran/audio/{ed}/{it['file']}", "sha256": it["sha256"]}

    def listed(self, s: int, a: int) -> dict | None:
        """The verse's entry in the recitation list, fetched or not."""
        if self.light is not None:
            return {"listed": True} if f"{s}:{a}" in self.light["listed"] else None
        ed = self.edition()
        return self.audio[ed]["files"].get(f"{s}:{a}") if ed else None

    def verse(self, s: int, a: int) -> dict:
        tr = {}
        for lang, x in self.tr.items():
            t, f = x["verses"][(s, a)]
            tr[lang] = {"t": t, "f": f}
        return {"s": s, "a": a, "ar": self.text[(s, a)], "tr": tr, "audio": self.recitation(s, a)}

    def verse_hash(self, s: int, a: int) -> str:
        """One verse as a lesson's `ayah` step shows it: text, translations, the listed recitation's hash."""
        if self.light is not None:
            return self.light["verses"].get(f"{s}:{a}", "")
        v = self.verse(s, a)
        v["audio"] = (self.listed(s, a) or {}).get("sha256")
        return licences.sha256_text(json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(",", ":")))

    def credits(self) -> dict:
        """The exact credit lines, from sources.json's attributions and index.json's details."""
        def line(sid, fields):
            if self.sources is None or sid not in self.sources.by_id:
                return ""
            return self.sources.credit_line({"id": sid, "fields": fields})
        t = self.index.get("text") or {}
        out = {"text": line("tanzil-quran-text", {}), "notice": self.notice,
               "edition": f"Tanzil {t.get('edition', '')} {t.get('version', '')}".strip(), "tr": {}, "audio": None}
        for lang, x in self.tr.items():
            m = x["meta"]
            out["tr"][lang] = {"line": line("quranenc-translations", {k: m[k] for k in ("translator", "publisher",
                                                                                         "version")}),
                               "title": m["title"], "version": m["version"], "url": m["url"]}
        ed = self.edition()
        if ed:
            m = self.audio[ed]["meta"]
            out["audio"] = {"line": line("alquran-cloud-recitations", {"reciter": m["reciter"]}),
                            "edition": ed, "reciter": m["reciter"]}
        return out

    def summary(self) -> dict:
        """What the reader's list needs: the surahs, the translations' languages, the credits; no verse text."""
        if self.light is not None:
            return self.light["summary"]
        heard = {}
        ed = self.edition()
        if ed:
            for ref in self.audio[ed]["files"]:
                s = int(ref.split(":")[0])
                heard[s] = heard.get(s, 0) + 1
        return {"hash": self.hash, "short": self.hash[7:15], "draft": self.state != "signed",
                "langs": sorted(self.tr), "credits": self.credits(),
                "surahs": [{"n": s["n"], "ayas": s["ayas"], "ar": s["ar"], "tname": s["tname"],
                            "audio": heard.get(s["n"], 0) == s["ayas"]} for s in self.surahs]}

    def surah(self, n: int) -> dict | None:
        """One surah for the reader: every verse with its translations (footnotes kept) and its recitation where
        fetched, Tanzil's notice and the credits."""
        if self.light is not None or not 1 <= n <= len(self.surahs):
            return None
        s = self.surahs[n - 1]
        return {"n": n, "ar": s["ar"], "tname": s["tname"], "ayas": s["ayas"], "hash": self.hash,
                "verses": [self.verse(n, a) for a in range(1, s["ayas"] + 1)],
                "notice": self.notice, "credits": self.credits()}

    def lines(self) -> list[str]:
        """Every verse's text, for the tests that look for one where it must never be (a prompt, the index)."""
        return list(self.text.values())

    def light_doc(self, refs) -> dict:
        """What the Worker keeps (build.py): the hash and state, the summary, the recitation list's hashes, and the
        verse hashes of `refs` (the verses lessons name), so its lessons' content hashes match the hub's."""
        ed = self.edition()
        return {"hash": self.hash, "state": self.state, "surahs": self.surahs, "summary": self.summary(),
                "audio_sources": self.audio_sources(),
                "listed": sorted(self.audio[ed]["files"]) if ed else [],
                "verses": {f"{s}:{a}": self.verse_hash(s, a) for s, a in sorted(set(refs)) if self.has(s, a)}}


def lesson_refs(lessons) -> list[tuple[int, int]]:
    """Every verse an `ayah` step names, in these lessons."""
    return [(st["surah"], st["ayah"]) for l in lessons for st in l.get("steps") or []
            if isinstance(st, dict) and st.get("kind") == "ayah" and type(st.get("surah")) is int
            and type(st.get("ayah")) is int]
