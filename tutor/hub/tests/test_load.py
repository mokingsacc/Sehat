"""The 60-learner load test (P24; tools/load_test.py) in every run: a whole class at the same minute, on the hub's
SQLite and online on the D1 fake, fails no request. Times are printed by the tool, not asserted here (CI machines
vary); the D1 query count is, since D1's daily limits are counted in queries."""
import importlib.util

import pytest

from test_worker import TUTOR

pytestmark = pytest.mark.anyio


def tool():
    spec = importlib.util.spec_from_file_location("load_test", TUTOR / "tools" / "load_test.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.mark.parametrize("store", ["sqlite", "d1"])
async def test_sixty_learners_at_once_fail_nothing(store):
    import os
    from fakes.d1 import FakeD1, Statement
    before = (dict(os.environ), FakeD1.batch, Statement.run)
    r = await tool().run(store, 60)
    assert (dict(os.environ), FakeD1.batch, Statement.run) == before          # the tool put everything back
    assert r["failed"] == 0, r["failures"]
    assert r["requests"] == 60 * 14
    if store == "d1":
        assert r["d1_queries_per_learner"] <= 60               # 44 in October 2026: a class of 60 is under 3,000
