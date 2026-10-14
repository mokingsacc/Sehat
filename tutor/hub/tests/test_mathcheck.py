from fractions import Fraction

from tutor_hub import mathcheck


def test_evaluate_exact_fractions():
    assert mathcheck.evaluate("1/2 + 1/4") == Fraction(3, 4)
    assert mathcheck.evaluate("۶ ÷ ۳") == 2
    assert mathcheck.evaluate("2 × (3 + 4)") == 14
    assert mathcheck.evaluate("hello") is None
    assert mathcheck.evaluate("10**100") is None


def test_check_finds_wrong_sums_only():
    assert mathcheck.check("پس $1/2 + 1/4 = 3/4$ است").ok
    c = mathcheck.check("1/2 + 1/3 = 2/5")
    assert not c.ok and c.checked == 1
    assert mathcheck.check("۱/۳ = ۲/۶ پس ۲/۶ + ۱/۶ = ۳/۶ = ۱/۲").ok


def test_check_leaves_algebra_dates_and_lists_alone():
    assert mathcheck.check("x + 2 = 5").checked == 0
    assert mathcheck.check("1) 2 + 2 = 4").ok
    assert mathcheck.check("1403/7/22").checked == 0


def test_solve_plain_sums_only():
    assert mathcheck.solve("۱/۲ + ۱/۴ چند می‌شود؟") == ("1/2 + 1/4", Fraction(3, 4))
    assert mathcheck.solve("6 ÷ 3 =") == ("6 ÷ 3", 2)
    assert mathcheck.solve("1/2 + 1/4 = 3/4") is None          # a claim, not a sum to work out
    assert mathcheck.solve("احمد ۳ سیب و ۲ نان دارد") is None  # no operator
    assert mathcheck.solve("what is 3/4?") is None              # a lone fraction works nothing out


def test_mark_wraps_sums_for_left_to_right():
    assert mathcheck.mark("حاصل ۱/۲ + ۱/۴ = ۳/۴ است") == "حاصل $۱/۲ + ۱/۴ = ۳/۴$ است"
    assert mathcheck.mark("عدد ۵") == "عدد ۵"
