"""Getting ready for university (P28, C4.6): the checklist and the university cards, the no-promise lint, cards that
hide six months after a person checked them, the adviser's review and the lock until the first card set is signed.
No network: the pack is content/packs/university-1 as committed."""
import importlib.util
import json
import shutil

from fastapi.testclient import TestClient

from tutor_hub import licences
from tutor_hub.packs import Library, check_checklist, review_state
from tutor_hub.server import admin_pin, create_app, teacher_pin

from conftest import TUTOR

PACK = TUTOR / "content" / "packs" / "university-1"
SOURCES = TUTOR / "content" / "sources.json"
STAGING = "qg1j2918yx"
HUB = "d6co6etep6"
ROLES = ("adviser", "Dari reader", "Pashto reader")

spec = importlib.util.spec_from_file_location("pull_signoffs", TUTOR / "tools" / "pull_signoffs.py")
pull = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pull)


def content(tmp_path, cards=None, checklist=None):
    """A content folder with sources.json and a copy of the university pack (its cards or checklist replaced)."""
    root = tmp_path / "content"
    (root / "packs").mkdir(parents=True)
    shutil.copy2(SOURCES, root / "sources.json")
    shutil.copytree(PACK, root / "packs" / "university-1")
    if cards is not None:
        (root / "packs" / "university-1" / "links.json").write_text(json.dumps(cards, ensure_ascii=False), "utf-8")
    if checklist is not None:
        (root / "packs" / "university-1" / "checklist.json").write_text(json.dumps(checklist, ensure_ascii=False),
                                                                        "utf-8")
    return root


def real_cards():
    return json.loads((PACK / "links.json").read_text(encoding="utf-8"))


def hub_on(tmp_path, root, *, release=False):
    from tutor_hub.config import Config
    cfg = Config.from_env(data=tmp_path / "data", print_backend="outbox", llm_url=None, packs=root / "packs",
                          release=release, cohort=STAGING, ai_provider="fake")
    return TestClient(create_app(cfg)), cfg


def test_the_pack_loads_clean_with_its_checklist_and_cards():
    lib = Library(TUTOR / "content" / "packs")
    assert not lib.problems, lib.problems
    cl = lib.checklists["university-1"]
    assert len(cl["steps"]) == 8 and cl["steps"][0]["open"] == "subject:maths"
    cards = [c for c in lib.links if c.get("subject") == "university"]
    assert len(cards) >= 8 and {c["kind"] for c in cards} <= set(licences.CARD_KINDS)
    for c in cards:
        assert set(c["review"]["needs"]) >= set(ROLES)
        assert c["review_by"] <= licences.add_months(c["checked"], 6)
        assert lib.sources.effective_class(c["source"]) in licences.UNI_SOURCE_CLASSES
        assert c["url"].startswith("https://")
    # university cards show on the university screen only, never on a subject page
    assert all(c.get("subject") != "university" for c in lib.link_cards())
    assert all(c.get("subject") != "university" for c in lib.link_cards(subject="maths", year=10))


def test_a_card_hides_after_its_review_by_date():
    lib = Library(TUTOR / "content" / "packs")
    some = lib.university(today="2026-10-17")
    assert some["checklist"]["draft"] is True and len(some["cards"]) >= 8
    assert {"kind", "cost", "who", "checked", "review_by", "owner"} <= set(some["cards"][0])
    last = max(c["review_by"] for c in some["cards"])
    assert lib.university(today=last)["cards"]
    assert lib.university(today=licences.add_months(last, 1))["cards"] == []


def test_the_no_promise_lint_refuses_promising_words_in_every_language(tmp_path):
    s = licences.Sources(SOURCES)
    good = real_cards()[0]
    assert s.check_card(good, "x") == []
    for field, lang, text in [("about", "en", "A guaranteed place for you."),
                              ("about", "en", "Everyone gets a place."),
                              ("who", "en", "100% of students."),
                              ("about", "prs", "بورسیه‌ رایگان برای همه"),
                              ("who", "ps", "تضمین شوی ځای"),
                              ("title", None, "Free scholarship")]:
        c = json.loads(json.dumps(good))
        if lang:
            c[field][lang] = text
        else:
            c[field] = text
        assert any("promises" in p for p in s.check_card(c, "x")), (field, text)
    cl = json.loads((PACK / "checklist.json").read_text(encoding="utf-8"))
    assert check_checklist(cl, "x") == []
    cl["steps"][2]["text"]["en"] = "You will get a scholarship"
    assert any("promises" in p for p in check_checklist(cl, "x"))


def test_a_university_card_says_what_it_costs_who_may_apply_and_when_it_was_checked():
    s = licences.Sources(SOURCES)
    good = real_cards()[0]

    def probs(**over):
        c = {**json.loads(json.dumps(good)), **over}
        for k in [k for k, v in over.items() if v is None]:
            c.pop(k)
        return " | ".join(s.check_card(c, "x"))

    assert "needs who" in probs(who=None)
    assert "kind must be" in probs(kind="tip")
    assert "cost must be" in probs(cost="cheap")
    assert "at most 6 months" in probs(checked="2026-10-17", review_by="2027-04-18")
    assert "comes after" in probs(review_by="2026-10-01")
    assert "LINK or better" in probs(source="begum-academy")                   # ASK: ask before linking a course
    assert "must include an adviser" in probs(review={"status": "draft", "needs": ["Dari reader", "Pashto reader"]})
    assert "no copied text" in probs(text="copied")
    cl = {"steps": [{"id": "a", "text": {"prs": "x"}}], "review": {"status": "draft", "needs": list(ROLES)}}
    assert any("text must be" in p for p in check_checklist(cl, "x"))
    cl = {"steps": [{"id": "ab", "text": {"prs": "x", "ps": "y"}, "open": "https://example.org"}],
          "review": {"status": "draft", "needs": ["Dari reader"]}}
    assert len(check_checklist(cl, "x")) == 3                                  # open, and two missing roles


def test_held_and_locked_on_a_release_hub_until_the_first_card_set_is_signed(tmp_path):
    root = content(tmp_path)
    c, cfg = hub_on(tmp_path, root, release=True)
    with c:
        hub = c.app.state.hub
        assert "university" in hub.held() and not hub.library.university_ready()
        pin = {"X-Admin-Pin": admin_pin(cfg.data)}
        row = next(m for m in c.get(f"/api/m/admin/cohorts/{HUB}", headers=pin).json()["modules"]
                   if m["id"] == "university")
        assert row["lock"] == "adviser" and not row["on"]
        r = c.post(f"/api/m/admin/cohorts/{HUB}/flags/university",
                   json={"enabled": True, "both": True, "confirm": True}, headers=pin)
        assert r.status_code == 409 and "adviser" in r.text
        assert c.get("/api/m/university").status_code == 404
    # off release (staging), the drafts are served, marked as drafts
    c, _ = hub_on(tmp_path, root)
    with c:
        assert "university" not in c.app.state.hub.held()
        d = c.get("/api/m/university").json()
        assert d["checklist"]["draft"] is True and all(x["draft"] for x in d["cards"])
        assert '"review"' not in json.dumps(d) and "signoffs" not in json.dumps(d)


def test_the_adviser_and_readers_sign_the_card_set_and_the_lock_lifts(tmp_path):
    root = content(tmp_path)
    c, cfg = hub_on(tmp_path, root)
    with c:
        pin = {"X-Teacher-Pin": teacher_pin(cfg.data)}
        assert "adviser" in c.get("/api/m/review/me", headers=pin).json()["roles"]
        for role in ROLES:
            q = c.get("/api/m/review/queue", params={"role": role}, headers=pin).json()["cards"]
            assert [x["pack"] for x in q] == ["university-1"] and q[0]["status"] == "not_started"
            page = c.get("/api/m/review/cards/university-1", params={"role": role}, headers=pin).json()
            assert page["steps"][0]["item"]["type"] == "checklist" and len(page["steps"]) == 1 + len(real_cards())
            sign = {"hash": page["hash"], "role": role, "initials": "AB"}
            assert c.post("/api/m/review/cards/university-1/sign", json=sign, headers=pin).status_code == 409
            for st in page["steps"]:
                assert c.post(f"/api/m/review/cards/university-1/steps/{st['n']}", headers=pin,
                              json={"verdict": "ok", "step_hash": st["hash"], "role": role}).status_code == 200
            assert c.post("/api/m/review/cards/university-1/sign", json=sign, headers=pin).json()["signed"] is True
        assert c.get("/api/m/review/cards/university-1", params={"role": "Hanafi scholar"},
                     headers=pin).status_code == 403
        rows = c.get("/api/m/review/signoffs", headers=pin).json()["signoffs"]
    assert {r["lesson"] for r in rows} == {"cards:university-1"} and len(rows) == 3
    report = pull.pull(rows, root / "packs")
    assert len(report["copied"]) == 3 * (1 + len(real_cards())) and not report["stale"]
    lib = Library(root / "packs")
    assert lib.university_ready() and all(x["_state"] == "signed" for x in lib.card_set("university-1"))
    c, cfg = hub_on(tmp_path, root, release=True)
    with c:
        assert "university" not in c.app.state.hub.held()
        pin = {"X-Admin-Pin": admin_pin(cfg.data)}
        assert c.post(f"/api/m/admin/cohorts/{HUB}/flags/university",
                      json={"enabled": True, "both": True, "confirm": True}, headers=pin).status_code == 200
        d = c.get(f"/api/m/university?cohort={HUB}").json()
        assert d["checklist"]["draft"] is False and len(d["cards"]) == len(real_cards())
    # one changed card voids that card's signatures only
    cards = json.loads((root / "packs" / "university-1" / "links.json").read_text(encoding="utf-8"))
    cards[0]["about"]["en"] += " More."
    (root / "packs" / "university-1" / "links.json").write_text(json.dumps(cards, ensure_ascii=False), "utf-8")
    lib = Library(root / "packs")
    states = [x["_state"] for x in lib.card_set("university-1")]
    assert states[1] == "changed" and states.count("signed") == len(states) - 1
    assert review_state(lib.checklists["university-1"], lib.checklists["university-1"]["_hash"]) == "signed"
