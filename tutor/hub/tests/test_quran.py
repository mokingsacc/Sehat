"""The Quran set, the ayah step, the reader's routes and the scholar's gate (P29, C4.7). No network.

The set is content/quran as imported by tools/quran_set.py: Tanzil's text with its notice, QuranEnc's Dari and Pashto
translations as published, one reciter's per-verse list, each file under its SHA-256. No verse is typed in this file:
every one is read from the Tanzil file."""
import importlib.util
import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tutor_hub import licences, quran, rules, search
from tutor_hub.packs import Library, content_hash, release_problems, review_state, validate_lesson
from tutor_hub.quran import QuranSet, set_hash
from tutor_hub.server import admin_pin, create_app, teacher_pin

from conftest import TUTOR

SET = TUTOR / "content" / "quran"
SOURCES = TUTOR / "content" / "sources.json"
STAGING = "qg1j2918yx"
HUB = "d6co6etep6"

spec = importlib.util.spec_from_file_location("pull_signoffs", TUTOR / "tools" / "pull_signoffs.py")
pull = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pull)


@pytest.fixture(scope="module")
def qset():
    q = QuranSet(SET, licences.Sources(SOURCES))
    assert q.ok, q.problems
    return q


def tanzil_lines() -> dict:
    verses, _ = quran.parse_tanzil((SET / "tanzil-uthmani.txt").read_text(encoding="utf-8"))
    return verses


def rehash(folder: Path):
    """index.json's file hashes after a test changed a file (as the import tool would), so only the later checks
    can catch the change."""
    idx = json.loads((folder / "index.json").read_text(encoding="utf-8"))
    idx["files"] = {rel: quran.sha_file(folder / rel) for rel in idx["files"]}
    (folder / "index.json").write_text(json.dumps(idx, ensure_ascii=False, indent=1), encoding="utf-8")


def content(tmp_path, lessons=(), pack=None) -> Path:
    """A content folder: sources.json, a copy of the Quran set, and one pack holding `lessons`."""
    root = tmp_path / "content"
    (root / "packs" / "q" / "lessons").mkdir(parents=True)
    shutil.copy2(SOURCES, root / "sources.json")
    shutil.copytree(SET, root / "quran")
    pk = {"id": "q", "version": "1", "title": {"en": "Quran"}, "langs": ["prs", "ps"], "licence": "NC",
          "lessons": [l["id"] for l in lessons], **(pack or {})}
    (root / "packs" / "q" / "pack.json").write_text(json.dumps(pk), encoding="utf-8")
    for l in lessons:
        (root / "packs" / "q" / "lessons" / f"{l['id']}.json").write_text(json.dumps(l, ensure_ascii=False),
                                                                         encoding="utf-8")
    return root


def ayah_lesson(lid="quran-t-1", **over):
    l = {"id": lid, "subject": "quran", "year": 1, "title": {"prs": "فاتحه", "ps": "فاتحه", "en": "Al-Fatiha"},
         "drafted_by": "AB", "steps": [{"kind": "ayah", "surah": 1, "ayah": a} for a in range(1, 8)],
         "review": {"status": "draft", "needs": ["Dari reader", "Pashto reader", "Hanafi scholar"], "signoffs": []}}
    l.update(over)
    return l


def sign_set(folder: Path, initials="AB"):
    idx = json.loads((folder / "index.json").read_text(encoding="utf-8"))
    idx["review"]["signoffs"] = [{"role": "Hanafi scholar", "initials": initials, "date": "2027-08-01",
                                  "hash": set_hash(idx)}]
    (folder / "index.json").write_text(json.dumps(idx, ensure_ascii=False, indent=1), encoding="utf-8")


# --- the set ---

def test_the_set_is_whole_verbatim_and_checked(qset):
    assert len(qset.text) == quran.VERSES and len(qset.surahs) == quran.SURAHS
    assert qset.text == tanzil_lines()
    assert "CHANGING IT IS NOT ALLOWED" in qset.notice and "Tanzil" in qset.notice
    assert sorted(qset.tr) == ["prs", "ps"] and all(len(x["verses"]) == quran.VERSES for x in qset.tr.values())
    meta = {x["meta"]["key"]: x["meta"] for x in qset.tr.values()}
    assert set(meta) == {"dari_badkhashani", "pashto_rwwad"}
    assert all(m["version"] and m["issued"] and m["source_sha256"].startswith("sha256:") for m in meta.values())
    # one Hafs reciter, Al-Fatiha and Juz 'Amma listed with each file's hash; git keeps Al-Fatiha's files
    assert qset.edition() == "ar.husary" and qset.audio["ar.husary"]["meta"]["riwaya"] == "Hafs"
    assert len(qset.audio["ar.husary"]["files"]) == 7 + sum(s["ayas"] for s in qset.surahs[77:])
    assert all(qset.recitation(1, a) for a in range(1, 8))
    assert qset.listed(2, 1) is None and qset.recitation(2, 1) is None
    # the scholar's gate: a draft, needing a Hanafi scholar, its hash over every file's hash
    assert qset.state == "draft" and qset.index["review"]["needs"] == ["Hanafi scholar"]
    assert qset.hash == set_hash(qset.index) and not qset.signed
    # the exact credit lines come from sources.json's attributions
    cr = qset.credits()
    assert cr["text"] == "Quran text: Tanzil Project (tanzil.net), unchanged."
    assert "Mawlawi Muhammad Anwar Badakhshani" in cr["tr"]["prs"]["line"] and "version 1.0.0" in cr["tr"]["prs"]["line"]
    assert "Rowwad" in cr["tr"]["ps"]["line"] and "version 1.0.1" in cr["tr"]["ps"]["line"]
    assert cr["audio"]["line"].startswith("Recitation by Mahmoud Khalil Al-Husary, via Islamic Network")


def test_footnotes_are_kept_and_nothing_is_dropped(qset):
    ps = qset.tr["ps"]["verses"]
    with_notes = [k for k, (t, f) in ps.items() if f]
    assert len(with_notes) == 29 and all(ps[k][0] for k in ps)
    v = qset.verse(*with_notes[0])
    assert v["tr"]["ps"]["f"] == ps[with_notes[0]][1]


def test_a_changed_letter_a_lost_verse_or_a_dropped_notice_refuses_the_set(tmp_path):
    q = tmp_path / "a"
    shutil.copytree(SET, q)
    f = q / "tanzil-uthmani.txt"
    raw = f.read_text(encoding="utf-8")
    first = next(iter(tanzil_lines().values()))
    f.write_text(raw.replace(first, first[:-1], 1), encoding="utf-8")       # one letter less
    assert any("does not match its sha256" in p for p in QuranSet(q).problems)
    rehash(q)                                                                # even with a matching hash, a lost
    f.write_text(raw.replace("1|1|", "", 1).replace("\n" + first + "\n", "\n", 1), encoding="utf-8")   # verse
    rehash(q)
    assert not QuranSet(q).ok
    f.write_text("\n".join(x for x in raw.splitlines() if not x.startswith("#")), encoding="utf-8")
    rehash(q)
    assert any("notice block must travel" in p for p in QuranSet(q).problems)
    f.write_text(raw, encoding="utf-8")
    rehash(q)
    assert QuranSet(q).ok
    t = q / "translations" / "pashto_rwwad.json"
    doc = json.loads(t.read_text(encoding="utf-8"))
    doc["verses"] = doc["verses"][:-1]
    t.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    rehash(q)
    assert any("nothing may be left out" in p for p in QuranSet(q).problems)


def test_a_recitation_file_must_be_the_one_published(tmp_path):
    q = tmp_path / "a"
    shutil.copytree(SET, q)
    f = q / "audio" / "ar.husary" / "1_1.mp3"
    f.write_bytes(f.read_bytes()[:-10])                                      # trimmed
    assert any("not the file as published" in p for p in QuranSet(q).problems)


def test_no_verse_is_typed_anywhere_else_in_the_repository():
    """C4.7: the Tanzil file is the only Quran text in the repository, fixtures and docs included."""
    long = [v for v in tanzil_lines().values() if len(v) >= 30]
    skip = {"node_modules", ".git", "build", "__pycache__", "shots", "data"}
    found = []
    for f in TUTOR.rglob("*"):
        if not f.is_file() or f.suffix not in (".json", ".js", ".py", ".md", ".html", ".txt", ".css", ".mjs", ".xml"):
            continue
        rel = f.relative_to(TUTOR)
        if rel.parts[:2] == ("content", "quran") or skip & set(rel.parts):
            continue
        text = f.read_text(encoding="utf-8", errors="ignore")
        if any("؀" <= ch <= "ۿ" for ch in text[:200000]) and any(v in text for v in long):
            found.append(str(rel))
    assert found == []


# --- the gate: held off and locked until a Hanafi scholar signs ---

def hub_on(tmp_path, root, *, release=False, cohort=STAGING):
    from tutor_hub.config import Config
    cfg = Config.from_env(data=tmp_path / "data", print_backend="outbox", llm_url=None, packs=root / "packs",
                          release=release, cohort=cohort, ai_provider="fake")
    return TestClient(create_app(cfg)), cfg


def test_the_reader_is_held_off_on_a_release_hub_and_the_admin_cannot_switch_it_on_until_signed(tmp_path):
    root = content(tmp_path)
    c, cfg = hub_on(tmp_path, root, release=True)
    with c:
        hub = c.app.state.hub
        assert hub.held() == ("quran",)
        pin = {"X-Admin-Pin": admin_pin(cfg.data)}
        row = next(m for m in c.get(f"/api/m/admin/cohorts/{STAGING}", headers=pin).json()["modules"] if m["id"] == "quran")
        assert row["lock"] == "scholar" and not row["on"]
        r = c.post(f"/api/m/admin/cohorts/{HUB}/flags/quran", json={"enabled": True, "both": True, "confirm": True},
                   headers=pin)
        assert r.status_code == 409 and "Hanafi scholar" in r.text
        assert c.get(f"/quran/index.json?cohort={HUB}").status_code == 404
        assert "quran" not in [m["id"] for m in c.get(f"/api/hello?cohort={STAGING}").json()["modules"]]
    sign_set(root / "quran")
    c, cfg = hub_on(tmp_path, root, release=True)
    with c:
        hub = c.app.state.hub
        assert hub.library.quran.signed and hub.held() == ()
        pin = {"X-Admin-Pin": admin_pin(cfg.data)}
        row = next(m for m in c.get(f"/api/m/admin/cohorts/{HUB}", headers=pin).json()["modules"] if m["id"] == "quran")
        assert row["lock"] is None
        assert c.post(f"/api/m/admin/cohorts/{HUB}/flags/quran", json={"enabled": True, "both": True, "confirm": True},
                      headers=pin).status_code == 200
        assert c.get(f"/quran/index.json?cohort={HUB}").status_code == 200


def test_a_set_that_fails_its_checks_holds_the_reader_off_everywhere(tmp_path):
    root = content(tmp_path)
    (root / "quran" / "tanzil-data.xml").write_text("<quran/>", encoding="utf-8")
    c, _ = hub_on(tmp_path, root)
    with c:
        assert c.app.state.hub.held() == ("quran",)
        assert "quran" not in [m["id"] for m in c.get("/api/hello").json()["modules"]]


# --- the reader's routes ---

def test_the_hub_serves_one_surah_at_a_time_and_only_fetched_recitations(tmp_path, qset):
    c, _ = hub_on(tmp_path, content(tmp_path))
    with c:
        assert "quran" in [m["id"] for m in c.get("/api/hello").json()["modules"]]       # staging: drafts served
        idx = c.get("/quran/index.json").json()
        assert len(idx["surahs"]) == 114 and idx["draft"] is True and "verses" not in json.dumps(idx)
        assert idx["surahs"][0]["audio"] is True and idx["surahs"][1]["audio"] is False
        d = c.get("/quran/surah/1.json").json()
        lines = tanzil_lines()
        assert [v["ar"] for v in d["verses"]] == [lines[(1, a)] for a in range(1, 8)]
        assert set(d["verses"][0]["tr"]) == {"prs", "ps"} and "CHANGING IT IS NOT ALLOWED" in d["notice"]
        assert d["verses"][0]["audio"]["url"] == "/quran/audio/ar.husary/1_1.mp3"
        assert c.get("/quran/surah/2.json").json()["verses"][0]["audio"] is None
        for bad in ("115.json", "0.json", "x.json", "1"):
            assert c.get("/quran/surah/" + bad).status_code == 404
        mp3 = c.get("/quran/audio/ar.husary/1_1.mp3")
        assert mp3.status_code == 200 and licences.sha256_bytes(mp3.content) == qset.audio["ar.husary"]["files"]["1:1"]["sha256"]
        for bad in ("ar.husary/2_1.mp3", "ar.husary/..%2Findex.json", "ar.other/1_1.mp3"):
            assert c.get("/quran/audio/" + bad).status_code == 404
        # the village hub's own cohort has the reader and review off: no route at all
        assert c.get(f"/quran/index.json?cohort={HUB}").status_code == 404


# --- the ayah step and the religious subjects ---

def test_an_ayah_step_names_a_verse_and_never_holds_its_text(tmp_path, qset):
    root = content(tmp_path, [ayah_lesson()])
    lib = Library(root / "packs")
    assert not lib.problems, lib.problems
    assert lib.quran.ok and "quran-t-1" in lib.lessons
    app = lib.lesson_for_app("quran-t-1")
    assert app["steps"][0] == {"kind": "ayah", "surah": 1, "ayah": 1}
    pdir = root / "packs" / "q"
    first = next(iter(tanzil_lines().values()))

    def probs(**over):
        return validate_lesson(ayah_lesson(**over), pdir, {}, qset)
    assert probs() == []
    assert any("names a verse only" in p for p in probs(steps=[{"kind": "ayah", "surah": 1, "ayah": 1, "text": {"ar": first}}]))
    assert any("no verse 1:8" in p for p in probs(steps=[{"kind": "ayah", "surah": 1, "ayah": 8}]))
    assert any("drafted_by" in p for p in probs(drafted_by="tools/import.py"))
    assert any("early years" in p for p in probs(year=0))
    assert any("only read and ayah steps" in p for p in probs(steps=[{"kind": "choice", "prompt": {"prs": "؟"},
                                                                       "options": ["a", "b"], "answer": 0}]))
    seerah = ayah_lesson(subject="seerah", steps=[{"kind": "read", "text": {"prs": "متن"}}])
    assert validate_lesson(seerah, pdir, {}, qset) == []
    seerah["steps"].append({"kind": "ayah", "surah": 1, "ayah": 1})
    assert any("belongs to a Quran lesson" in p for p in validate_lesson(seerah, pdir, {}, qset))
    # a pack that is not NC cannot play Islamic Network's recitation
    root2 = content(tmp_path / "b", [ayah_lesson()], pack={"licence": "open"})
    assert any('must say "licence": "NC"' in p for p in Library(root2 / "packs").problems)


def test_a_new_translation_version_voids_a_lessons_signatures(tmp_path):
    root = content(tmp_path, [ayah_lesson()])
    before = Library(root / "packs").hashes["quran-t-1"]
    t = root / "quran" / "translations" / "dari_badkhashani.json"
    doc = json.loads(t.read_text(encoding="utf-8"))
    doc["verses"][0][2] = doc["verses"][0][2] + " "
    t.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    rehash(root / "quran")
    after = Library(root / "packs")
    assert after.quran.ok and after.hashes["quran-t-1"] != before


def test_release_wants_the_scholar_every_recording_and_a_signed_set(tmp_path):
    l = ayah_lesson(steps=[{"kind": "ayah", "surah": 1, "ayah": 1}, {"kind": "ayah", "surah": 2, "ayah": 1}],
                    review={"status": "draft", "needs": ["Dari reader", "Pashto reader"], "signoffs": []})
    root = content(tmp_path, [l])
    lib = Library(root / "packs")
    pack = lib.packs["q"]
    p = release_problems(l, "draft", pack, {}, lib.quran)
    assert any("must include a Hanafi scholar" in x for x in p)
    assert any("not signed by a Hanafi scholar" in x for x in p)
    assert any("2:1 has no recitation" in x for x in p)
    assert sum("needs a recorded" in x for x in p) == 4                 # each verse's translation, in Dari and Pashto
    assert not any("subject teacher" in x for x in p)
    seerah = ayah_lesson(subject="seerah", steps=[{"kind": "read", "text": {"prs": "متن"}}])
    assert any("needs a recorded prs clip" in x for x in release_problems(seerah, "draft", pack, {}, lib.quran))


def test_quran_and_seerah_never_reach_asks_index_or_a_prompt(tmp_path, qset):
    seerah = ayah_lesson(lid="seerah-t-1", subject="seerah",
                         steps=[{"kind": "read", "text": {"prs": "پیامبر در مکه به دنیا آمد", "ps": "پیغمبر په مکه کې زوکړی"}}])
    root = content(tmp_path, [ayah_lesson(), seerah])
    lib = Library(root / "packs")
    ix = search.build(lib)
    assert not [d for d in ix.docs if d.get("subject") in ("quran", "seerah")]
    c, _ = hub_on(tmp_path, root)
    with c:
        hub = c.app.state.hub
        tr = qset.tr["prs"]["verses"]
        for q, lid in [(tr[(1, 2)][0], "quran-t-1"), ("پیامبر در مکه به دنیا آمد؟", "seerah-t-1"),
                       (tr[(112, 1)][0] + " چرا؟", None)]:
            c.post("/api/ask", json={"text": q, "lang": "prs", "lesson": lid})
        sent = hub.gateway.provider.sent_text()
        assert len(hub.gateway.provider.sent) >= 1           # the questions did reach the (fake) AI
        lines = [v for v in qset.lines() if len(v) > 8]
        assert not any(v in sent for v in lines)
        assert "پیامبر در مکه به دنیا آمد" not in "".join(json.dumps(m["messages"][:-1], ensure_ascii=False)
                                                          for m in hub.gateway.provider.sent)


def test_a_religious_ruling_is_declined_with_ask_a_scholar():
    for q in ("is this haram?", "آیا این حلال است؟", "د دې فتوا څه ده؟"):
        r = rules.screen(q)
        assert r == ("off_limits", False)
        assert rules.message(q, r[0], "en") == "I only help with lessons. Please ask a scholar you trust."
    assert "scholar" not in rules.message("what about the election?", "off_limits", "en")


# --- the scholar's review ---

def test_the_scholar_reads_every_surah_signs_the_set_and_the_switch_unlocks(tmp_path):
    root = content(tmp_path)
    c, cfg = hub_on(tmp_path, root)
    with c:
        pin = {"X-Teacher-Pin": teacher_pin(cfg.data)}
        role = "Hanafi scholar"
        assert role in c.get("/api/m/review/me", headers=pin).json()["roles"]
        q = c.get("/api/m/review/queue", params={"role": role}, headers=pin).json()["quran"]
        assert q["surahs"] == 114 and q["status"] == "not_started"
        page = c.get("/api/m/review/quran", params={"role": role}, headers=pin).json()
        assert len(page["steps"]) == 115 and page["needs"] == [role]
        assert page["set"]["translations"][0]["key"] == "dari_badkhashani"
        assert c.get("/api/m/review/quran", params={"role": "Dari reader"}, headers=pin).status_code == 403
        sign = {"hash": page["hash"], "role": role, "initials": "AB"}
        assert c.post("/api/m/review/quran/sign", json=sign, headers=pin).status_code == 409
        for st in page["steps"]:
            r = c.post(f"/api/m/review/quran/steps/{st['n']}", headers=pin,
                       json={"verdict": "ok", "step_hash": st["hash"], "role": role})
            assert r.status_code == 200
        assert c.post("/api/m/review/quran/steps/1", headers=pin,
                      json={"verdict": "ok", "step_hash": "sha256:old", "role": role}).status_code == 409
        assert c.post("/api/m/review/quran/sign", json=sign, headers=pin).json()["signed"] is True
        rows = c.get("/api/m/review/signoffs", headers=pin).json()["signoffs"]
    assert [r["lesson"] for r in rows] == ["quran:set"]
    report = pull.pull(rows, root / "packs")
    assert report["copied"] == ["quran:set: Hanafi scholar AB " + rows[0]["date"]]
    q = QuranSet(root / "quran")
    assert q.ok and q.signed and review_state(q.index, q.hash) == "signed"
    # the set's hash ignores its review block, so the signature holds; one changed file voids it
    c, _ = hub_on(tmp_path, root, release=True)
    with c:
        assert c.app.state.hub.held() == ()
    shutil.copy2(root / "quran" / "translations" / "pashto_rwwad.json", tmp_path / "keep.json")
    t = root / "quran" / "translations" / "pashto_rwwad.json"
    doc = json.loads(t.read_text(encoding="utf-8"))
    doc["key"], doc["verses"][5][3] = "pashto_rwwad", doc["verses"][5][3] + "."
    t.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    rehash(root / "quran")
    assert not QuranSet(root / "quran").signed


def test_the_worker_keeps_the_sets_checks_not_its_text(tmp_path):
    spec = importlib.util.spec_from_file_location("worker_build_q", TUTOR / "worker" / "build.py")
    build = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(build)
    build.build(tmp_path / "b")
    light = tmp_path / "b" / "src" / "content" / "quran"
    assert [f.name for f in light.iterdir()] == ["light.json"]
    text = (light / "light.json").read_text(encoding="utf-8")
    assert not any(v in text for v in tanzil_lines().values() if len(v) > 8)
    q = QuranSet(light)
    assert q.ok and q.light is not None and q.has(1, 7) and not q.has(1, 8) and q.listed(1, 1)
    pub = tmp_path / "b" / "public" / "quran"           # a staging build: the reader's files, as the hub serves them
    assert len(list((pub / "surah").glob("*.json"))) == 114 and (pub / "audio" / "ar.husary" / "1_1.mp3").is_file()
    assert json.loads((pub / "surah" / "1.json").read_text(encoding="utf-8"))["verses"][0]["ar"] == tanzil_lines()[(1, 1)]
