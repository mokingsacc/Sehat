"""The blind-test kit (P16): a dry run on the fake makes grader sheets that hide where each answer came from, and
a score report against the nine-in-ten rule per language and purpose. No network."""
import asyncio
import csv
import importlib.util
import json
import random

import pytest

from tutor_hub.ai import policy
from tutor_hub.ai.fake import FakeProvider
from tutor_hub.ai.providers import make_provider
from tutor_hub.config import Config

from conftest import TUTOR

spec = importlib.util.spec_from_file_location("blindtest", TUTOR / "tools" / "blindtest" / "blindtest.py")
bt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bt)
SAMPLE = TUTOR / "content" / "blindtest" / "sample.json"
FIX = TUTOR / "hub" / "tests" / "fixtures" / "photos" / "vision.json"


def grade(out, mark):
    """Fill every grader sheet: mark(row, key entry) -> (right, safe)."""
    key = json.loads((out / "key.json").read_text(encoding="utf-8"))
    for path in out.glob("grade-*.csv"):
        with path.open(encoding="utf-8-sig", newline="") as f:
            rows = list(csv.DictReader(f))
        for r in rows:
            right, safe = mark(r, key[r["code"]])
            r["right"], r["safe"] = ("yes" if right else "no"), ("yes" if safe else "no")
        with path.open("w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=bt.COLUMNS)
            w.writeheader()
            w.writerows(rows)


def test_a_dry_run_on_the_fake_gives_blind_sheets_and_a_score_report(tmp_path, library):
    qset = bt.load_set(SAMPLE)
    gw = bt.gateway_from_env(FakeProvider.from_json(FIX))
    done = asyncio.run(bt.run(qset, tmp_path, label="provider-a", gateway=gw, library=library))
    assert done == {"asked": 6, "sheets": 3}
    counts = bt.make_sheets(qset, tmp_path, rng=random.Random(7))
    assert counts == {"prs": 4, "ps": 4, "en": 4}           # two questions each: the AI's answer and the reference

    key = json.loads((tmp_path / "key.json").read_text(encoding="utf-8"))
    sheet = (tmp_path / "grade-prs.csv").read_text(encoding="utf-8-sig")
    assert "provider-a" not in sheet and "reference" not in sheet and "fake" not in sheet
    with (tmp_path / "grade-prs.csv").open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    assert list(rows[0]) == bt.COLUMNS and all(r["right"] == r["safe"] == "" for r in rows)
    assert len({r["code"] for r in rows}) == 4 and all(set(r["code"]) <= set(bt.CODE_CHARS) for r in rows)
    assert {key[r["code"]]["source"] for r in rows} == {"provider-a", "reference"}

    # every reference right; the AI right in Dari and English, wrong once in Pashto and once unsafe in English
    def mark(r, k):
        if k["source"] == "reference":
            return True, True
        return (k["qid"] != "s-ps-1"), (k["qid"] != "s-en-2")
    grade(tmp_path, mark)
    report = bt.score(tmp_path)
    rows = {(r["source"], r["lang"], r["purpose"]): r for r in report["rows"]}
    assert rows[("provider-a", "prs", "explain")]["verdict"].startswith("meets the rule")
    assert rows[("provider-a", "ps", "explain")]["right"] == 1 and "does not" in rows[("provider-a", "ps", "explain")]["verdict"]
    assert rows[("provider-a", "en", "explain")]["unsafe"] == 1 and "does not" in rows[("provider-a", "en", "explain")]["verdict"]
    assert rows[("reference", "ps", "explain")]["rate"] == 1.0
    sheet_rows = rows[("provider-a", "prs", "read_sheet")]
    assert sheet_rows["n"] == 11 and sheet_rows["right"] == 11            # scored at once against what was written
    assert "too few to decide" in sheet_rows["verdict"]
    assert "| provider-a | ps | explain |" in (tmp_path / "report.md").read_text(encoding="utf-8")


def test_two_graders_must_both_say_right_and_either_can_say_unsafe(tmp_path, library):
    qset = bt.load_set(SAMPLE)
    asyncio.run(bt.run(qset, tmp_path, label="a", gateway=bt.gateway_from_env(FakeProvider()), library=library))
    bt.make_sheets(qset, tmp_path, rng=random.Random(1))
    grade(tmp_path, lambda r, k: (True, True))
    for p in list(tmp_path.glob("grade-*.csv")):                     # a second grader, who disagrees on the AI
        rows = list(csv.DictReader(p.open(encoding="utf-8-sig", newline="")))
        key = json.loads((tmp_path / "key.json").read_text(encoding="utf-8"))
        for r in rows:
            if key[r["code"]]["source"] == "a":
                r["right"], r["safe"] = "no", "no"
        with (tmp_path / (p.stem + "-grader2.csv")).open("w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=bt.COLUMNS)
            w.writeheader()
            w.writerows(rows)
    rows = {(r["source"], r["lang"], r["purpose"]): r for r in bt.score(tmp_path)["rows"]}
    assert rows[("a", "en", "explain")]["right"] == 0 and rows[("a", "en", "explain")]["unsafe"] == 2
    assert rows[("a", "en", "explain")]["split"] == 2
    assert rows[("reference", "en", "explain")]["right"] == 2


def test_only_the_hubs_own_providers_and_never_a_folder_in_the_repository(tmp_path):
    with pytest.raises(policy.PolicyError):
        make_provider(Config.from_env(data=tmp_path, ai_provider="other"))
    with pytest.raises(SystemExit):
        bt.main(["sheets", "--out", str(TUTOR / "blindtest-out")])
    with pytest.raises(SystemExit):
        bt.load_set(tmp_path / "bad.json") if (tmp_path / "bad.json").write_text(
            json.dumps({"questions": [{"id": "x", "lang": "fr", "text": "q", "reference": "a"}]})) else None
