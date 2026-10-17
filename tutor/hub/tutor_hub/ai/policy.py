"""Which providers may see a learner's words, and where each may send them (BUILD-PLAN 3.7). Code decides the hosts;
the admin panel decides, per cohort, which provider and model (the AI provider switch, decision log 17 Oct 2026).

Every purpose the gateway serves is a learner purpose: `explain`, `hint`, `read_sheet`, `plan`, `screen`. Each
provider goes only to its own host:
- `openai`: only https://api.openai.com;
- `anthropic` (Claude's Messages API): only https://api.anthropic.com;
- `gemini` (the Gemini API's OpenAI-compatible endpoint): only https://generativelanguage.googleapis.com;
- `openai_compat`: any OpenAI-compatible chat server at TUTOR_COMPAT_URL, over https, or plain http on the hub's own
  network (an open-weight model on a hosting service, or the hub's own server);
- `local` (the village hub): only a model server on this machine or the hub's own network (loopback, private
  addresses, `localhost`, a one-word name or a `.lan`, `.local` or `.internal` name);
- `fake` (tests, and staging's default): no host at all.
Each provider's own terms (where it may be used, and by whom) are the owner's to weigh (docs/HOSTING.md); no code
gate stands for them. Whatever the provider, the gateway's identifier filter, rules screen and budget come first.
A refusal raises PolicyError: at start-up the hub does not start, and a call that slips past start-up never leaves.
"""
import ipaddress
from urllib.parse import urlsplit

PURPOSES = ("explain", "hint", "read_sheet", "plan", "screen")
PROVIDERS = ("openai", "anthropic", "gemini", "openai_compat", "local", "fake")
OPENAI_URL = "https://api.openai.com/v1"
ANTHROPIC_URL = "https://api.anthropic.com"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai"
# a provider with one home: it goes only there, over https
HOMES = {"openai": OPENAI_URL, "anthropic": ANTHROPIC_URL, "gemini": GEMINI_URL}
LOCAL_SUFFIXES = (".lan", ".local", ".internal", ".home.arpa")


class PolicyError(RuntimeError):
    """A call that must never happen: an unknown provider, a provider sent to a host not its own, or a purpose a
    module may not use."""


def host_of(url: str | None) -> str | None:
    if not url:
        return None
    try:
        h = urlsplit(url.strip()).hostname
    except ValueError as e:
        raise PolicyError(f"not a model server address: {e}") from None
    if not h:
        raise PolicyError("a model server address needs a host")
    return h.lower().rstrip(".")


def local_host(host: str) -> bool:
    try:
        ip = ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        return host == "localhost" or "." not in host or host.endswith(LOCAL_SUFFIXES)
    return ip.is_loopback or ip.is_private or ip.is_link_local


def check_provider(provider: str, url: str | None) -> None:
    """Raise PolicyError unless `provider` may serve learner purposes at `url`."""
    host = host_of(url)
    if provider not in PROVIDERS:
        raise PolicyError(f"{provider!r} is not a provider for learners (only {', '.join(PROVIDERS)})")
    if provider == "fake" and host:
        raise PolicyError("the fake provider has no host")
    if provider in HOMES:
        home = HOMES[provider]
        if host != host_of(home) or urlsplit(url).scheme != "https":
            raise PolicyError(f"the {provider} provider goes only to https://{host_of(home)}")
    if provider == "local" and (not host or not local_host(host)):
        raise PolicyError(f"the local provider goes only to this hub's own network, not {host}")
    if provider == "openai_compat":
        if not host:
            raise PolicyError("the openai_compat provider needs TUTOR_COMPAT_URL")
        if urlsplit(url).scheme != "https" and not local_host(host):
            raise PolicyError(f"the openai_compat provider uses https away from the hub's own network, not {url}")


def check(provider: str, url: str | None, purpose: str) -> None:
    """Raise PolicyError unless a call for `purpose` may go to `provider` at `url`."""
    if purpose not in PURPOSES:
        raise PolicyError(f"unknown AI purpose {purpose!r}")
    check_provider(provider, url)
