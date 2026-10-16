"""Module manifests (modules.py), cohort seeds and flag resolution (flags.py), and tools/validate_modules.py."""
import copy
import json
import logging
import subprocess
import sys

import pytest

from tutor_hub import flags, modules
from tutor_hub.config import TUTOR

REAL, _ = modules.load(TUTOR / "modules")


def manifest(mid="photo", **kw):
    m = {"id": mid, "version": "0.1.0", "maturity": "pilot", "depends": [], "bands": ["p2", "s1"],
         "slots": ["home.action"], "capabilities": [], "settings": {}, "needs": [], "offline": "yes"}
    m.update(kw)
    return m


def cohort(**kw):
    c = {"id": "abcd1234ef", "label": "Test", "langs": ["prs"], "bands": list(modules.BANDS),
         "settings": {"maturity": ["pilot", "stable"]}, "modules": {}}
    c.update(kw)
    return c


def on(*ids):
    return {i: {"enabled": True} for i in ids}


# the manifests in the repository

def test_the_five_built_modules_are_valid():
    assert sorted(REAL) == ["ask", "check", "lessons", "print", "teacher"]
    assert modules.risk(REAL["ask"]) == "medium" and modules.risk(REAL["lessons"]) == "none"
    assert REAL["print"]["needs"] == ["printer"]


def test_the_seed_cohorts_are_valid_and_neutral():
    seeds, problems = flags.load_seeds(TUTOR / "cohorts")
    assert not problems and sorted(seeds) == ["hub", "open", "staging"]
    assert len({c["id"] for c in seeds.values()}) == 3
    for c in seeds.values():
        assert flags.COHORT_ID.match(c["id"]) and c["id"] not in ("hub", "open", "staging")
        assert not any(w in c["label"].lower() for w in ("girl", "boy", "school", "women", "men"))


def test_the_validator_tool_passes_and_fails(tmp_path):
    tool = [sys.executable, str(TUTOR / "tools" / "validate_modules.py")]
    ok = subprocess.run(tool, capture_output=True, text=True)
    assert ok.returncode == 0, ok.stdout
    bad = tmp_path / "modules" / "photo"
    bad.mkdir(parents=True)
    (bad / "module.json").write_text(json.dumps(manifest(maturity="beta")), encoding="utf-8")
    out = subprocess.run(tool + [str(tmp_path / "modules")], capture_output=True, text=True)
    assert out.returncode == 1 and "photo: maturity" in out.stdout
    (bad / "module.json").write_text(json.dumps(manifest()), encoding="utf-8")       # valid, but no app code
    out = subprocess.run(tool + [str(tmp_path / "modules")], capture_output=True, text=True)
    assert out.returncode == 1 and "no app/js/modules/photo.js" in out.stdout


# validation

def test_a_good_manifest_has_no_problems():
    assert modules.check(manifest(), "photo") == []
    assert modules.check(manifest(capabilities=["photo.upload", "ai.call"],
                                  ai={"purposes": ["read_sheet", "hint"], "max_calls_per_learner_day": 30},
                                  settings={"max_photos_per_day": {"type": "int", "min": 1, "max": 50, "default": 10}},
                                  needs=["internet", "camera"], offline="no"), "photo") == []


@pytest.mark.parametrize("change, words", [
    ({"id": "Photo"}, "id must be"),
    ({"version": "1.0"}, "version"),
    ({"maturity": "beta"}, "maturity"),
    ({"bands": ["p7"]}, "bands: unknown p7"),
    ({"bands": []}, "at least one band"),
    ({"slots": ["home.tile"]}, "slots: unknown home.tile"),           # no tile, tab or banner slots (C0.1)
    ({"capabilities": ["camera.roll"]}, "capabilities: unknown"),
    ({"needs": ["wifi"]}, "needs: unknown"),
    ({"offline": "sometimes"}, "offline"),
    ({"depends": ["photo"]}, "itself"),
    ({"core": "1.0"}, "unknown fields: core"),                        # trimmed by the committee
    ({"risk": "low"}, "unknown fields: risk"),                        # risk is the core's, not the module's
    ({"capabilities": ["ai.call"]}, "ai purposes"),
    ({"ai": {"purposes": ["chat"]}, "capabilities": ["ai.call"]}, "purposes: unknown chat"),
    ({"ai": {"purposes": ["hint"]}}, "ai.call capability"),
    ({"settings": {"n": {"type": "int", "default": 99, "max": 50}}}, "outside min and max"),
    ({"settings": {"n": {"type": "int", "default": True}}}, "default must be int"),
])
def test_bad_manifests_say_what_is_wrong(change, words):
    problems = modules.check(manifest(**change), "photo")
    assert any(words in p for p in problems), problems


def test_id_must_match_the_folder():
    assert any("folder" in p for p in modules.check(manifest(), "camera"))


def test_missing_fields():
    m = manifest()
    del m["offline"]
    assert modules.check(m, "photo") == ["missing fields: offline"]


def test_broken_manifests_and_their_dependants_are_left_out_with_a_reason(tmp_path, caplog):
    for mid, m in {"lessons": manifest("lessons"), "photo": manifest("photo", depends=["lessons", "sheets"]),
                   "sheets": manifest("sheets", maturity="beta"), "plan": manifest("plan", depends=["photo"])}.items():
        (tmp_path / mid).mkdir()
        (tmp_path / mid / "module.json").write_text(json.dumps(m), encoding="utf-8")
    (tmp_path / "junk").mkdir()
    (tmp_path / "junk" / "module.json").write_text("{not json", encoding="utf-8")
    with caplog.at_level(logging.WARNING, logger="tutor.modules"):
        found, problems = modules.load(tmp_path)
    assert sorted(found) == ["lessons"]
    text = "\n".join(problems)
    assert "sheets: maturity" in text and "junk: not readable" in text
    assert "photo: depends on sheets" in text and "plan: depends on photo" in text
    assert "module left out" in caplog.text


# resolution

def test_a_module_is_on_only_when_its_flag_is_on():
    ms = {"lessons": manifest("lessons"), "photo": manifest("photo")}
    assert flags.enabled(ms, cohort(), on("lessons")) == ["lessons"]
    assert flags.enabled(ms, cohort(), {"photo": {"enabled": False}, **on("lessons")}) == ["lessons"]
    assert flags.enabled(ms, cohort(), {}) == []


def test_depends_must_be_on_too():
    ms = {"lessons": manifest("lessons"), "sheets": manifest("sheets", depends=["lessons"]),
          "photo": manifest("photo", depends=["sheets"])}
    assert flags.enabled(ms, cohort(), on("lessons", "sheets", "photo")) == ["lessons", "photo", "sheets"]
    assert flags.enabled(ms, cohort(), on("sheets", "photo")) == []                 # the chain breaks at lessons
    assert flags.enabled(ms, cohort(), on("lessons", "photo")) == ["lessons"]


def test_a_loop_of_depends_is_off():
    ms = {"a1": manifest("a1", depends=["b1"]), "b1": manifest("b1", depends=["a1"])}
    assert flags.enabled(ms, cohort(), on("a1", "b1")) == []


def test_maturity_follows_the_cohort():
    ms = {"lessons": manifest("lessons", maturity="stable"), "photo": manifest("photo", maturity="draft"),
          "plan": manifest("plan", maturity="pilot")}
    flagged = on("lessons", "photo", "plan")
    assert flags.enabled(ms, cohort(), flagged) == ["lessons", "plan"]                       # pilot cohort
    staging = cohort(settings={"maturity": ["draft", "pilot", "stable"]})
    assert flags.enabled(ms, staging, flagged) == ["lessons", "photo", "plan"]
    assert flags.enabled(ms, cohort(settings={}), flagged) == ["lessons"]                      # stable by default


def test_bands_of_the_module_and_the_cohort():
    ms = {"lessons": manifest("lessons", bands=list(modules.BANDS)), "photo": manifest("photo", bands=["p2", "s1"])}
    flagged = on("lessons", "photo")
    assert flags.enabled(ms, cohort(), flagged) == ["lessons", "photo"]                       # band not known
    assert flags.enabled(ms, cohort(), flagged, band="s1") == ["lessons", "photo"]
    assert flags.enabled(ms, cohort(), flagged, band="ey") == ["lessons"]
    assert flags.enabled(ms, cohort(bands=["ad"]), flagged, band="s1") == []                  # cohort serves adults


def test_the_real_hub_cohort_takes_the_five_built_modules():
    seeds, _ = flags.load_seeds(TUTOR / "cohorts")
    hub = seeds["hub"]
    f = {m: {"enabled": v} for m, v in hub["modules"].items()}
    assert flags.enabled(REAL, hub, f) == ["ask", "check", "lessons", "print", "teacher"]
    assert flags.enabled(REAL, hub, f, band="ey") == ["lessons", "print", "teacher"]           # no Ask for ey


def test_module_settings_use_valid_cohort_values_only():
    m = manifest(settings={"n": {"type": "int", "min": 1, "max": 50, "default": 10},
                           "loud": {"type": "bool", "default": True}})
    assert flags.module_settings(m, None) == {"n": 10, "loud": True}
    assert flags.module_settings(m, {"n": 20, "loud": False, "other": 1}) == {"n": 20, "loud": False}
    assert flags.module_settings(m, {"n": 99, "loud": "yes"}) == {"n": 10, "loud": True}


def test_cohort_checks():
    assert flags.check_cohort(cohort()) == []
    for change, words in (({"id": "hub"}, "id"), ({"bands": ["k1"]}, "bands"), ({"langs": ["fa"]}, "langs"),
                          ({"settings": {"ai_budget": 3}}, "settings"), ({"modules": {"ask": "on"}}, "modules"),
                          ({"name": "x"}, "unknown fields")):
        c = copy.deepcopy(cohort())
        c.update(change)
        assert any(words in p for p in flags.check_cohort(c)), change
