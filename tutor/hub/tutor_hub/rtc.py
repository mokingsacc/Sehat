"""Cloudflare Realtime: the relay that carries a live class's sound (P30a, C6.A1 and C6.1).

The Worker never sees media. It only asks Cloudflare's Realtime SFU, over HTTPS with the app's secret, to make a
session for each participant, to publish the teacher's microphone as the track `mic` of her session, and to let each
listener's session pull that remote track (and, in an adult-only class, the track `voice` of an adult given the
floor, P30b); and it asks the TURN service for short-lived ICE credentials (2 hours)
for phones that cannot reach the relay directly. What crosses this module is SDP text (the browsers' descriptions of
a connection), session ids and track names: never sound, never a learner's token or anything that names her.

The four secrets (`TUTOR_RTC_APP`, `TUTOR_RTC_SECRET`, `TUTOR_RTC_TURN_KEY`, `TUTOR_RTC_TURN_SECRET`) are Worker
secrets Mo sets per environment (docs/HOSTING.md, "Live classes: the Realtime set-up"); without the first two the
module `live` is held off (server.py `held`), so nothing here is ever called. Tests use tests/fakes/rtc.py.

Opus, mono, about 32 kbps: the relay's answer to the teacher's offer is given `maxaveragebitrate=32000;stereo=0` on
the Opus line before it reaches her browser, which then encodes no more than that. No video transceiver ever.
"""
import re

import httpx

BASE = "https://rtc.live.cloudflare.com/v1"
HOST = "rtc.live.cloudflare.com"
TURN_TTL = 7200                       # seconds: the ICE credentials a phone gets live 2 hours
BITRATE = 32000
TIMEOUT = 10.0
STUN = [{"urls": ["stun:stun.cloudflare.com:3478"]}]


class RtcError(RuntimeError):
    """The relay refused or did not answer. The message is a status or an error class, never a secret or an SDP."""


def munge_opus(sdp: str, bitrate: int = BITRATE) -> str:
    """The SDP with every Opus payload's fmtp line set to mono at `bitrate` bits a second (a missing fmtp line is
    added after its rtpmap). Lines end in CRLF, as SDP wants."""
    lines = sdp.replace("\r\n", "\n").split("\n")
    opus = {m.group(1) for line in lines if (m := re.match(r"a=rtpmap:(\d+) opus/48000", line, re.I))}
    out, done = [], set()
    for line in lines:
        m = re.match(r"a=fmtp:(\d+) (.*)", line)
        if m and m.group(1) in opus:
            params = [p for p in m.group(2).split(";") if p.strip()
                      and p.split("=")[0].strip().lower() not in ("maxaveragebitrate", "stereo", "sprop-stereo")]
            params += [f"maxaveragebitrate={bitrate}", "stereo=0", "sprop-stereo=0"]
            line = f"a=fmtp:{m.group(1)} " + ";".join(p.strip() for p in params)
            done.add(m.group(1))
        out.append(line)
    final = []
    for line in out:
        final.append(line)
        m = re.match(r"a=rtpmap:(\d+) opus/48000", line, re.I)
        if m and m.group(1) not in done:
            final.append(f"a=fmtp:{m.group(1)} maxaveragebitrate={bitrate};stereo=0;sprop-stereo=0")
            done.add(m.group(1))
    while final and final[-1] == "":
        final.pop()
    return "\r\n".join(final) + "\r\n"


def no_video(sdp: str) -> bool:
    """True when the SDP has no video section: a live class carries sound only."""
    return not re.search(r"^m=video ", sdp.replace("\r\n", "\n"), re.M)


class Realtime:
    """The relay's HTTPS API (sessions and tracks) and the TURN credentials endpoint, with httpx."""

    def __init__(self, cfg, client: httpx.AsyncClient | None = None):
        self.cfg = cfg
        self._client = client

    def ready(self) -> bool:
        return bool(self.cfg.rtc_app and self.cfg.rtc_secret)

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=TIMEOUT)
        return self._client

    async def _call(self, method: str, path: str, body: dict | None = None, *, bearer: str) -> dict:
        url = f"{BASE}{path}"
        if httpx.URL(url).host != HOST:            # the relay's own host, and no other
            raise RtcError("not the relay's host")
        try:
            r = await self._http().request(method, url, json=body, headers={"Authorization": f"Bearer {bearer}"})
            r.raise_for_status()
            data = r.json() if r.content else {}
        except httpx.HTTPStatusError as e:
            raise RtcError(f"HTTP {e.response.status_code}") from None
        except (httpx.HTTPError, ValueError) as e:
            raise RtcError(type(e).__name__) from None
        if not isinstance(data, dict):
            raise RtcError("not an object")
        if data.get("errorCode") or data.get("errorDescription"):
            raise RtcError(str(data.get("errorCode") or "error")[:60])
        return data

    async def _app(self, method: str, path: str, body: dict | None = None) -> dict:
        if not self.ready():
            raise RtcError("not set up")
        return await self._call(method, f"/apps/{self.cfg.rtc_app}{path}", body, bearer=self.cfg.rtc_secret)

    async def ice(self) -> list[dict]:
        """ICE servers for one join: Cloudflare's STUN, and TURN with credentials that live 2 hours when the TURN
        key is set (both of the endpoint's answer shapes are read)."""
        if not (self.cfg.rtc_turn_key and self.cfg.rtc_turn_secret):
            return STUN
        data = await self._call("POST", f"/turn/keys/{self.cfg.rtc_turn_key}/credentials/generate-ice-servers",
                                {"ttl": TURN_TTL}, bearer=self.cfg.rtc_turn_secret)
        servers = data.get("iceServers")
        if isinstance(servers, dict):
            servers = [servers]
        if not isinstance(servers, list) or not servers:
            raise RtcError("no ice servers")
        out = []
        for s in servers:
            if isinstance(s, dict) and s.get("urls"):
                out.append({k: s[k] for k in ("urls", "username", "credential") if k in s})
        return out or STUN

    async def new_session(self, offer: str | None = None) -> tuple[str, str | None]:
        """A relay session: (its id, the relay's answer to `offer`, or None with no offer)."""
        body = {"sessionDescription": {"type": "offer", "sdp": offer}} if offer else None
        data = await self._app("POST", "/sessions/new", body)
        sid = data.get("sessionId")
        if not isinstance(sid, str) or not sid:
            raise RtcError("no session id")
        answer = (data.get("sessionDescription") or {}).get("sdp")
        return sid, answer if isinstance(answer, str) else None

    async def publish(self, session: str, offer: str, mid: str, track: str) -> str:
        """Publishes the browser's track at `mid` as `track` on `session`; returns the relay's answer, Opus mono at
        32 kbps."""
        data = await self._app("POST", f"/sessions/{session}/tracks/new", {
            "sessionDescription": {"type": "offer", "sdp": offer},
            "tracks": [{"location": "local", "mid": mid, "trackName": track}]})
        answer = (data.get("sessionDescription") or {}).get("sdp")
        if not isinstance(answer, str):
            raise RtcError("no answer")
        return munge_opus(answer)

    async def pull(self, session: str, remote: str, track: str) -> tuple[str | None, bool]:
        """Pulls `track` of the session `remote` into `session`: (the relay's offer, whether the browser must answer
        it now)."""
        return await self.pull_many(session, [(remote, track)])

    async def pull_many(self, session: str, tracks: list[tuple[str, str]]) -> tuple[str | None, bool]:
        """Pulls several remote tracks, each `(session, track)`, into `session` in one offer: the teacher's `mic` and
        the floor's `voice` (P30b)."""
        data = await self._app("POST", f"/sessions/{session}/tracks/new", {
            "tracks": [{"location": "remote", "sessionId": remote, "trackName": track} for remote, track in tracks]})
        sdp = (data.get("sessionDescription") or {}).get("sdp")
        return (sdp if isinstance(sdp, str) else None), bool(data.get("requiresImmediateRenegotiation"))

    async def renegotiate(self, session: str, answer: str) -> None:
        await self._app("PUT", f"/sessions/{session}/renegotiate",
                        {"sessionDescription": {"type": "answer", "sdp": answer}})

    async def aclose(self):
        if self._client is not None:
            await self._client.aclose()
            self._client = None
