"""The one voice per language (C5.6): what tools/voice.py reads and voices, and how the hub serves the clips."""
import builtins
import copy
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from tutor_hub import voicing
from tutor_hub.packs import Library, check_clips, content_hash, release_problems

from conftest import PACKS

TUTOR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(TUTOR / "tools"))
import voice  # noqa: E402


def test_the_hash_is_the_apps():
    # the same five texts app/tests/speech.test.js checks against app/js/speech.js
    want = {"درس تمام شد! آفرین": "b4278d0e664b", "  این حرف «ش» است.  ": "d36d9b14db8d", "Hello. ": "185f8db32271",
            "你好": "670d9743542c", "x $1$ + 2.": "97a16e5ea0cd"}
    assert {t: voicing.text_hash(t) for t in want} == want


def test_the_tool_reads_only_app_js_and_content(monkeypatch):
    """Never a learner's text, a name or an event: nothing under data/, nothing from a hub or D1."""
    seen = []
    real_open, real_listdir, real_run = builtins.open, os.listdir, subprocess.run

    def where(p):
        seen.append(os.path.abspath(os.fspath(p)))
    monkeypatch.setattr(builtins, "open", lambda p, *a, **k: (where(p), real_open(p, *a, **k))[1])
    monkeypatch.setattr(os, "listdir", lambda p=".": (where(p), real_listdir(p))[1])

    def run(cmd, *a, **k):
        for x in cmd[1:]:
            if x.startswith("file://"):
                where(x[len("file://"):])
        return real_run(cmd, *a, **k)
    monkeypatch.setattr(subprocess, "run", run)
    items = voice.plan_all()
    assert len(items) > 1000
    allowed = [str(TUTOR / r) for r in voice.READS]
    assert seen and all(any(p.startswith(a) for a in allowed) for p in seen), sorted(set(seen))[:5]
    assert not any("/data" in p.split(str(TUTOR))[-1] for p in seen)


def test_scripture_is_never_voiced():
    step = {"kind": "ayah", "surah": 1, "ayah": 1, "text": {"prs": "ترجمه"}}
    assert voicing.step_texts(step, ["prs"]) == [] and voicing.step_lines(step, "prs") == []
    texts = {t for _, t in voicing.lesson_texts({"title": {"prs": "سوره"}, "steps": [step]}, ["prs"])}
    assert texts == {"سوره"}


def test_every_language_has_one_voice_and_a_gate():
    cfg = voicing.config(TUTOR / "content")
    assert set(cfg["voices"]) == set(voicing.LANGS) and all(isinstance(v, str) and v for v in cfg["voices"].values())
    assert set(cfg["native_check"]) == set(voicing.LANGS)


def _made(tmp_path, voice_name="Kore", passed=False):
    """A copy of the starter pack with Gemini clips for every line of dari-1-sheen, in Dari."""
    content = tmp_path / "content"
    shutil.copytree(PACKS / "starter", content / "packs" / "starter")
    shutil.copy(TUTOR / "content" / "sources.json", content / "sources.json")
    cfg = voicing.config(TUTOR / "content")
    cfg["native_check"]["prs"]["passed"] = passed
    (content / "voice.json").write_text(json.dumps(cfg), encoding="utf-8")
    lesson = json.loads((PACKS / "starter" / "lessons" / "dari-1-sheen.json").read_text(encoding="utf-8"))
    d = content / "packs" / "starter" / "audio" / "prs"
    d.mkdir(parents=True)
    clips = {}
    for al, t in voicing.lesson_texts(lesson, ["prs", "ps"]):
        if al != "prs":
            continue
        name = voicing.clip_name(t)
        (d / f"{name}.opus").write_bytes(name.encode())
        clips[name] = {"file": f"{name}.opus", "voice": voice_name, "generated": True, "placeholder": False,
                       "sha256": "sha256:" + hashlib.sha256(name.encode()).hexdigest(), "text": voicing.norm(t)}
    (d / "manifest.json").write_text(json.dumps({"lang": "prs", "voice": voice_name, "clips": clips}), encoding="utf-8")
    return content, lesson, clips


def test_a_generated_clip_meets_the_release_rule_and_is_served(tmp_path):
    content, lesson, clips = _made(tmp_path)
    lib = Library(content / "packs")
    assert not [p for p in lib.problems if "audio" in p]
    pack = lib.packs["starter"]
    why = release_problems(lesson, "signed", {**pack, "langs": ["prs"]}, {"prs": clips})
    assert not [p for p in why if "clip" in p], why                          # every Dari step has its voice
    app = lib.lesson_for_app("dari-1-sheen")
    title = voicing.text_hash(lesson["title"]["prs"])
    assert app["voices"]["prs"][title] == f"/packs/starter/audio/prs/t-{title}.opus"
    assert "ps" not in app["voices"]
    rows = {p["id"]: p for p in lib.summary()}
    assert title in rows["starter"]["voices"]["prs"]                          # the lesson list's titles too
    # a changed clip voids the reviewers' signatures, as a changed recording does
    other = copy.deepcopy(clips)
    next(iter(other.values()))["sha256"] = "sha256:" + "1" * 64
    pdir = content / "packs" / "starter"
    assert content_hash(lesson, pdir, {"prs": clips}) != content_hash(lesson, pdir, {"prs": other})


def test_release_waits_for_the_native_listener(tmp_path):
    content, lesson, clips = _made(tmp_path, passed=False)
    lib = Library(content / "packs", release=True)
    assert lib.served_clips("starter").get("prs") == {}
    content2, _, _ = _made(tmp_path / "b", passed=True)
    assert Library(content2 / "packs", release=True).served_clips("starter")["prs"].keys() == clips.keys()


def test_one_voice_per_language():
    a = {"file": "t-a.opus", "voice": "Kore", "generated": True, "placeholder": False, "sha256": "sha256:0"}
    assert check_clips({"prs": {"t-a": a, "t-b": {**a, "file": "t-b.opus"}}}, "p") == []
    two = check_clips({"prs": {"t-a": a, "t-b": {**a, "file": "t-b.opus", "voice": "Puck"}}}, "p")
    assert any("one voice per language" in p for p in two)
    assert any("names its voice" in p for p in check_clips({"prs": {"t-a": {**a, "voice": ""}}}, "p"))


def test_a_voice_pack_holds_every_clip_of_one_language(tmp_path):
    content, lesson, clips = _made(tmp_path)
    app = tmp_path / "app" / "audio"
    (app / "prs").mkdir(parents=True)
    (app / "bells").mkdir()
    (app / "bells" / "start.opus").write_bytes(b"bell")
    h = voicing.text_hash("سلام")
    (app / "prs" / f"{h}.opus").write_bytes(b"hello")
    (app / "prs" / "manifest.json").write_text(json.dumps({"lang": "prs", "voice": "Kore", "clips": {h: 1.0}}))
    pdir = content / "packs" / "starter" / "audio" / "prs"
    blob = voicing.voice_pack("prs", app, [(pdir, clips)])
    head = voicing.read_pack(blob)
    assert head["lang"] == "prs" and head["voice"] == "Kore"
    assert set(head["clips"]) == {h} | {n[2:] for n in clips} and "bells/start.opus" in head["files"]
    o, n = head["clips"][h]
    assert blob[head["base"] + o:head["base"] + o + n] == b"hello"
    assert voicing.voice_pack("ps", app, []) is None                         # no clip in Pashto: no pack
    try:
        voicing.read_pack(blob[:-1])
        raise AssertionError("a cut pack must be refused")
    except ValueError:
        pass
