"""Spaced review (`recall`, P25a, C4.1): everything lives on the phone; the server knows the module, its event and the
step mark `recall: true`. On in `open`, staging and new cohorts; the pilot cohort after its report."""
import copy
import json
import shutil
import sqlite3

from tutor_hub import events, flags
from tutor_hub.packs import validate_lesson
from tutor_hub.stores.sqlite import MIGRATIONS, migrate

from conftest import PACKS
from test_modules import REAL, TUTOR

SEEDS = ("d6co6etep6", "qg1j2918yx", "3w2lco2s8f")


def test_the_event_is_a_step_and_right_or_wrong_from_the_phone():
    ok = {"at": "2027-03-01T10:00", "verb": "recall.item", "object": "maths-7-fractions-add:5", "value": 1}
    assert events.check(ok, phone=True) == []
    assert events.check(dict(ok, value=2), phone=True) and events.check(dict(ok, object="maths-7"), phone=True)
    assert events.VERBS["recall.item"].module == "recall"


def test_a_step_may_be_marked_for_review_only_if_it_asks_something():
    pdir = PACKS / "starter"
    good = json.loads((pdir / "lessons" / "maths-7-fractions-add.json").read_text(encoding="utf-8"))
    marked = copy.deepcopy(good)
    k = next(i for i, s in enumerate(marked["steps"]) if s["kind"] == "number")
    marked["steps"][k]["recall"] = True
    assert validate_lesson(marked, pdir) == []
    marked["steps"][0]["recall"] = True                          # a read step
    assert any("recall is true, on a choice or number step" in p for p in validate_lesson(marked, pdir))
    marked["steps"][0].pop("recall")
    marked["steps"][k]["recall"] = "yes"
    assert validate_lesson(marked, pdir)


def test_the_seeds_turn_it_on_for_open_and_staging_not_the_pilot():
    seeds, _ = flags.load_seeds(TUTOR / "cohorts")
    assert seeds["open"]["modules"]["recall"] and seeds["staging"]["modules"]["recall"]
    assert seeds["hub"]["modules"]["recall"] is False
    assert REAL["recall"]["capabilities"] == [] and REAL["recall"]["slots"] == [] and "ey" not in REAL["recall"]["bands"]


def test_migration_0015_gives_open_and_staging_recall(tmp_path):
    early = tmp_path / "early"
    early.mkdir()
    for f in sorted(MIGRATIONS.glob("*.sql")):
        if f.name < "0015":
            shutil.copy(f, early / f.name)
    db = sqlite3.connect(tmp_path / "t.db", isolation_level=None)
    migrate(db, early)
    for cid in SEEDS:
        db.execute("INSERT INTO cohorts(id, label, langs, bands, settings, created) "
                   "VALUES(?, 'x', '[]', '[]', '{}', 'now')", (cid,))
    assert migrate(db) == ["0015_recall", "0016_cert", "0017_made", "0018_prices", "0019_live", "0020_meta", "0021_bags"]
    on = db.execute("SELECT cohort, enabled, changed_by FROM flags WHERE module='recall' ORDER BY cohort").fetchall()
    assert on == [("3w2lco2s8f", 1, "seed"), ("qg1j2918yx", 1, "seed")]
    assert db.execute("SELECT COUNT(*) FROM flag_log WHERE module='recall'").fetchone() == (2,)
    assert migrate(db) == []
