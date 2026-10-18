"""Hub settings, from environment variables (setup/hub.env on a real hub) with plain defaults for a laptop."""
import os
import re
from dataclasses import dataclass, field
from pathlib import Path

TUTOR = Path(__file__).resolve().parents[2]      # the tutor/ folder


def _env(name, default=None):
    v = os.environ.get(name)
    return v if v not in (None, "") else default


def _version(v: str | None) -> str | None:
    """An app version like 1.2.3 (TUTOR_APK_LATEST, TUTOR_APK_MIN); anything else is no version."""
    v = (v or "").strip()
    return v if re.fullmatch(r"\d{1,4}(\.\d{1,4}){0,3}", v) else None


def _budget(v):
    """TUTOR_AI_BUDGET: unset means the default; set but empty (or "none") means no cap."""
    if v is None:
        return Config.ai_budget
    v = v.strip().replace("_", "")
    return None if v.lower() in ("", "none") else max(0, int(v))


@dataclass
class Config:
    name: str = "Qalam"                                   # working name, shown in the app and on sheets
    data: Path = TUTOR / "data"                           # database, teacher PIN, outbox
    packs: Path = TUTOR / "content" / "packs"
    app: Path = TUTOR / "app"
    modules: Path = TUTOR / "modules"                     # one module.json per module
    cohorts: Path = TUTOR / "cohorts"                     # seed cohorts: hub, staging, open
    cohort: str | None = None                             # this hub's cohort id; empty = the one in cohorts/hub.json
    llm_url: str | None = None                            # e.g. http://127.0.0.1:8081/v1 (llama-server)
    llm_model: str = "local"
    llm_key: str | None = field(default=None, repr=False)
    llm_timeout: float = 60.0
    ai_langs: tuple = ("prs", "en")                       # Pashto joins when its answers test well (docs/ROADMAP.md)
    ai_provider: str | None = None                        # the hub's default provider (ai/policy.py PROVIDERS, or off);
                                                          # empty = local if llm_url is set. A cohort may pick its
                                                          # own in the admin panel (settings.ai_provider, ai_model)
    openai_model: str | None = None                       # each provider's default model; empty = llm_model
    anthropic_model: str = "claude-haiku-5-5"
    gemini_model: str = "gemini-3.8-flash"
    compat_url: str | None = None                         # openai_compat: the chat server's base URL, e.g. .../v1
    compat_model: str | None = None
    # API keys: Worker secrets or environment variables only, never in D1, the repository or any API answer
    openai_key: str | None = field(default=None, repr=False)        # OPENAI_API_KEY (else TUTOR_LLM_KEY)
    anthropic_key: str | None = field(default=None, repr=False)     # ANTHROPIC_API_KEY
    gemini_key: str | None = field(default=None, repr=False)        # GEMINI_API_KEY
    compat_key: str | None = field(default=None, repr=False)        # TUTOR_COMPAT_API_KEY
    ai_budget: int | None = 300_000                       # AI tokens per cohort per UTC day; empty = no cap, 0 = no AI
    print_backend: str = "auto"                           # cups, outbox, or auto (cups if installed)
    printer: str | None = None                            # CUPS queue name; empty = the system default
    free_copies: int = 3                                  # more copies than this need the teacher's PIN
    copies_per_hour: int = 12                             # per phone, so a child cannot empty the paper tray
    public_url: str = "http://10.42.0.1"                  # what phones type or scan to open the app
    wifi_ssid: str | None = None                          # for the printed hub card's join code
    wifi_password: str | None = None
    keep_days: int = 60                                   # questions are deleted after this (approved answers stay)
    lacks: tuple = ()                                     # module needs this host cannot meet: the Worker lacks
                                                          # printer and pin, so print and teacher are off there
    home: str = "hub"                                     # hub (the village hub, plain http) or online (the Worker):
                                                          # which consent text learners see; online, limits go by
                                                          # learner token, Ask needs her consent, CORS is narrowed
    origins: tuple = ()                                   # online: other sites that may call the API (the Android
                                                          # app's, later); the app's own needs none. The hub allows any
    release: bool = False                                 # production: serve only signed lessons (TUTOR_RELEASE=1);
                                                          # otherwise drafts are served, marked as drafts
    staff_gate: str = "auto"                              # staff pages (/review/, P17): auto, pin, access or off.
                                                          # auto: the teacher PIN on the hub; online, Cloudflare
                                                          # Access when the three settings below are all set; else off
    access_team: str | None = None                        # online: the Access team name (<team>.cloudflareaccess.com)
    access_aud: str | None = None                         # online: the Access application's audience tag
    staff_pepper: str | None = None                       # a secret, never in D1 or the repository: staff rows keep
                                                          # SHA-256(pepper + email), so without it no one is staff
    apk_latest: str | None = None                         # the Android app (P23): the newest version on /get
    apk_min: str | None = None                            # (TUTOR_APK_LATEST), and the oldest that may still talk to
                                                          # this server (TUTOR_APK_MIN); both "1.2.3", not secrets
    # live audio classes (P30a, C6.1): Cloudflare Realtime's SFU app and TURN key, Worker secrets only (never in D1,
    # the repository or any answer); the module `live` is held off while the app id or its secret is missing
    rtc_app: str | None = field(default=None, repr=False)            # TUTOR_RTC_APP
    rtc_secret: str | None = field(default=None, repr=False)         # TUTOR_RTC_SECRET
    rtc_turn_key: str | None = field(default=None, repr=False)       # TUTOR_RTC_TURN_KEY
    rtc_turn_secret: str | None = field(default=None, repr=False)    # TUTOR_RTC_TURN_SECRET
    # the school bag's relay (W6, WEBSITE.md 3.7): bag ids are HMAC(pepper, F_r), so a copy of the bags table alone
    # cannot be tested against guessed codes. Online a Worker secret (TUTOR_BAG_PEPPER, docs/HOSTING.md); a hub, or
    # any server that keeps its own SQLite, makes one at first start in its data folder (bag-pepper.txt)
    bag_pepper: str | None = field(default=None, repr=False)
    rtc_gb_month: int = 900                               # TUTOR_RTC_GB_MONTH: no class starts once the month's
                                                          # estimate reaches it (inside the free 1,000 GB)
    extra: dict = field(default_factory=dict)

    @classmethod
    def from_env(cls, **over):
        c = cls(
            name=_env("TUTOR_NAME", cls.name),
            data=Path(_env("TUTOR_DATA", cls.data)),
            packs=Path(_env("TUTOR_PACKS", cls.packs)),
            app=Path(_env("TUTOR_APP", cls.app)),
            cohort=_env("TUTOR_COHORT"),
            llm_url=_env("TUTOR_LLM_URL"),
            llm_model=_env("TUTOR_LLM_MODEL", cls.llm_model),
            llm_key=_env("TUTOR_LLM_KEY"),
            llm_timeout=float(_env("TUTOR_LLM_TIMEOUT", cls.llm_timeout)),
            ai_langs=tuple(x.strip() for x in _env("TUTOR_AI_LANGS", "prs,en").split(",") if x.strip()),
            ai_provider=_env("TUTOR_AI_PROVIDER"),
            openai_model=_env("TUTOR_OPENAI_MODEL"),
            anthropic_model=_env("TUTOR_ANTHROPIC_MODEL", cls.anthropic_model),
            gemini_model=_env("TUTOR_GEMINI_MODEL", cls.gemini_model),
            compat_url=_env("TUTOR_COMPAT_URL"),
            compat_model=_env("TUTOR_COMPAT_MODEL"),
            openai_key=_env("OPENAI_API_KEY"),
            anthropic_key=_env("ANTHROPIC_API_KEY"),
            gemini_key=_env("GEMINI_API_KEY"),
            compat_key=_env("TUTOR_COMPAT_API_KEY"),
            ai_budget=_budget(os.environ.get("TUTOR_AI_BUDGET")),
            print_backend=_env("TUTOR_PRINT", cls.print_backend),
            printer=_env("TUTOR_PRINTER"),
            free_copies=int(_env("TUTOR_FREE_COPIES", cls.free_copies)),
            copies_per_hour=int(_env("TUTOR_COPIES_PER_HOUR", cls.copies_per_hour)),
            public_url=_env("TUTOR_PUBLIC_URL", cls.public_url),
            wifi_ssid=_env("TUTOR_WIFI_SSID"),
            wifi_password=_env("TUTOR_WIFI_PASSWORD"),
            keep_days=int(_env("TUTOR_KEEP_DAYS", cls.keep_days)),
            lacks=tuple(x.strip() for x in _env("TUTOR_LACKS", "").split(",") if x.strip()),
            home="online" if _env("TUTOR_HOME", "hub").strip().lower() == "online" else "hub",
            origins=tuple(x.strip() for x in _env("TUTOR_ORIGINS", "").split(",") if x.strip()),
            release=_env("TUTOR_RELEASE", "0").strip().lower() in ("1", "true", "yes", "on"),
            staff_gate=_env("TUTOR_STAFF_GATE", cls.staff_gate).strip().lower(),
            access_team=_env("TUTOR_ACCESS_TEAM"),
            access_aud=_env("TUTOR_ACCESS_AUD"),
            staff_pepper=_env("TUTOR_STAFF_PEPPER"),
            apk_latest=_version(_env("TUTOR_APK_LATEST")),
            apk_min=_version(_env("TUTOR_APK_MIN")),
            rtc_app=_env("TUTOR_RTC_APP"),
            rtc_secret=_env("TUTOR_RTC_SECRET"),
            rtc_turn_key=_env("TUTOR_RTC_TURN_KEY"),
            rtc_turn_secret=_env("TUTOR_RTC_TURN_SECRET"),
            rtc_gb_month=max(0, int(_env("TUTOR_RTC_GB_MONTH", cls.rtc_gb_month))),
            bag_pepper=_env("TUTOR_BAG_PEPPER"),
        )
        for k, v in over.items():
            setattr(c, k, v)
        return c
