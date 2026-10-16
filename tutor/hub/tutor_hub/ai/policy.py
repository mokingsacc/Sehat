"""Which providers and hosts may see a learner's words (BUILD-PLAN 3.7). Code, not configuration, decides.

Every purpose the gateway serves is a learner purpose: `explain`, `hint`, `read_sheet`, `plan`, `screen`. For them:
- `openai` (online): only https://api.openai.com;
- `local` (the village hub): only a model server on this machine or the hub's own network (loopback, private
  addresses, `localhost`, a one-word name or a `.lan`, `.local` or `.internal` name);
- `fake` (tests, and staging until a key exists): no host at all.
Any other provider is refused, and so is any host of Anthropic or Google whatever the provider is called: the drafting
and evaluation tools in tutor/tools, which carry no learner data, are the only place those may be used.
A refusal raises PolicyError: at start-up the hub does not start, and a call that slips past start-up never leaves.
"""
import ipaddress
from urllib.parse import urlsplit

PURPOSES = ("explain", "hint", "read_sheet", "plan", "screen")
PROVIDERS = ("openai", "local", "fake")
OPENAI_URL = "https://api.openai.com/v1"
OPENAI_HOSTS = ("api.openai.com",)
# any host label containing one of these words is refused for learner purposes
REFUSED_WORDS = ("anthropic", "claude", "google", "gemini", "vertexai", "generativelanguage", "deepmind")
REFUSED_SUFFIXES = (".goog", ".gle", ".youtube")
LOCAL_SUFFIXES = (".lan", ".local", ".internal", ".home.arpa")


class PolicyError(RuntimeError):
    """A call that must never happen: a refused provider or host, or a purpose a module may not use."""


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


def refused_host(host: str) -> bool:
    """Anthropic's and Google's hosts, whatever the provider claims to be."""
    return (any(w in label for label in host.split(".") for w in REFUSED_WORDS)
            or host.endswith(REFUSED_SUFFIXES) or host in ("g.co", "goo.gl"))


def local_host(host: str) -> bool:
    try:
        ip = ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        return host == "localhost" or "." not in host or host.endswith(LOCAL_SUFFIXES)
    return ip.is_loopback or ip.is_private or ip.is_link_local


def check_provider(provider: str, url: str | None) -> None:
    """Raise PolicyError unless `provider` at `url` may serve learner purposes."""
    host = host_of(url)
    if host and refused_host(host):
        raise PolicyError(f"learner words never go to {host}")
    if provider not in PROVIDERS:
        raise PolicyError(f"{provider!r} is not a provider for learners (only {', '.join(PROVIDERS)})")
    if provider == "fake" and host:
        raise PolicyError("the fake provider has no host")
    if provider == "openai" and (host not in OPENAI_HOSTS or urlsplit(url).scheme != "https"):
        raise PolicyError(f"the openai provider goes only to https://{OPENAI_HOSTS[0]}")
    if provider == "local" and (not host or not local_host(host)):
        raise PolicyError(f"the local provider goes only to this hub's own network, not {host}")


def check(provider: str, url: str | None, purpose: str) -> None:
    """Raise PolicyError unless a call for `purpose` may go to `provider` at `url`."""
    if purpose not in PURPOSES:
        raise PolicyError(f"unknown AI purpose {purpose!r}")
    check_provider(provider, url)
