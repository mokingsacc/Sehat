"""Hub settings, from environment variables (setup/hub.env on a real hub) with plain defaults for a laptop."""
import os
from dataclasses import dataclass, field
from pathlib import Path

TUTOR = Path(__file__).resolve().parents[2]      # the tutor/ folder


def _env(name, default=None):
    v = os.environ.get(name)
    return v if v not in (None, "") else default


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
    llm_key: str | None = None
    llm_timeout: float = 60.0
    ai_langs: tuple = ("prs", "en")                       # Pashto joins when its answers test well (docs/ROADMAP.md)
    ai_provider: str | None = None                        # off, local, openai or fake; empty = local if llm_url is set
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
        )
        for k, v in over.items():
            setattr(c, k, v)
        return c
