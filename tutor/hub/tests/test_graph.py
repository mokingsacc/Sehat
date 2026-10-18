"""The skills graph (P25a, C4.1): content/graph/<subject>.json mapping nodes to lessons, checked at the hub's start,
hidden in release mode until signed, sent to the phone with the packs, and used by "I want to learn this" (a node's
title, and the `plan` AI only where `plan_ai` is on). Nothing about a learner is in it."""
import copy
import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tutor_hub import graph
from tutor_hub.ai.fake import FakeProvider
from tutor_hub.mods import plan
from tutor_hub.packs import Library
from tutor_hub.server import create_app

TUTOR = Path(__file__).resolve().parents[2]
# a small graph of the starter pack's lessons (the repo's own graphs are checked by the Library test below)
MATHS = {"subject": "maths", "version": "2026.10.17",
         "nodes": [{"id": "count-5", "needs": [], "lessons": ["maths-1-count-5"], "title": {"prs": "شمردن", "en": "Count to 5"}},
                   {"id": "frac-what", "needs": [], "lessons": [], "title": {"prs": "کسر چیست", "en": "What a fraction is"}},
                   {"id": "frac-add", "needs": ["frac-what"], "lessons": ["maths-7-fractions-add"],
                    "title": {"prs": "جمع کسرها", "en": "Add fractions"}}],
         "pathways": [{"id": "s1-fractions", "goal": ["frac-add"], "bands": ["s1"], "final": "maths-7-fractions-add",
                       "certificate": True, "title": {"prs": "کسرها: جمع", "en": "Fractions: adding"}}],
         "review": {"status": "draft", "needs": ["maths teacher"]}}
KNOWN = {"maths-1-count-5": {"band": "p1", "sheet": True}, "maths-7-fractions-add": {"band": "s1", "sheet": True},
         "science-7-states-of-matter": {"band": "s1", "sheet": False}, "adult-money-1": {"band": "ad", "sheet": True}}
STAGING = "qg1j2918yx"


def g(**kw):
    out = copy.deepcopy(MATHS)
    out.update(kw)
    return out


def node(nid, needs=(), lessons=(), en="A skill"):
    return {"id": nid, "needs": list(needs), "lessons": list(lessons), "title": {"prs": "مهارت", "en": en}}


def test_the_maths_graph_in_the_repo_is_valid():
    assert graph.check(MATHS, KNOWN, "maths") == []


@pytest.mark.parametrize("change, said", [
    ({"nodes": [node("Frac", lessons=["maths-7-fractions-add"])]}, "lower-case"),
    ({"nodes": [node("a", needs=["b"])]}, "needs b, which is not a node"),
    ({"nodes": [node("a", needs=["b"]), node("b", needs=["a"])]}, "go round in a circle"),
    ({"nodes": [node("a", needs=["a"])]}, "needs itself"),
    ({"nodes": [node("a", lessons=["nope"])]}, "no lesson nope"),
    ({"nodes": [node("a", lessons=["maths-1-count-5"]), node("b", lessons=["maths-1-count-5"])]}, "in two nodes"),
    ({"nodes": [node("a"), node("a")]}, "two nodes have the id a"),
    ({"pathways": [{"id": "p", "goal": ["frac-add"], "bands": ["s2"], "title": {"prs": "x", "en": "x"}}]},
     "no lesson for band s2"),
    ({"pathways": [{"id": "p", "goal": ["count-5"], "bands": ["p1"], "final": "science-7-states-of-matter",
                    "title": {"prs": "x", "en": "x"}}]}, "final must be a lesson with a sheet"),
    ({"pathways": [{"id": "p", "goal": ["zzz"], "bands": ["s1"], "title": {"prs": "x", "en": "x"}}]},
     "goal must list nodes"),
    ({"skill": "x"}, "unknown fields"),
])
def test_the_validator_names_each_problem(change, said):
    probs = graph.check(g(**change), KNOWN, "maths")
    assert any(said in p for p in probs), probs


def test_no_certificate_for_a_quran_or_seerah_pathway():
    q = g(subject="quran", pathways=[dict(MATHS["pathways"][0], certificate=True)])
    assert any("a scholar's to give" in p for p in graph.check(q, KNOWN, "quran"))
    q["pathways"][0]["certificate"] = False
    assert graph.check(q, KNOWN, "quran") == []


def test_a_lesson_in_no_node_is_allowed_and_cycles_are_found_deep():
    assert graph.check(g(nodes=[node("a", lessons=["maths-1-count-5"])], pathways=[]), KNOWN, "m") == []
    loop = graph.cycle({"a": {"needs": ["b"]}, "b": {"needs": ["c"]}, "c": {"needs": ["a"]}, "d": {"needs": []}})
    assert loop[0] == loop[-1] and set(loop) == {"a", "b", "c"}
    assert graph.cycle({"a": {"needs": ["b"]}, "b": {"needs": []}}) is None


def test_the_hash_leaves_out_the_review_and_a_change_unsigns_it():
    a = g(review={"status": "draft", "needs": ["maths teacher"]})
    assert graph.graph_hash(a) == graph.graph_hash(g(review={"status": "checked"}))
    assert graph.graph_hash(a) != graph.graph_hash(g(version="2"))


def test_release_mode_hides_an_unsigned_graph_and_asks_an_adult_educator_for_adult_pathways():
    why = graph.release_problems(MATHS, "draft", "graph/maths.json")
    assert any("not signed" in x for x in why)
    adult = g(pathways=[dict(MATHS["pathways"][0], bands=["ad"])])
    assert any("adult educator" in x for x in graph.release_problems(adult, "signed", "m"))
    assert graph.release_problems(MATHS, "signed", "m") == []


def test_the_library_loads_the_graph_and_release_mode_hides_it(tmp_path):
    lib = Library(TUTOR / "content" / "packs")                    # the repo's graphs: all valid, all drafts
    assert {"maths", "dari", "pashto"} <= set(lib.graphs) and lib.problems == []
    assert all(g["_state"] == "draft" for g in lib.graphs.values())
    shutil.copytree(TUTOR / "content" / "packs", tmp_path / "packs")
    (tmp_path / "graph").mkdir()
    (tmp_path / "graph" / "maths.json").write_text(json.dumps(MATHS), encoding="utf-8")
    (tmp_path / "graph" / "science.json").write_text(json.dumps(MATHS), encoding="utf-8")
    lib = Library(tmp_path / "packs")
    assert any("file name and the subject inside differ" in p for p in lib.problems) and list(lib.graphs) == ["maths"]
    rel = Library(tmp_path / "packs", release=True)
    assert rel.graphs == {} and any("graph/maths.json: not signed" in x for x in rel.hidden)


def test_the_phone_gets_nodes_with_the_lessons_served_and_no_review():
    lib = {"maths": {**MATHS, "_state": "draft"}}
    [out] = graph.for_app(lib, {"maths-7-fractions-add": {}})
    assert out["draft"] is True and "review" not in out
    assert [n["lessons"] for n in out["nodes"]] == [[], [], ["maths-7-fractions-add"]]
    assert out["pathways"][0]["final"] == "maths-7-fractions-add" and out["pathways"][0]["certificate"] is True
    [bare] = graph.for_app(lib, {})
    assert bare["pathways"] == []                                  # no lesson left for its goal: not offered


@pytest.fixture
def hub(cfg):
    with TestClient(create_app(cfg)) as c:
        c.hub = c.app.state.hub
        yield c


def test_the_packs_route_carries_the_graphs(hub):
    j = hub.get("/api/packs").json()
    [m] = [x for x in j["graphs"] if x["subject"] == "maths"]
    assert {n["id"] for n in m["nodes"]} >= {"frac-add", "frac-what"} and m["pathways"][0]["id"] == "s1-fractions"
    assert {p["id"] for x in j["graphs"] for p in x["pathways"]} >= {"ad-money", "ad-read-dari", "ad-read-pashto"}


def test_a_goal_that_names_a_node_gives_that_nodes_lessons(hub):
    hub.hub.library.graphs["maths"]["nodes"].append(node("halves", lessons=[], en="Halves and quarters"))
    hub.hub.library.graphs["maths"]["nodes"][2]["title"]["en"] = "Adding fraction parts"
    r = hub.post("/api/m/plan", json={"goal": "adding parts", "lang": "en", "band": "s1"}).json()
    assert r == {"kind": "plan", "label": "Adding fraction parts", "lessons": ["maths-7-fractions-add"]}
    r = hub.post("/api/m/plan", json={"goal": "halves", "lang": "en", "band": "s1"}).json()
    assert r["kind"] == "wish"                                     # a node with no lesson for her is no plan


@pytest.fixture
def online(cfg):
    cfg.home = "online"
    cfg.lacks = ("printer", "pin")
    cfg.cohort = STAGING
    cfg.ai_provider = "fake"
    with TestClient(create_app(cfg)) as c:
        c.hub = c.app.state.hub
        c.hub.gateway.provider = FakeProvider({"plan": '["frac-add", "made-up", "count-5"]'})
        c.fake = c.hub.gateway.provider
        yield c


def test_plan_ai_is_off_by_default_and_on_picks_existing_nodes_without_the_token(online):
    body = {"goal": "chemistry homework", "lang": "en", "band": "s1"}
    assert online.post("/api/m/plan", json=body).json()["kind"] == "wish" and online.fake.sent == []
    online.hub.store.sync.set_flag(STAGING, "plan", enabled=True, settings={"plan_ai": True}, changed_by="admin")
    tok = online.post("/api/join", json={"band": "s1", "lang": "prs", "picture": "key"}).json()["token"]
    r = online.post("/api/m/plan", json=body, headers={"X-Learner-Token": tok}).json()
    assert r == {"kind": "plan", "label": "Add fractions", "lessons": ["maths-7-fractions-add"]}
    sent = online.fake.sent[-1]
    assert sent["purpose"] == "plan" and tok not in json.dumps(sent) and "frac-add: Add fractions" in json.dumps(sent)
    assert "count-5" not in json.dumps(sent)                      # only her band's nodes are listed
    online.fake.replies["plan"] = "Learn fractions!"
    assert online.post("/api/m/plan", json=body).json()["kind"] == "wish"      # not a list of ids: a miss
    online.fake.replies["plan"] = '["frac-add"]'
    body["lang"] = "ps"                                            # not a trusted language: no call
    n = len(online.fake.sent)
    assert online.post("/api/m/plan", json=body).json()["kind"] == "wish" and len(online.fake.sent) == n


def test_ai_picks_keep_three_existing_ids_at_most():
    nodes = [(node(x), [f"l-{x}"]) for x in "abcd"]
    assert [n["id"] for n, _ in plan.ai_picks('["a","b","a","c","d","zz"]', nodes)] == ["a", "b", "c"]
    assert plan.ai_picks('{"a": 1}', nodes) == [] and plan.ai_picks(None, nodes) == []
    assert plan.ai_picks('[1, "a"]', nodes) == []
