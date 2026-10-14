from tutor_hub import search
from tutor_hub.brain import Brain


def brain(library, model, approved=(), langs=("prs", "en")):
    return Brain(search.build(library, approved), model, langs)


def test_rules_come_first(library, fake_model):
    m = fake_model("should not be asked")
    a = brain(library, m).answer("پدرم مرا می‌زند", lang="prs")
    assert a.source == "rules" and a.urgent and a.waiting
    assert not m.asked


def test_plain_sums_are_worked_out(library, fake_model):
    a = brain(library, fake_model()).answer("۱/۲ + ۱/۴ چند می‌شود؟", lang="prs")
    assert a.source == "maths" and a.checked and a.text == "$1/2 + 1/4 = 3/4$"


def test_question_bank_beats_the_model(library, fake_model):
    m = fake_model("AI words")
    a = brain(library, m).answer("مخرج مشترک چیست؟", lang="prs")
    assert a.source == "bank" and a.checked and "مخرج" in a.text
    assert not m.asked


def test_teacher_approved_answers_are_used(library, fake_model):
    rows = [{"id": 1, "lang": "prs", "lesson_id": None, "subject": "science", "year": 7,
             "question": "رنگین کمان چطور درست می‌شود؟", "answer": "نور آفتاب در قطره‌های باران می‌شکند."}]
    a = brain(library, fake_model(up=False), rows).answer("رنگین کمان چطور درست می‌شود", lang="prs")
    assert a.source == "approved" and a.checked


def test_model_answer_with_a_wrong_sum_is_never_shown(library, fake_model):
    m = fake_model("جواب: 1/2 + 1/3 = 2/5")
    a = brain(library, m).answer("چرا آسمان آبی است؟", lang="prs", subject="science")
    assert m.asked and a.source != "ai"


def test_model_answer_with_right_sums_is_marked(library, fake_model):
    m = fake_model("برای جمع، اول مخرج مشترک: 1/3 + 1/6 = 1/2")
    a = brain(library, m).answer("چرا آسمان آبی است؟", lang="prs")
    assert a.source == "ai" and a.maths_checked == 1 and "$1/3 + 1/6 = 1/2$" in a.text


def test_pashto_skips_the_model_until_it_is_trusted(library, fake_model):
    m = fake_model("ځواب")
    a = brain(library, m).answer("آسمان ولې شین دی؟", lang="ps")
    assert not m.asked and a.source in ("lesson", "none")


def test_nothing_fits_goes_to_the_teacher(library, fake_model):
    a = brain(library, fake_model(up=False)).answer("زلزله چرا می‌آید؟", lang="prs")
    assert a.source == "none" and a.waiting


def test_lesson_context_boosts_but_does_not_filter(library):
    ix = search.build(library)
    hits = ix.search("فرق س و ش", lesson="dari-1-sheen")
    assert hits and hits[0][2]["lesson"] == "dari-1-sheen"
