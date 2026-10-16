"""The content pipeline (P8): licence classes from content/sources.json, sources blocks, link cards, content hashes
and signoffs, release mode, credits, and the Bloom importer."""
import copy
import importlib.util
import json
import shutil
import zipfile

import pytest

from tutor_hub.config import Config
from tutor_hub.licences import Sources, item_terms, sha256_bytes, sha256_text
from tutor_hub.packs import Library, content_hash, review_state

from conftest import PACKS, TUTOR

SOURCES = TUTOR / "content" / "sources.json"


def tool(name):
    spec = importlib.util.spec_from_file_location(name, TUTOR / "tools" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


validate_pack = tool("validate_pack")
import_bloom = tool("import_bloom")


def starter(name):
    return json.loads((PACKS / "starter" / "lessons" / f"{name}.json").read_text(encoding="utf-8"))


def make_pack(tmp_path, lessons, *, links=None, sources=SOURCES, **pack_fields):
    """A pack folder with the given lessons (and the starter's pictures), beside a sources.json."""
    root = tmp_path / "content"
    pdir = root / "packs" / "p"
    (pdir / "lessons").mkdir(parents=True)
    shutil.copytree(PACKS / "starter" / "pictures", pdir / "pictures")
    shutil.copy(sources, root / "sources.json")
    for l in lessons:
        (pdir / "lessons" / f"{l['id']}.json").write_text(json.dumps(l, ensure_ascii=False), encoding="utf-8")
    pack = {"id": "p", "version": "1", "title": {"en": "Test"}, "langs": ["prs", "ps"],
            "lessons": [l["id"] for l in lessons], **pack_fields}
    (pdir / "pack.json").write_text(json.dumps(pack), encoding="utf-8")
    if links is not None:
        (pdir / "links.json").write_text(json.dumps(links, ensure_ascii=False), encoding="utf-8")
    return root / "packs"


def use(sid, **kw):
    return {"id": sid, "item": "item-1", "title": "A story", "url": "https://example.org/item-1",
            "licence": "CC BY 4.0", "author": "An Author", "checked": "2026-10-16", **kw}


def with_sources(*entries, lid="maths-7-fractions-add"):
    l = copy.deepcopy(starter("maths-7-fractions-add"))
    l["id"] = lid
    l["sources"] = list(entries)
    return l


def problems(packs, **kw):
    lib = Library(packs, **kw)
    return lib, "\n".join(lib.sources.problems + lib.problems + lib.hidden)


def card(**kw):
    return {"id": "a-card", "source": "begum-academy", "title": "Begum Academy",
            "about": {"en": "Free video lessons for years 7 to 12.", "prs": "درس‌های ویدیویی"},
            "url": "https://begum-academy.org/en/", "subject": "maths", "years": [7], **kw}


# sources.json itself

def test_the_real_sources_file_is_clean_and_uses_the_apps_codes():
    s = Sources(SOURCES)
    assert s.problems == [] and len(s.by_id) == 41
    langs = {l for x in s.by_id.values() for l in x["languages"]}
    assert langs <= {"prs", "ps", "en", "fa", "ar", "zh", "ur"} and "pus" not in langs and "eng" not in langs
    assert all("ages" not in x and set(x["bands"]) <= {"ey", "p1", "p2", "s1", "s2", "ad"} for x in s.by_id.values())
    assert s.by_id["afghan-children-read-bloom"]["bands"] == ["ey", "p1", "p2", "ad"]


def test_the_committees_corrections_and_flags_hold():
    s = Sources(SOURCES)
    assert s.effective_class("begum-academy") == "ASK"            # link only, copy nothing
    assert s.effective_class("openstax") == "BUNDLE-NC" and "no_ai" in s.flags("openstax")
    assert {"verbatim", "exact_attribution"} <= s.flags("tanzil-quran-text")
    assert {"verbatim", "exact_attribution"} <= s.flags("quranenc-translations")
    for sid in ("phet-simulations", "illustrative-mathematics", "voa-learning-english"):
        assert "exact_attribution" in s.flags(sid)
    for sid in ("bloom-library", "afghan-children-read-bloom", "global-digital-library", "storyweaver", "kolibri",
                "darakht-e-danesh-library"):
        assert "per_item_licence" in s.flags(sid)
    assert s.effective_class("quranicaudio-everyayah") == "AVOID"
    assert s.effective_class("bbc-dars") == "LINK"


def test_licence_lines_are_read_cautiously():
    assert item_terms("CC BY-NC-SA 4.0") == {"open": True, "nc": True, "sa": True, "nd": False}
    assert item_terms("CC0")["open"] and item_terms("Public domain")["open"]
    assert not item_terms("All rights reserved")["open"] and not item_terms("custom")["open"]


# what CI refuses (each through validate_pack.py, which CI runs)

def test_a_lesson_citing_an_avoid_source_fails_ci(tmp_path, capsys):
    packs = make_pack(tmp_path, [with_sources(use("quranicaudio-everyayah"))])
    assert validate_pack.main([str(packs)]) == 1
    assert "is AVOID and is never used" in capsys.readouterr().out


def test_nc_material_only_in_an_nc_pack(tmp_path, capsys):
    l = with_sources(use("khan-academy", licence="CC BY-NC-SA"))
    assert validate_pack.main([str(make_pack(tmp_path / "a", [l], share_alike=True))]) == 1
    assert 'only into packs marked "licence": "NC"' in capsys.readouterr().out
    assert validate_pack.main([str(make_pack(tmp_path / "b", [l], licence="NC", share_alike=True))]) == 0


def test_an_nc_item_from_a_per_item_source_is_nc_too(tmp_path):
    l = with_sources(use("bloom-library", licence="CC BY-NC 4.0"))
    _, out = problems(make_pack(tmp_path, [l]))
    assert "NC" in out


def test_copied_text_in_a_link_card_fails_ci(tmp_path, capsys):
    packs = make_pack(tmp_path, [], links=[card(text={"prs": "the whole lesson, copied"})])
    assert validate_pack.main([str(packs)]) == 1
    assert "a link card holds no copied text" in capsys.readouterr().out


@pytest.mark.parametrize("bad, why", [
    (card(about={"en": "x" * 141}), "at most 140 characters"),
    (card(source="quranicaudio-everyayah"), "AVOID"),
    (card(source="nobody"), "not in content/sources.json"),
    (card(url="http://begum-academy.org/"), "https://"),
    (card(embed="<iframe>"), "unknown field"),
])
def test_link_cards_hold_only_our_words_and_a_link(tmp_path, bad, why):
    lib, out = problems(make_pack(tmp_path, [], links=[bad]))
    assert why in out and lib.links == []


def test_link_only_sources_are_fine_as_link_cards(tmp_path):
    cards = [card(), card(id="openstax-physics", source="openstax", title="OpenStax College Physics", years=[7, 11],
                          url="https://openstax.org/", about={"en": "A free physics textbook, in English."})]
    lib, out = problems(make_pack(tmp_path, [], links=cards))
    assert out == "" and [c["id"] for c in lib.link_cards()] == ["a-card", "openstax-physics"]
    assert lib.link_cards()[0]["needs"] == ["internet"] and lib.link_cards()[0]["owner"].startswith("Begum")
    assert [c["id"] for c in lib.link_cards(subject="maths", year=7)] == ["a-card", "openstax-physics"]
    assert [c["id"] for c in lib.link_cards(year=11)] == ["openstax-physics"]


@pytest.mark.parametrize("sid, why", [
    ("begum-academy", "is ASK: nothing may be copied"),       # free to watch is not free to copy
    ("bbc-learning-english", "is LINK: nothing may be copied"),
    ("openstax", "is no_ai"),                                 # link-only in 2027
    ("not-registered", "not in content/sources.json"),
])
def test_nothing_is_copied_from_link_ask_no_ai_or_unknown_sources(tmp_path, sid, why):
    _, out = problems(make_pack(tmp_path, [with_sources(use(sid))], licence="NC", share_alike=True))
    assert why in out


def test_a_written_permission_lets_an_ask_source_in(tmp_path):
    packs = make_pack(tmp_path, [with_sources(use("solax", licence="Permission, non-commercial"))], licence="NC")
    perms = packs.parent / "permissions"
    perms.mkdir()
    (perms / "solax.md").write_text("# SOLAx\n\nstatus: asked\n", encoding="utf-8")
    assert "is ASK" in problems(packs)[1]
    (perms / "solax.md").write_text("# SOLAx\n\nstatus: granted\nclass: BUNDLE-NC\ngranted: 2027-01-10\n",
                                    encoding="utf-8")
    lib, out = problems(packs)
    assert out == "" and lib.sources.effective_class("solax") == "BUNDLE-NC"


def test_begum_academy_has_no_permission_on_file():
    folder = TUTOR / "content" / "permissions"
    assert not (folder / "begum-academy.md").exists()
    assert Sources(SOURCES).effective_class("begum-academy") == "ASK"


def test_a_per_item_source_follows_the_items_own_licence(tmp_path):
    _, out = problems(make_pack(tmp_path, [with_sources(use("storyweaver", licence="All rights reserved"))]))
    assert "the item's own licence" in out
    ok = use("storyweaver", licence="CC BY 4.0", fields={"illustrator": "An Illustrator"})
    _, out = problems(make_pack(tmp_path / "b", [with_sources(ok)]))
    assert out == ""


def test_by_sa_and_nc_sa_never_share_a_lesson_and_sa_reaches_the_pack(tmp_path):
    both = with_sources(use("wikipedia-fa-ps", licence="CC BY-SA 4.0"), use("khan-academy", licence="CC BY-NC-SA"))
    _, out = problems(make_pack(tmp_path, [both], licence="NC", share_alike=True))
    assert "never go in one lesson" in out
    sa = with_sources(use("wikipedia-fa-ps", licence="CC BY-SA 4.0", fields={"language": "Persian"}))
    assert '"share_alike": true' in problems(make_pack(tmp_path / "b", [sa]))[1]
    lib, out = problems(make_pack(tmp_path / "c", [sa], share_alike=True))
    assert out == "" and lib.terms["maths-7-fractions-add"] == {"nc": False, "sa": True}


def test_verbatim_text_must_match_its_source_by_hash(tmp_path):
    l = with_sources()
    verse = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"
    l["steps"][0]["text"]["ar"] = verse
    l["steps"][0]["text"] = {k: v for k, v in l["steps"][0]["text"].items() if k != "ar"}   # ar is not a lesson lang
    l["steps"].insert(0, {"kind": "read", "text": {"prs": verse}})
    e = use("tanzil-quran-text", licence="Tanzil terms", field="steps.0.text.prs", sha256=sha256_text(verse))
    l["sources"] = [e]
    assert problems(make_pack(tmp_path, [l]))[1] == ""
    l["steps"][0]["text"]["prs"] = verse + "."
    assert "does not match its source" in problems(make_pack(tmp_path / "b", [l]))[1]
    l["sources"] = [dict(e, changes="Shortened")]
    assert "nothing may be changed" in problems(make_pack(tmp_path / "c", [l]))[1]


def test_a_source_entry_holds_no_copied_text_and_its_credit_line_fills(tmp_path):
    _, out = problems(make_pack(tmp_path, [with_sources(use("storyweaver", text="the story"))]))
    assert "unknown field ['text']" in out
    _, out = problems(make_pack(tmp_path / "b", [with_sources(use("bloom-library", author=None))]))
    assert "credit line needs {author}" in out


def test_nd_items_take_no_changes(tmp_path):
    _, out = problems(make_pack(tmp_path, [with_sources(use("bloom-library", licence="cc-by-nd",
                                                            changes="Translated into Dari"))]))
    assert "allows no changes" in out


# content hashes, signoffs and release mode

def signed(lesson, pdir, roles=None):
    l = copy.deepcopy(lesson)
    roles = roles or l["review"]["needs"]
    h = content_hash(l, pdir)
    l["review"]["signoffs"] = [{"role": r, "initials": "AB", "date": "2027-02-14", "hash": h} for r in roles]
    return l


def test_signoffs_cover_the_exact_content_and_any_change_voids_them():
    pdir = PACKS / "starter"
    l = signed(starter("maths-7-fractions-add"), pdir)
    assert review_state(l, content_hash(l, pdir)) == "signed"
    assert review_state(starter("maths-7-fractions-add"), content_hash(l, pdir)) == "draft"
    l2 = copy.deepcopy(l)
    l2["title"]["prs"] += "!"
    assert review_state(l2, content_hash(l2, pdir)) == "changed"
    part = signed(starter("maths-7-fractions-add"), pdir, roles=["Dari reader"])
    assert review_state(part, content_hash(part, pdir)) == "draft"


def test_a_changed_picture_voids_the_signatures(tmp_path):
    packs = make_pack(tmp_path, [])
    pdir = packs / "p"
    l = signed(starter("dari-1-sheen"), pdir)
    before = content_hash(l, pdir)
    (pdir / "pictures" / "milk.svg").write_text("<svg xmlns='http://www.w3.org/2000/svg'/>", encoding="utf-8")
    assert content_hash(l, pdir) != before


def test_signoffs_take_initials_never_names(tmp_path):
    l = signed(starter("maths-7-fractions-add"), PACKS / "starter")
    l["review"]["signoffs"][0]["initials"] = "Ahmad"
    assert "never a name" in problems(make_pack(tmp_path, [l]))[1]


def test_release_serves_only_signed_lessons_and_cards(tmp_path, capsys):
    packs = make_pack(tmp_path, [])
    pdir = packs / "p"
    good = signed(starter("maths-7-fractions-add"), pdir)
    draft = starter("science-7-states-of-matter")
    c = card(review={"status": "draft", "needs": ["Dari reader", "Pashto reader"]})
    signed_card = signed(dict(card(id="b-card"), review={"status": "draft", "needs": ["Dari reader"]}), pdir)
    for l in (good, draft):
        (pdir / "lessons" / f"{l['id']}.json").write_text(json.dumps(l, ensure_ascii=False), encoding="utf-8")
    pack = json.loads((pdir / "pack.json").read_text())
    pack["lessons"] = [good["id"], draft["id"]]
    (pdir / "pack.json").write_text(json.dumps(pack))
    (pdir / "links.json").write_text(json.dumps([c, signed_card], ensure_ascii=False), encoding="utf-8")

    lib = Library(packs, release=True)
    assert list(lib.lessons) == ["maths-7-fractions-add"] and [x["id"] for x in lib.links] == ["b-card"]
    assert any("science-7-states-of-matter: not signed" in x for x in lib.hidden)
    staging = Library(packs)
    assert set(staging.lessons) == {good["id"], draft["id"]} and len(staging.links) == 2
    rows = {l["id"]: l for p in staging.summary() for l in p["lessons"]}
    assert rows[good["id"]]["draft"] is False and rows[draft["id"]]["draft"] is True
    assert validate_pack.main([str(packs), "--release"]) == 1
    out = capsys.readouterr().out
    assert "science-7-states-of-matter: not signed" in out and "a-card: not signed" in out


def test_release_needs_recorded_clips_for_the_youngest_and_every_letter(tmp_path):
    packs = make_pack(tmp_path, [])
    pdir = packs / "p"
    l = signed(starter("dari-1-sheen"), pdir)
    (pdir / "lessons" / "dari-1-sheen.json").write_text(json.dumps(l, ensure_ascii=False), encoding="utf-8")
    pack = json.loads((pdir / "pack.json").read_text())
    pack["lessons"] = ["dari-1-sheen"]
    (pdir / "pack.json").write_text(json.dumps(pack))
    lib = Library(packs, release=True)
    assert lib.lessons == {} and any("needs a recorded prs clip" in x for x in lib.hidden)

    # placeholder recordings plumb through but never count for release
    for lang in ("prs", "ps"):
        (pdir / "audio" / lang).mkdir(parents=True)
        clips = {}
        for i in range(len(l["steps"])):
            f = pdir / "audio" / lang / f"s{i}.opus"
            f.write_bytes(b"OggS placeholder " + bytes([i]))
            clips[f"s{i}"] = {"file": f.name, "speaker": "placeholder", "placeholder": True,
                              "sha256": sha256_bytes(f.read_bytes())}
        (pdir / "audio" / lang / "manifest.json").write_text(json.dumps({"clips": clips}), encoding="utf-8")
    for i, st in enumerate(l["steps"]):
        st["audio"] = {"prs": f"s{i}", "ps": f"s{i}"}
    l = signed({k: v for k, v in l.items() if k != "review"} | {"review": {"status": "draft",
                                                                           "needs": l["review"]["needs"]}}, pdir)
    (pdir / "lessons" / "dari-1-sheen.json").write_text(json.dumps(l, ensure_ascii=False), encoding="utf-8")
    lib = Library(packs, release=True)
    assert lib.lessons == {} and any("is a placeholder" in x for x in lib.hidden)
    staged = Library(packs).lesson_for_app("dari-1-sheen")
    assert staged["steps"][0]["audio"]["prs"] == {"url": "/packs/p/audio/prs/s0.opus", "placeholder": True}
    for lang in ("prs", "ps"):
        m = pdir / "audio" / lang / "manifest.json"
        d = json.loads(m.read_text())
        for c in d["clips"].values():
            c["placeholder"], c["speaker"] = False, f"{lang}-01"
        m.write_text(json.dumps(d))
    assert "dari-1-sheen" not in Library(packs, release=True).lessons     # clip hashes changed: sign again
    l = signed({**l, "review": {"status": "draft", "needs": l["review"]["needs"]}}, pdir)
    (pdir / "lessons" / "dari-1-sheen.json").write_text(json.dumps(l, ensure_ascii=False), encoding="utf-8")
    assert "dari-1-sheen" in Library(packs, release=True).lessons


def test_a_clip_is_never_synthetic_and_never_unlisted(tmp_path, capsys):
    packs = make_pack(tmp_path, [starter("maths-7-fractions-add")])
    d = packs / "p" / "audio" / "prs"
    d.mkdir(parents=True)
    (d / "stray.opus").write_bytes(b"x")
    (d / "manifest.json").write_text(json.dumps({"clips": {"tts": {"file": "tts.opus", "speaker": "tts",
                                                                  "placeholder": False, "synthetic": True,
                                                                  "sha256": "sha256:00"}}}))
    assert validate_pack.main([str(packs)]) == 1
    out = capsys.readouterr().out
    assert "no synthetic voice" in out and "stray.opus: not in manifest.json" in out and "tts.opus" in out


# the hub serving it

@pytest.fixture
def release_client(tmp_path):
    from fastapi.testclient import TestClient

    from tutor_hub.server import create_app
    cfg = Config.from_env(data=tmp_path / "data", print_backend="outbox", llm_url=None, release=True)
    with TestClient(create_app(cfg)) as c:
        yield c


def test_production_hides_the_starter_drafts(release_client):
    assert release_client.get("/api/packs").json()["packs"][0]["lessons"] == []
    assert release_client.get("/api/lessons/maths-7-fractions-add").status_code == 404
    assert release_client.get("/api/sheets/maths-7-fractions-add/key?seed=1").status_code == 404
    assert release_client.get("/api/links").json() == {"links": []}
    assert release_client.get("/api/hello").json()["release"] is True


def test_staging_shows_the_drafts_marked_as_drafts(hub_client):
    rows = hub_client.get("/api/packs").json()["packs"][0]["lessons"]
    assert len(rows) == 6 and all(r["draft"] for r in rows)
    l = hub_client.get("/api/lessons/maths-7-fractions-add").json()
    assert l["draft"] is True and l["credits"] == [] and "review" not in l and "sources" not in l
    assert hub_client.get("/api/hello").json()["release"] is False


def test_link_cards_and_credits_from_the_hub(hub_client):
    cards = hub_client.get("/api/links?subject=maths&year=7").json()["links"]
    assert [c["id"] for c in cards] == ["begum-academy-maths"]
    assert cards[0]["needs"] == ["internet"] and cards[0]["draft"] is True
    assert set(cards[0]) >= {"title", "about", "url", "owner"} and "text" not in cards[0]
    assert hub_client.get("/api/links?subject=science").json()["links"] == []
    cr = hub_client.get("/api/credits").json()
    assert cr["sources"] == [] and [x["id"] for x in cr["linked"]] == ["begum-academy"]
    assert {a["name"] for a in cr["app"]} == {"Vazirmatn", "Noto Naskh Arabic"}


def test_the_apps_credits_file_names_the_same_fonts():
    """app/credits.json (the Credits screen's fonts, sounds, code and voices) and the hub's list agree."""
    from tutor_hub.licences import APP_CREDITS
    doc = json.loads((TUTOR / "app" / "credits.json").read_text(encoding="utf-8"))
    assert doc["fonts"] == APP_CREDITS
    assert all(v == {"credit": None} for v in doc["voices"].values())     # no recorder has asked to be named


def test_a_lesson_from_outside_carries_its_credit_line(tmp_path):
    l = with_sources(use("afghan-children-read-bloom", licence="CC0", changes="Pictures left out"))
    lib, out = problems(make_pack(tmp_path, [l]))
    assert out == ""
    cr = lib.lesson_for_app(l["id"])["credits"]
    assert cr[0]["line"].startswith("Story from Afghan Children Read") and cr[0]["changes"] == "Pictures left out"
    assert lib.credits()["sources"][0]["items"][0]["used_in"] == l["id"]


# the Bloom importer

BOOK_HTML = """<html><body>
<div class="bloom-page cover coverColor bloom-frontMatter"><div class="bloom-editable" lang="prs"><p>جلد</p></div></div>
<div class="bloom-page numberedPage"><div class="bloom-imageContainer"><img src="page1.svg"></div>
  <div class="bloom-translationGroup">
    <div class="bloom-editable" lang="prs"><p>PLACEHOLDER-PRS one.</p><p>PLACEHOLDER-PRS two.</p></div>
    <div class="bloom-editable" lang="pbt"><p>PLACEHOLDER-PS one.</p></div>
    <div class="bloom-editable" lang="z"><p>template</p></div>
  </div></div>
<div class="bloom-page numberedPage"><div class="bloom-editable" lang="prs"><p>PLACEHOLDER-PRS page two.</p></div></div>
<div class="bloom-page credits bloom-backMatter"><div class="bloom-editable" lang="prs"><p>credits page</p></div></div>
</body></html>"""


def book(tmp_path, licence="cc0"):
    """A made-up Bloom book: placeholder text only (no real story is copied into the tests)."""
    meta = {"bookInstanceId": "0000-test", "title": "Test book", "license": licence,
            "allTitles": json.dumps({"prs": "PLACEHOLDER-PRS title", "en": "Test book"}),
            "copyright": "Copyright © 2021, Test Owner"}
    f = tmp_path / "book.bloompub"
    with zipfile.ZipFile(f, "w") as z:
        z.writestr("meta.json", json.dumps(meta))
        z.writestr("Test book.htm", BOOK_HTML)
        z.writestr("page1.svg", '<svg xmlns="http://www.w3.org/2000/svg"><path stroke="#000" fill="black" d="M0 0h1"/></svg>')
    return f


def import_args(tmp_path, f, packs, *more):
    return [str(f), "--pack", str(packs / "p"), "--id", "dari-1-reader-01", "--subject", "dari", "--year", "1",
            "--url", "https://bloomlibrary.org/book/test", "--checked", "2026-10-16", "--add", *more]


def test_the_importer_makes_a_draft_lesson_that_validates(tmp_path, capsys):
    packs = make_pack(tmp_path, [])
    assert import_bloom.main(import_args(tmp_path, book(tmp_path), packs)) == 0
    l = json.loads((packs / "p" / "lessons" / "dari-1-reader-01.json").read_text(encoding="utf-8"))
    assert [s["text"] for s in l["steps"]] == [{"prs": "PLACEHOLDER-PRS one.\nPLACEHOLDER-PRS two.",
                                                "ps": "PLACEHOLDER-PS one."}, {"prs": "PLACEHOLDER-PRS page two."}]
    assert l["title"] == {"prs": "PLACEHOLDER-PRS title", "en": "Test book"}
    src = l["sources"][0]
    assert src["id"] == "afghan-children-read-bloom" and src["licence"] == "CC0" and src["author"] == "Test Owner"
    assert l["review"]["status"] == "draft" and "picture" not in l["steps"][0]
    assert validate_pack.main([str(packs)]) == 0
    assert Library(packs).lessons["dari-1-reader-01"]


def test_the_importer_refuses_what_the_licence_does_not_allow(tmp_path, capsys):
    packs = make_pack(tmp_path, [])
    assert import_bloom.main(import_args(tmp_path, book(tmp_path, "cc-by-nc"), packs)) == 1
    assert "NC" in capsys.readouterr().out
    assert import_bloom.main(import_args(tmp_path, book(tmp_path, "custom"), packs)) == 1
    assert "does not allow copying" in capsys.readouterr().out
    assert not (packs / "p" / "lessons" / "dari-1-reader-01.json").exists()


def test_imported_svg_line_art_follows_the_theme(tmp_path):
    packs = make_pack(tmp_path, [])
    assert import_bloom.main(import_args(tmp_path, book(tmp_path), packs, "--pictures")) == 0
    svg = (packs / "p" / "pictures" / "dari-1-reader-01-1.svg").read_text(encoding="utf-8")
    assert 'stroke="currentColor"' in svg and 'fill="currentColor"' in svg and "#000" not in svg
    pack = json.loads((packs / "p" / "pack.json").read_text(encoding="utf-8"))
    assert pack["media"]["pictures/dari-1-reader-01-1.svg"][0]["id"] == "afghan-children-read-bloom"
    lib, out = problems(packs)
    assert out == "" and lib.credits()["sources"][0]["items"][-1]["used_in"] == "p/pictures/dari-1-reader-01-1.svg"
