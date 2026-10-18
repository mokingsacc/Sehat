"""What the hub will not answer, checked before anything else (no AI needed).

- Distress (someone hurting the child, wanting to die): a kind message to tell a trusted adult now, and the
  question goes to the top of the teacher's list. The hub cannot know who asked; that is on purpose.
- Health (medicine, illness, pregnancy): the hub is not a doctor. It points to a health worker or the Sehat app,
  and the question goes to the teacher, who can answer it if it is really a science lesson question.
- Politics, religious rulings, weapons: the hub is a school helper only. It says so kindly and points to the
  teacher or the family's elders, and for a religious ruling to a scholar she trusts (C4.7: no AI near religion, and
  the Quran reader finds verses by code only). Keeping these out protects the children and whoever hosts the hub.
  A ruling counts as off limits on the admin's Safety page.

Words and phrases match whole words (a phrase matches its words in a row), never parts of words, so "عمر شما"
does not trip "مړ شم". The lists are a starting point for the Dari and Pashto reviewers to extend, and the Dari and
Pashto messages need a native speaker's check.
"""
from .textnorm import key, norm

DISTRESS = ["خودکشی", "خود را بکشم", "خودم را بکشم", "می خواهم بمیرم", "مرا می زند", "مرا می زنند", "آزار جنسی",
            "ځان وژنه", "ځان ووژنم", "ما وهي", "مړ شم", "جنسي ځورونه",
            "suicide", "kill myself", "want to die", "hurts me", "beats me", "abuse", "abused"]
HEALTH = ["دوا", "دارو", "مریض", "مریضی", "بیمار", "بیماری", "تب", "اسهال", "حامله", "حاملگی", "سرفه", "زخم",
          "درمل", "ناروغ", "ناروغي", "تبه", "اسهال", "امیندواره", "ټوخی", "ټپ",
          "medicine", "sick", "fever", "diarrhoea", "diarrhea", "pregnant", "cough", "wound"]
OFF_LIMITS = ["سیاست", "سیاسی", "طالب", "طالبان", "امارت", "حکومت", "انتخابات", "داعش", "تفنگ", "اسلحه", "انتحاری", "بمب",
              "جګړه", "ټاکنې", "ټوپک", "وسله", "ځانمرګی",
              "politics", "taliban", "government", "election", "gun", "weapon", "bomb"]
RULINGS = ["فتوا", "حرام", "حلال", "کافر", "مذهب", "fatwa", "haram", "halal"]

MESSAGES = {
    "distress": {
        "prs": "اگر کسی به تو آسیب می‌رساند یا خیلی غمگین هستی، همین حالا به یک بزرگسال که به او اعتماد داری بگو. تو تنها نیستی.",
        "ps": "که څوک تا ته زیان رسوي یا ډېر خفه یې، همدا اوس یو داسې مشر ته ووایه چې باور پرې لرې. ته یوازې نه یې.",
        "en": "If someone is hurting you or you feel very sad, tell an adult you trust right now. You are not alone.",
    },
    "health": {
        "prs": "برای صحت خودت یا خانواده‌ات از کارمند صحی بپرس، یا برنامه‌ی «صحت» را باز کن. اگر سوال درس ساینس است، معلم جواب می‌دهد.",
        "ps": "د خپل یا د کورنۍ د روغتیا لپاره له روغتیايي کارکوونکي وپوښته، یا د «صحت» پروګرام خلاص کړه. که د ساینس د لوست پوښتنه وي، ښوونکی به ځواب ورکړي.",
        "en": "For your own or your family's health, ask a health worker or open the Sehat app. If it is a science lesson question, your teacher will answer.",
    },
    "off_limits": {
        "prs": "من فقط در درس‌ها کمک می‌کنم. این سوال را از معلم یا بزرگان خانواده‌ات بپرس.",
        "ps": "زه یوازې په لوستونو کې مرسته کوم. دا پوښتنه له ښوونکي یا د کورنۍ له مشرانو وپوښته.",
        "en": "I only help with lessons. Please ask your teacher or your family about this.",
    },
    # P29 (C4.7): a religious ruling; drafts for a native speaker's check
    "ruling": {
        "prs": "من فقط در درس‌ها کمک می‌کنم. این سوال را از یک عالم دین که به او اعتماد داری بپرس.",
        "ps": "زه یوازې په لوستونو کې مرسته کوم. دا پوښتنه له داسې دیني عالم وپوښته چې باور پرې لرې.",
        "en": "I only help with lessons. Please ask a scholar you trust.",
    },
    "too_long": {
        "prs": "سوالت را کوتاه‌تر بنویس، در یک یا دو جمله.",
        "ps": "خپله پوښتنه لنډه ولیکه، په یوه یا دوو جملو کې.",
        "en": "Please write your question in one or two sentences.",
    },
}

MAX_CHARS = 400


def words(text: str) -> list[str]:
    """Search words, with the Dari verb prefix می / نمی joined to its verb (می‌خواهم, می خواهم and میخواهم all match).

    The joining is decided before Pashto letters are loosened, so Pashto مې ("my") stays a word of its own.
    """
    out = []
    for w in norm(text).split():
        w = w.strip("/+-×÷=*().")
        if not w:
            continue
        if out and out[-1] in ("می", "نمی"):
            out[-1] += w
        else:
            out.append(w)
    return [key(w) for w in out]


def _has(ws: list[str], phrase: list[str]) -> bool:
    n = len(phrase)
    return n > 0 and any(ws[i:i + n] == phrase for i in range(len(ws) - n + 1))


_DISTRESS = [words(p) for p in DISTRESS]
_HEALTH = [words(p) for p in HEALTH]
_OFF = [words(p) for p in OFF_LIMITS]
_RULINGS = [words(p) for p in RULINGS]


def screen(question: str):
    """None if the question may go on; otherwise (reason, urgent), where reason is a key of MESSAGES.

    Distress is urgent; distress and health questions also go to the teacher (see brain.Brain.answer)."""
    ws = words(question)
    if any(_has(ws, p) for p in _DISTRESS):
        return "distress", True
    if len(question) > MAX_CHARS:
        return "too_long", False
    if any(_has(ws, p) for p in _OFF + _RULINGS):
        return "off_limits", False
    if any(_has(ws, p) for p in _HEALTH):
        return "health", False
    return None


def message(question: str, reason: str, lang: str) -> str:
    """The kind message for a stopped question: for a religious ruling, "Please ask a scholar you trust"."""
    if reason == "off_limits" and any(_has(words(question), p) for p in _RULINGS) \
            and not any(_has(words(question), p) for p in _OFF):
        reason = "ruling"
    return MESSAGES[reason][lang]
