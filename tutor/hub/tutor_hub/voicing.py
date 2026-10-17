"""The one voice per language (C5.6): which texts of a lesson are voiced, and how a text finds its clip.

tools/voice.py voices every text Qalam writes with Gemini at build time; a pack's clips are audio/<lang>/t-<h>.opus,
<h> = text_hash(text), named in the pack's audio/<lang>/manifest.json with `voice` and `generated: true` in place of
a speaker code. The app hashes what it is about to say the same way (app/js/speech.js), so this module, the tool and
the app must agree on norm() and text_hash(); app/tests/speech.test.js and hub/tests/test_voice.py check that they do.
Scripture is not voiced: an `ayah` step gives no text here.

content/voice.json names the one voice per language and holds the chair's gate: a language's generated clips reach
learners in a release build (TUTOR_RELEASE=1, production) only once a native listener has passed its 30-clip sample
(`native_check.<lang>.passed`). Staging and the hub play them without it.
"""
import hashlib
import json
import re
import unicodedata
from pathlib import Path

LANGS = ("prs", "ps", "en", "zh")
_LATIN = re.compile(r"[A-Za-z]")
_ARABIC = re.compile(r"[؀-ۿ]")
_HAN = re.compile(r"[一-鿿]")


def norm(text) -> str:
    """NFC, no $ (maths marks), one space, no final full stop: a sentence joined to the next with '. ' still finds
    its clip."""
    t = unicodedata.normalize("NFC", str(text)).replace("$", "")
    t = re.sub(r"\s+", " ", t).strip()
    return re.sub(r"[.۔]+$", "", t).strip()


def text_hash(text) -> str:
    return hashlib.sha256(norm(text).encode("utf-8")).hexdigest()[:12]


def field_texts(v, langs) -> list[tuple[str, str]]:
    """(lang, text) for a lesson field: a {lang: text} object gives its own languages; a plain string in Latin
    letters alone is English, in Chinese characters alone Mandarin, else it is said in each of the pack's languages."""
    if isinstance(v, dict):
        return [(l, t) for l, t in v.items() if l in LANGS and isinstance(t, str) and t.strip()]
    if isinstance(v, str) and v.strip():
        if _LATIN.search(v) and not (_ARABIC.search(v) or _HAN.search(v)):
            return [("en", v)]
        if _HAN.search(v) and not _ARABIC.search(v):
            return [("zh", v)]
        return [(l, v) for l in langs]
    return []


STEP_FIELDS = ("text", "prompt", "why", "word", "letter", "question", "hint")


def step_texts(st: dict, langs) -> list[tuple[str, str]]:
    """Every text a step says. Never an `ayah` step (scripture), never `say.answers` (the model phrase only, C5.5)
    or pinyin."""
    if st.get("kind") == "ayah":
        return []
    out = []
    for f in STEP_FIELDS:
        out += field_texts(st.get(f), langs)
    if isinstance(st.get("english"), str):
        out.append(("en", st["english"]))
    if isinstance(st.get("zh"), str):
        out.append(("zh", st["zh"]))
    for o in st.get("options") or [] if st.get("kind") == "choice" else []:
        out += field_texts(o.get("text") if isinstance(o, dict) else o, langs)
    return [(l, t) for l, t in out if norm(t)]


def lesson_texts(lesson: dict, langs) -> list[tuple[str, str]]:
    """Every text a lesson says: its title, unit and steps; never the sheet (printed, not read aloud)."""
    out = field_texts(lesson.get("title"), langs) + field_texts(lesson.get("unit"), langs)
    for st in lesson.get("steps") or []:
        out += step_texts(st, langs)
    return [(l, t) for l, t in out if norm(t)]


def step_lines(st: dict, al: str) -> list[str]:
    """What a step reads in language `al` when its speaker is tapped (the release rule's clip): its text or prompt,
    and for a letter step the word too; the taught words for `en` and `zh`."""
    if st.get("kind") == "ayah":
        return []
    if al == "en":
        return [st["english"]] if isinstance(st.get("english"), str) else []
    if al == "zh":
        return [st["zh"]] if isinstance(st.get("zh"), str) else []
    out = []
    for f in ("text", "prompt") + (("word",) if st.get("kind") == "letter" else ()):
        v = st.get(f)
        t = v.get(al) if isinstance(v, dict) else v if isinstance(v, str) else None
        if isinstance(t, str) and norm(t):
            out.append(t)
            if f == "text":
                break
    return out


def clip_name(text) -> str:
    return "t-" + text_hash(text)


def generated(entry) -> bool:
    return isinstance(entry, dict) and entry.get("generated") is True


def config(content: Path) -> dict:
    try:
        return json.loads((Path(content) / "voice.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def passed(content: Path) -> set[str]:
    """The languages whose native listener has passed the sample (the release gate)."""
    nc = config(content).get("native_check") or {}
    return {l for l, v in nc.items() if isinstance(v, dict) and v.get("passed") is True}


# --- the voice pack: one file per language (the owner's note of 17 Oct) -------------------------------------------
# The APK carries no audio. After install the app downloads the pack for her language only, and it can be saved and
# shared (by Bluetooth, say) and opened on another phone. The file: MAGIC, the header's length (4 bytes, big end
# first), the header as JSON {lang, voice, clips: {hash: [offset, length]}, files: {"bells/start.opus": [...]}},
# then the clips' bytes one after another (offsets from the end of the header). app/js/voicepack.js reads it.
MAGIC = b"QVOICE1\n"


def voice_pack(lang: str, app_audio: Path, packs: list) -> bytes | None:
    """The pack for `lang`: the learner app's clips (app_audio/<lang>/manifest.json), every pack's generated clips
    in that language (`packs`: [(its audio/<lang> folder, its clip entries)]), and the school day's bells. None when
    the language has no clip."""
    app_audio = Path(app_audio)
    clips: dict[str, Path] = {}
    try:
        m = json.loads((app_audio / lang / "manifest.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        m = {}
    for h in sorted((m.get("clips") or {}) if isinstance(m, dict) else {}):
        f = app_audio / lang / f"{h}.opus"
        if re.fullmatch(r"[0-9a-f]{12}", h) and f.is_file():
            clips[h] = f
    for folder, entries in packs:
        for name, c in sorted((entries or {}).items()):
            f = Path(folder) / str(c.get("file", ""))
            if generated(c) and name.startswith("t-") and f.is_file():
                clips.setdefault(name[2:], f)
    if not clips:
        return None
    files = {f"bells/{f.name}": f for f in sorted((app_audio / "bells").glob("*.opus"))}
    head = {"lang": lang, "voice": m.get("voice") if isinstance(m, dict) else None, "clips": {}, "files": {}}
    data = bytearray()
    for part, table in (("clips", clips), ("files", files)):
        for k, f in table.items():
            b = f.read_bytes()
            head[part][k] = [len(data), len(b)]
            data += b
    hj = json.dumps(head, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return MAGIC + len(hj).to_bytes(4, "big") + hj + bytes(data)


def read_pack(blob: bytes) -> dict:
    """The header of a voice pack, with `base` (where the clips start); ValueError if it is not one."""
    if not blob.startswith(MAGIC) or len(blob) < len(MAGIC) + 4:
        raise ValueError("not a Qalam voice pack")
    n = int.from_bytes(blob[len(MAGIC):len(MAGIC) + 4], "big")
    base = len(MAGIC) + 4 + n
    head = json.loads(blob[len(MAGIC) + 4:base].decode("utf-8"))
    for o, ln in list(head.get("clips", {}).values()) + list(head.get("files", {}).values()):
        if o < 0 or ln <= 0 or base + o + ln > len(blob):
            raise ValueError("a clip runs past the end of the pack")
    return {**head, "base": base}
