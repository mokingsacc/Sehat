from tutor_hub import rules


def test_distress_is_urgent_in_each_language():
    assert rules.screen("پدرم مرا می‌زند") == ("distress", True)
    assert rules.screen("غواړم مړ شم") == ("distress", True)
    assert rules.screen("I want to die") == ("distress", True)


def test_school_questions_pass():
    for q in ("عمر شما چند است؟", "کسر چیست؟", "ښوونځی څه وخت پیلېږي؟", "What is a noun?"):
        assert rules.screen(q) is None, q


def test_off_limits_and_long():
    assert rules.screen("نظر تو درباره‌ی انتخابات چیست؟") == ("off_limits", False)
    assert rules.screen("کسر " * 200) == ("too_long", False)


def test_health_questions_go_to_a_health_worker():
    assert rules.screen("وقتی تب دارم چه دوا بخورم؟") == ("health", False)
    assert rules.screen("ماشوم مې ناروغ دی") == ("health", False)


def test_pashto_my_is_not_taken_for_the_dari_verb_prefix():
    assert rules.words("ماشوم مې ناروغ دی") == ["ماشوم", "می", "ناروغ", "دی"]
    assert rules.screen("پلار مې ما وهي") == ("distress", True)
    assert rules.words("می‌خواهم بمیرم") == rules.words("میخواهم بمیرم") == rules.words("می خواهم بمیرم")
