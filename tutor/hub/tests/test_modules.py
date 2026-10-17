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

def test_the_built_modules_are_valid():
    assert sorted(REAL) == ["ask", "cert", "check", "homework", "lessons", "live", "made", "photo", "plan", "print", "quran",
                           "recall", "review", "sheets", "speak", "teacher", "timetable", "university"]
    # P30a (C6.1): live classes send no learner's audio (no capability, no AI), need the internet, never serve ey
    assert REAL["live"]["capabilities"] == [] and "ai" not in REAL["live"] and REAL["live"]["needs"] == ["internet"]
    assert REAL["live"]["bands"] == ["p1", "p2", "s1", "s2", "ad"] and REAL["live"]["depends"] == ["lessons", "timetable"]
    assert REAL["live"]["offline"] == "no" and set(REAL["live"]["settings"]) == {"max_minutes", "per_day"}
    # P32 (C4.8): her own questions are free text, off in every seed; `share.cohort` is registered and blocked
    assert REAL["made"]["capabilities"] == ["free.text"] and REAL["made"]["slots"] == ["lesson.end"]
    assert modules.CAPABILITY_RISK["share.cohort"] == "blocked"
    # P28 (C4.6): university preparation has no capability (no events) and serves s2 and adults only
    assert REAL["university"]["capabilities"] == [] and REAL["university"]["bands"] == ["s2", "ad"]
    # P29 (C4.7): the Quran reader has no AI, no capability, and serves s1, s2 and adult readers only
    assert "ai" not in REAL["quran"] and REAL["quran"]["capabilities"] == [] and REAL["quran"]["bands"] == ["s1", "s2", "ad"]
    assert modules.risk(REAL["ask"]) == "medium" and modules.risk(REAL["lessons"]) == "none"
    assert REAL["print"]["needs"] == ["printer"]
    # C2, change 6: `sheets` holds the sheet, its keys, "Get the sheet" and the lesson-end card; `print` depends on it
    # and adds only the hub's queue, so it has no app code of its own
    assert REAL["print"]["depends"] == ["sheets"] and REAL["print"]["slots"] == []
    assert REAL["check"]["depends"] == ["sheets"] and REAL["sheets"]["needs"] == []
    assert "ey" in REAL["sheets"]["bands"]
    # C2.2: photo marking reads sheets, sends pictures to the AI (high risk), needs the internet, never for p1 or ey
    assert REAL["photo"]["depends"] == ["sheets", "check"] and REAL["photo"]["needs"] == ["internet"]
    assert REAL["photo"]["ai"]["purposes"] == ["read_sheet"] and modules.risk(REAL["photo"]) == "high"
    assert REAL["photo"]["bands"] == ["p2", "s1", "s2", "ad"]


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
    bad = tmp_path / "modules" / "sample"                # a module with no app code (photo has its own since P14)
    bad.mkdir(parents=True)
    (bad / "module.json").write_text(json.dumps(manifest("sample", maturity="beta")), encoding="utf-8")
    out = subprocess.run(tool + [str(tmp_path / "modules")], capture_output=True, text=True)
    assert out.returncode == 1 and "sample: maturity" in out.stdout
    (bad / "module.json").write_text(json.dumps(manifest("sample")), encoding="utf-8")   # valid, but no app code
    out = subprocess.run(tool + [str(tmp_path / "modules")], capture_output=True, text=True)
    assert out.returncode == 1 and "no app/js/modules/sample.js" in out.stdout


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


def test_a_module_needing_what_the_host_lacks_is_off():
    ms = {"lessons": manifest("lessons"), "print": manifest("print", depends=["lessons"], needs=["printer"]),
          "card": manifest("card", depends=["print"])}
    flagged = on("lessons", "print", "card")
    assert flags.enabled(ms, cohort(), flagged) == ["card", "lessons", "print"]
    assert flags.enabled(ms, cohort(), flagged, lacks=("printer",)) == ["lessons"]          # and what depends on it
    assert flags.enabled(ms, cohort(), flagged, lacks=("camera",)) == ["card", "lessons", "print"]


def test_online_the_staging_cohort_keeps_sheets_but_not_print():
    """The Worker lacks a printer and the teacher's PIN (TUTOR_LACKS), whatever the cohort's flags say; its sheets are
    the browser's to print."""
    seeds, _ = flags.load_seeds(TUTOR / "cohorts")
    staging = seeds["staging"]
    f = {m: {"enabled": v} for m, v in staging["modules"].items()}
    assert all(staging["modules"].values())
    assert flags.enabled(REAL, staging, f) == ["ask", "cert", "check", "homework", "lessons", "photo", "plan", "print",
                                              "quran", "recall", "review", "sheets", "teacher", "timetable",
                                              "university"]
    # held off by the hub (P29: the Quran set missing, broken or, on a release hub, unsigned), whatever the flag says
    assert "quran" not in flags.enabled(REAL, staging, f, held=("quran",))
    assert flags.enabled(REAL, staging, f, lacks=("printer", "pin")) == [
        "ask", "cert", "check", "homework", "lessons", "photo", "plan", "quran", "recall", "review", "sheets", "teacher",
        "timetable", "university"]
    assert REAL["teacher"]["needs"] == []                 # C3.2: a gate per host, no `pin` need (staff.py)


def test_the_real_hub_cohort_takes_the_built_modules():
    seeds, _ = flags.load_seeds(TUTOR / "cohorts")
    hub = seeds["hub"]
    f = {m: {"enabled": v} for m, v in hub["modules"].items()}
    assert flags.enabled(REAL, hub, f) == ["ask", "cert", "check", "lessons", "plan", "print", "sheets", "teacher",
                                       "timetable"]   # no photo on the hub; recall after the pilot's report (C4.1)
    assert hub["modules"]["photo"] is False
    # open's photo is off with its own limit, five a day (C4.9), until the pilot's gate passes
    assert seeds["open"]["modules"]["photo"] == {"enabled": False, "settings": {"per_day": 5}}
    assert flags.enabled(REAL, hub, f, band="ey") == ["lessons", "print", "sheets", "teacher"]     # no Ask for ey


def test_the_open_cohort_has_sheets_and_no_print():
    seeds, _ = flags.load_seeds(TUTOR / "cohorts")
    c = seeds["open"]
    f = {m: {"enabled": v if isinstance(v, bool) else v["enabled"]} for m, v in c["modules"].items()}
    assert flags.enabled(REAL, c, f, lacks=("printer", "pin")) == ["cert", "check", "lessons", "plan", "recall",
                                                                     "sheets", "timetable"]   # C2.8: Learn this in `open`


def test_module_settings_use_valid_cohort_values_only():
    m = manifest(settings={"n": {"type": "int", "min": 1, "max": 50, "default": 10},
                           "loud": {"type": "bool", "default": True}})
    assert flags.module_settings(m, None) == {"n": 10, "loud": True}
    assert flags.module_settings(m, {"n": 20, "loud": False, "other": 1}) == {"n": 20, "loud": False}
    assert flags.module_settings(m, {"n": 99, "loud": "yes"}) == {"n": 10, "loud": True}


def test_cohort_checks():
    assert flags.check_cohort(cohort()) == []
    for change, words in (({"id": "hub"}, "id"), ({"bands": ["k1"]}, "bands"), ({"langs": ["fa"]}, "langs"),
                          ({"settings": {"ai_budget": "lots"}}, "settings"), ({"settings": {"colour": 3}}, "settings"), ({"modules": {"ask": "on"}}, "modules"),
                          ({"name": "x"}, "unknown fields")):
        c = copy.deepcopy(cohort())
        c.update(change)
        assert any(words in p for p in flags.check_cohort(c)), change
