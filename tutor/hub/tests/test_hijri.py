"""C5.1 item 8: the Solar Hijri day, as the staff pages and the certificate show it, against one table of known days
(the same table tests lang.js in app/tests/staff.test.js)."""
import json
from datetime import date, timedelta
from pathlib import Path

from tutor_hub import cert

TABLE = json.loads((Path(__file__).parent / "hijri_dates.json").read_text(encoding="utf-8"))["days"]


def test_the_25_known_days():
    assert len(TABLE) == 25
    for row in TABLE:
        assert list(cert.hijri_date(date.fromisoformat(row["gregorian"]))) == row["hijri"], row


def test_the_chairs_check_and_known_new_years():
    assert cert.hijri_date(date(2026, 10, 17)) == (1405, 7, 25)            # 25 Mizan 1405
    assert [cert.nowruz(y) for y in (1402, 1403, 1404, 1405, 1406)] == [21, 20, 21, 21, 21]
    assert cert.hijri_date(date(2025, 3, 20)) == (1403, 12, 30)            # 1403 was a leap year
    assert cert.hijri_date(date(2027, 3, 20)) == (1405, 12, 29)


def test_every_day_follows_the_one_before():
    d, last = date(2024, 1, 1), cert.hijri_date(date(2024, 1, 1))
    for _ in range(3 * 366):
        d += timedelta(days=1)
        now = cert.hijri_date(d)
        assert now == (last[0], last[1], last[2] + 1) or now[2] == 1, (d, last, now)
        last = now


def test_the_month_label_is_unchanged():
    assert cert.hijri("2027-10") == (1406, 7) and cert.hijri("2028-01") == (1406, 10)
    assert cert.hijri("2027-03") == (1405, 12) and cert.hijri("2027-04") == (1406, 1)
