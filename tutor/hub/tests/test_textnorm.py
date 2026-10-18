from tutor_hub.textnorm import digits_to_fa, digits_to_latin, key, norm, tokens


def test_arabic_letters_and_digits_become_persian_forms():
    assert norm("كتاب ي") == "کتاب ی"
    assert norm("۱۲٫۵") == "12.5"
    assert digits_to_latin("۳/۴") == "3/4"
    assert digits_to_fa("3/4") == "۳/۴"


def test_half_space_and_marks():
    assert norm("می‌خواهم") == "می خواهم"
    assert norm("كِتابٌ") == "کتاب"


def test_pashto_letters_match_loosely_for_search():
    assert key("ښوونځی") == key("شوونزی")


def test_tokens_drop_small_words():
    assert tokens("فرق «س» و «ش» چیست؟") == ["فرق", "س", "ش"]
    assert "the" not in tokens("What is the sun?")
