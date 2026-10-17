"""Who may open the staff pages (C3.2; the review screens first, P17).

Two gates, one per host, never both:
- On the village hub, the teacher's PIN (`X-Teacher-Pin`, with the hub's lock-out). The PIN gives no role: the
  reviewer says which of a lesson's roles she signs for, and types her initials when she signs.
- Online, Cloudflare Access. Access sits in front of `/review/*` and `/api/m/review/*` and lets in only the emails
  its policy lists (kept at Cloudflare by the admin; Qalam never stores one). Every request then carries Access's
  signed token (`Cf-Access-Jwt-Assertion`). The hub checks its RS256 signature against the team's published keys,
  its audience, issuer and times, and looks up SHA-256(pepper, lower-cased email) in `staff`: no row, "Ask the admin
  to add you". The email is dropped as soon as it is hashed. The pepper is a secret (`TUTOR_STAFF_PEPPER`), never in
  D1 or the repository, so the table alone says nothing about anyone.

The admin panel (P21, `/admin/`) asks `admin()`: online the staff row's role must be `admin`; on the hub it takes the
hub's admin PIN (`X-Admin-Pin`), which is separate from the teacher's (C3.3).

`TUTOR_STAFF_GATE` picks the gate: `auto` (the default) is the PIN on the hub and Access online, but only when the
Access team, the audience and the pepper are all set; without them the staff pages are off (404). The fallback
container sets `off`: nothing stands in front of it, so it serves no staff page at all. RS256 is checked here in
plain Python (no new dependency).
"""
import base64
import hashlib
import hmac
import json
import logging
import time

from fastapi import HTTPException, Request

log = logging.getLogger("tutor.staff")

ACCESS_HEADER = "cf-access-jwt-assertion"
KEYS_TTL = 3600                      # Access rotates its keys every six weeks; an unknown key id refetches
MISS_TTL = 60                        # ... at most once a minute (C5 L3)
WRITE_HEADER = "x-qalam"             # on every staff write online (C5 M1): `X-Qalam: 1`
LEEWAY = 60
# DER of the SHA-256 DigestInfo, the prefix of every PKCS#1 v1.5 SHA-256 signature
SHA256_INFO = bytes.fromhex("3031300d060960864801650304020105000420")


class Refusal(HTTPException):
    """A staff refusal with a stable `code` beside its sentence (C5.1): the staff pages show `error.<code>` from their
    string files in the reader's language, and the server's sentence for anything without a code."""

    def __init__(self, status: int, code: str, detail: str):
        super().__init__(status, detail)
        self.code = code


def refuse(status: int, code: str, detail: str) -> Refusal:
    """The codes: last_admin, not_your_class, confirm_first, locked, photo_gate, budget, wrong_pin, wait, no_cohort,
    access; since P30a live_open and cap; since P31 contest_sent and not_signed; since P30b floor_held and floor_few
    (tools/check_staff_strings.mjs checks each has its sentence in en.js)."""
    return Refusal(status, code, detail)


def id_hash(pepper: str, email: str) -> str:
    """The staff row's key: SHA-256 over the pepper and the lower-cased email."""
    return hashlib.sha256(pepper.encode() + b"\n" + email.strip().lower().encode()).hexdigest()


def _b64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _int(s: str) -> int:
    return int.from_bytes(_b64(s), "big")


def rs256_ok(signed: bytes, sig: bytes, n: int, e: int) -> bool:
    """RSASSA-PKCS1-v1_5 with SHA-256 (RFC 8017 8.2.2)."""
    k = (n.bit_length() + 7) // 8
    if len(sig) != k or k < 256:                       # 2048-bit keys and up
        return False
    s = int.from_bytes(sig, "big")
    if s >= n:
        return False
    em = pow(s, e, n).to_bytes(k, "big")
    t = SHA256_INFO + hashlib.sha256(signed).digest()
    want = b"\x00\x01" + b"\xff" * (k - len(t) - 3) + b"\x00" + t
    return hmac.compare_digest(em, want)


def verify(token: str, *, keys: list[dict], team: str, aud: str, now: float | None = None) -> dict:
    """The claims of an Access token, or ValueError saying why it is refused."""
    now = time.time() if now is None else now
    try:
        head64, body64, sig64 = token.split(".")
        head, claims = json.loads(_b64(head64)), json.loads(_b64(body64))
        sig = _b64(sig64)
    except (ValueError, TypeError):
        raise ValueError("not a token") from None
    if head.get("alg") != "RS256":
        raise ValueError("not RS256")
    key = next((k for k in keys if k.get("kid") == head.get("kid") and k.get("kty") == "RSA"), None)
    if key is None:
        raise ValueError("unknown key")
    if not rs256_ok(f"{head64}.{body64}".encode(), sig, _int(key["n"]), _int(key["e"])):
        raise ValueError("bad signature")
    auds = claims.get("aud") if isinstance(claims.get("aud"), list) else [claims.get("aud")]
    if aud not in auds:
        raise ValueError("another application's token")
    if claims.get("iss") != f"https://{team}.cloudflareaccess.com":
        raise ValueError("another issuer")
    if not isinstance(claims.get("exp"), (int, float)) or claims["exp"] < now - LEEWAY:
        raise ValueError("expired")
    if isinstance(claims.get("nbf"), (int, float)) and claims["nbf"] > now + LEEWAY:
        raise ValueError("not yet valid")
    if not isinstance(claims.get("email"), str) or "@" not in claims["email"]:
        raise ValueError("no email")
    return claims


async def fetch_keys(team: str) -> list[dict]:
    """The team's public keys, from Access. In the Worker through the runtime's fetch; elsewhere through httpx."""
    url = f"https://{team}.cloudflareaccess.com/cdn-cgi/access/certs"
    try:
        from js import fetch                          # the Python Worker
    except ImportError:
        fetch = None
    if fetch is not None:
        r = await fetch(url)
        return json.loads(await r.text()).get("keys", [])
    import httpx
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(url)
        r.raise_for_status()
        return r.json().get("keys", [])


class Gate:
    def __init__(self, hub, fetcher=None):
        self.hub = hub
        cfg = hub.cfg
        self.mode = mode_of(cfg)
        self.fetcher = fetcher or fetch_keys
        self._keys: tuple[float, list] = (0.0, [])
        self._miss = 0.0                            # when a key id we did not have last made us fetch (C5 L3)

    @property
    def on(self) -> bool:
        return self.mode != "off"

    async def keys(self, kid: str | None) -> list[dict]:
        at, keys = self._keys
        now = time.time()
        stale = now - at > KEYS_TTL
        # an unknown key id fetches again (Access rotates its keys), but at most once a minute: a made-up `kid` on
        # every request does not make the Worker fetch the team's keys every time (C5 L3)
        if stale or (not any(k.get("kid") == kid for k in keys) and now - self._miss > MISS_TTL):
            if not stale:
                self._miss = now
            keys = await self.fetcher(self.hub.cfg.access_team)
            self._keys = (now, keys)
        return keys

    async def who(self, request: Request) -> dict:
        """The staff member asking: {label, role, cohorts, initials, via}. 404 while the gate is off; 401 without
        a PIN or token; 403 for a token Access did not sign for us, or an email not in `staff`."""
        if self.mode == "off":
            raise HTTPException(404, "Not Found")
        if self.mode == "pin":
            self.hub.check_pin(request.headers.get("x-teacher-pin"), self.hub.who(request))
            return {"label": "hub", "role": None, "cohorts": [], "initials": "", "via": "pin"}
        # C5 M1: the Access cookie goes with a form posted from any site, so a staff write must carry a header a
        # form cannot set (the staff pages' api() adds it; another site's script would need a CORS preflight)
        if request.method not in ("GET", "HEAD") and request.headers.get(WRITE_HEADER) != "1":
            raise HTTPException(403, "a staff change needs the X-Qalam header")
        token = request.headers.get(ACCESS_HEADER)
        if not token:
            raise refuse(401, "access", "sign in through Cloudflare Access")
        cfg = self.hub.cfg
        try:
            kid = json.loads(_b64(token.split(".")[0])).get("kid")
            claims = verify(token, keys=await self.keys(kid), team=cfg.access_team, aud=cfg.access_aud)
        except ValueError as e:
            log.info("staff token refused: %s", e)
            raise refuse(403, "access", "not signed in for Qalam") from None
        except Exception:
            log.exception("Access keys not fetched")
            raise HTTPException(503, "cannot check the sign-in now") from None
        row = await self.hub.store.staff_member(id_hash(cfg.staff_pepper, claims["email"]))
        del claims
        if row is None:
            raise HTTPException(403, "Ask the admin to add you")
        return dict(row, via="access")

    async def admin(self, request: Request) -> dict:
        """The admin asking (P21): {label, role: admin, cohorts, initials, via}. On the hub the admin PIN, not the
        teacher's; online a staff row whose role is admin (any other role: 403)."""
        if self.mode == "off":
            raise HTTPException(404, "Not Found")
        if self.mode == "pin":
            self.hub.check_pin(request.headers.get("x-admin-pin"), self.hub.who(request), admin=True)
            return {"label": "hub", "role": "admin", "cohorts": [], "initials": "", "via": "pin"}
        me = await self.who(request)
        if me.get("role") != "admin":
            raise HTTPException(403, "admins only")
        return me


def mode_of(cfg) -> str:
    gate = (cfg.staff_gate or "auto").lower()
    if gate == "off":
        return "off"
    if gate in ("auto", "pin") and cfg.home == "hub" and "pin" not in cfg.lacks:
        return "pin"
    if gate in ("auto", "access") and cfg.home == "online" and cfg.access_team and cfg.access_aud and cfg.staff_pepper:
        return "access"
    return "off"
