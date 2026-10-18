"""A stand-in for Cloudflare Realtime (tutor_hub/rtc.py) in tests: it answers the session and track calls with made-up
ids and SDP, and records every call it was given, so a test can assert what would have been sent: SDP text, session
ids and track names, never audio and never a learner's token. Nothing here reaches the network."""
import itertools

from tutor_hub.rtc import STUN, RtcError, munge_opus

OFFER = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n" \
        "a=fmtp:111 minptime=10;useinbandfec=1\r\na=mid:0\r\n"


class FakeRTC:
    def __init__(self, cfg=None, up: bool = True):
        self.cfg = cfg
        self.up = up
        self.calls: list[tuple] = []
        self._n = itertools.count(1)

    def ready(self) -> bool:
        return True

    def _check(self, name, *args):
        self.calls.append((name, *args))
        if not self.up:
            raise RtcError("HTTP 503")

    async def ice(self):
        self._check("ice")
        return [{"urls": ["turn:turn.cloudflare.com:443?transport=tcp"], "username": "u", "credential": "c"}] + STUN

    async def new_session(self, offer=None):
        self._check("new_session", offer)
        sid = f"sfu{next(self._n)}"
        return sid, (munge_opus(offer) if offer else None)

    async def publish(self, session, offer, mid, track):
        self._check("publish", session, offer, mid, track)
        return munge_opus(OFFER)

    async def pull(self, session, remote, track):
        self._check("pull", session, remote, track)
        return OFFER, True

    async def pull_many(self, session, tracks):
        self._check("pull_many", session, tuple(tracks))
        return OFFER, True

    async def renegotiate(self, session, answer):
        self._check("renegotiate", session, answer)

    async def aclose(self):
        pass

    def sent(self) -> str:
        return repr(self.calls)
