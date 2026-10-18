"""Live audio classes (the `live` module, P30a; DESIGN-C6-SPECS.md C6.1 to C6.3).

The sound goes through Cloudflare's relay (rtc.py), never through the server: the teacher's browser publishes her
microphone as the track `mic` of her relay session, and each listening phone's relay session pulls that one track.
The server keeps only the class's state, in two tables (migrations/0019_live.sql): one `live_sessions` row (counts,
the audio switch, the board) and one `live_present` row per learner in the room (her token's hash, her relay
session, a one-time ticket, a raised hand with a chip code). Phones and the teacher's page poll over HTTPS; nothing
is pushed, nothing is recorded, and no event is written for anyone.

Learner routes (her token, her class from it only, `needs("live")`, consent required; `?cohort=` is never read):
- `GET  /api/m/live`: her class's open session `{id, subject, since, here}` or `{}`; 30 a minute.
- `POST /api/m/live/{id}/join`: 410 once the class ended, 404 for another class's session, 10 a minute; her row made
  or refreshed with a ticket (16 random bytes, 60 seconds, used once): `{ticket, ice, state, v}`.
- `POST /api/m/live/{id}/sdp` `{ticket, sdp?}`: makes her relay session and, while the audio is on, pulls the
  teacher's track: `{sdp, type, renegotiate, audio}` (the relay's offer, which the phone answers through `answer`).
- `POST /api/m/live/{id}/answer` `{sdp}`: her browser's answer to the relay's offer, for her own relay session.
- `GET  /api/m/live/{id}/state?v=`: 204 while `v` is the same, else `{v, audio, board, floor, pub, over, hand,
  joined}` (`hand` her own raised hand's reason, which the teacher may lower); 20 a minute.
- `POST /api/m/live/{id}/hand` `{reason: 1|2|3|null}`: 30 a minute. `POST /api/m/live/{id}/leave`.
- `POST /api/m/live/{id}/speak` `{ticket, sdp, mid}` (P30b, C6.4): an adult who holds the floor publishes her
  microphone as the track `voice` of a relay session of its own: `{sdp, until}`. 403 for a token whose band is not
  `ad` and for anyone not holding the floor; 409 `locked` unless the class is adults only, its `floor` setting is on
  and her consent version names live classes. `{done: true}` gives the floor back.

Teacher routes (`/api/m/teacher/live/*`; the staff gate, role teacher or admin, her own class only, else 403
`not_your_class`; `X-Qalam: 1` on every write, on the hub too):
- `GET  /api/m/teacher/live?cohort=`: whether `live` is on for the class, its open session, today's count against
  `per_day`, `max_minutes` and the subjects.
- `POST /api/m/teacher/live/start` `{cohort, subject}`: 409 while one is open, 429 `budget` when today's `per_day`
  is used, 409 `cap` once the month's estimate reaches `TUTOR_RTC_GB_MONTH`: `{id, ice}`.
- `POST .../{id}/sdp` `{sdp, mid}`: publishes her microphone: `{sdp}` (Opus, mono, 32 kbps). Never video.
- `GET  .../{id}/roster`: `{v, here, hands, audio, board, floor, minutes, max_minutes, over}`; 60 a minute. The two
  learners' rule lives here: the audio is on while two or more learners were seen in the last 30 seconds and she
  has published; off otherwise, after two minutes' grace once it was on.
- `POST .../{id}/board` `{lesson, step}` or `{}`; `POST .../{id}/lower` `{alias}` or `{all: true}`; `POST .../{id}/end`.
- `POST .../{id}/floor` `{alias}` gives the floor to one adult in the room for at most 90 seconds (P30b, C6.4): 409
  `locked` unless every band of the class is `ad`, `floor` is on and her consent version names live classes;
  `floor_held` while someone has it; `floor_few` while fewer than two learners listen. `{}` takes it back. The floor
  also falls at 90 seconds, when the sound goes off, when she leaves or is no longer seen, and when she says Done.
- `POST .../{id}/listen` `{sdp?}` and `.../{id}/answer` `{sdp}`: the teacher's page pulls the floor's `voice` into a
  relay session of its own, as a phone pulls `mic`.

The floor (P30b) is in the session's state only while it lasts: `{alias, until, sfu, published}`, never a token.
Phones see `{until, on}` and whether it is their own; listeners pull `voice` beside `mic` (each publish bumps `pub`,
so phones pull again, and again without it once the floor falls). Nothing is recorded and no event is written.

Every route reads at most 16 KB of body (SDP text) and refuses more with 413 before reading it.
"""
import json
import math
import secrets
import string
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, Response

from .. import flags, timetable
from ..rtc import RtcError, no_video
from ..staff import WRITE_HEADER, refuse

MODULE = "live"
ROLES = ("teacher", "admin")
TRACK = "mic"
VOICE = "voice"                      # the track of an adult given the floor (P30b, C6.4)
FLOOR_S = 90                         # the floor lasts at most 90 seconds
BODY_MAX = 16 * 1024                 # bytes: an SDP is a few kilobytes; nothing else is sent
TICKET_S = 60
SEEN_S = 30                          # a learner seen in the last 30 seconds is in the room
GRACE_S = 120                        # the sound stays on two minutes after the room falls below two
MIN_LISTENERS = 2                    # C6.A7: no one-to-one, ever
IDLE_MIN = 10                        # a class whose teacher has not polled for 10 minutes is over
LATE_MIN = 1                         # the server ends a class a minute after its max_minutes
MB_PER_LISTENER_MIN = 0.24           # Opus at 32 kbps: about 0.24 MB a listener a minute
ID_CHARS = string.ascii_lowercase + string.digits
REASONS = (1, 2, 3)                  # I don't understand; please say it again; I have a question


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(t: datetime) -> str:
    return t.isoformat(timespec="seconds")


def when(s: str) -> datetime:
    return datetime.fromisoformat(s)


def minutes_between(a: str | None, b: str | None) -> int:
    if not a or not b:
        return 0
    return max(0, round((when(b) - when(a)).total_seconds() / 60))


def settings_of(hub, f: dict) -> dict:
    return flags.module_settings(hub.modules[MODULE], (f.get(MODULE) or {}).get("settings"))


async def end_session(hub, s: dict) -> bool:
    """Ends a class: its room's minutes added, its peak kept, the room deleted, the state blanked."""
    here = await hub.store.live_here(s["id"])
    await hub.store.live_update(s["id"], peak=len(here))
    return await hub.store.live_end(s["id"], add_min=sum(minutes_between(r["joined_at"], r["seen_at"]) for r in here))


def stale(s: dict, max_minutes: int) -> bool:
    t = now()
    return (t - when(s["seen_at"]) > timedelta(minutes=IDLE_MIN)
            or t - when(s["started_at"]) > timedelta(minutes=max_minutes + LATE_MIN))


async def current(hub, cohort_id: str, settings: dict) -> dict | None:
    """The class's open session, ending it first if its teacher has gone quiet or its time is over."""
    s = await hub.store.live_open(cohort_id)
    if s and stale(s, settings["max_minutes"]):
        await end_session(hub, s)
        return None
    return s


async def current_for_hello(hub, cohort: dict, f: dict) -> dict | None:
    s = await current(hub, cohort["id"], settings_of(hub, f))
    return {"id": s["id"], "subject": s["subject"], "since": s["started_at"]} if s else None


async def month_use(hub, cohort_id: str | None = None) -> dict:
    """This calendar month's classes (UTC): how many, the most listeners at once, minutes listened, and the GB
    estimate of every class on this server against the cap."""
    t = now()
    start = iso(t.replace(day=1, hour=0, minute=0, second=0, microsecond=0))
    rows = await hub.store.live_sessions_since(start)
    mine = [r for r in rows if cohort_id is None or r["cohort"] == cohort_id]
    gb = sum(r["listener_min"] for r in rows) * MB_PER_LISTENER_MIN / 1000
    return {"classes": len(mine), "peak": max((r["peak"] for r in mine), default=0),
            "minutes": sum(r["listener_min"] for r in mine), "gb": round(gb, 2), "cap": hub.cfg.rtc_gb_month}


async def body_of(request: Request) -> dict:
    """The request's JSON object, reading at most BODY_MAX bytes: a longer body is refused (413) unread."""
    n = request.headers.get("content-length")
    if n and (not n.isdigit() or int(n) > BODY_MAX):
        raise HTTPException(413, "too long")
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > BODY_MAX:
            raise HTTPException(413, "too long")
        chunks.append(chunk)
    raw = b"".join(chunks)
    if not raw:
        return {}
    try:
        body = json.loads(raw)
    except ValueError:
        raise HTTPException(422, "not JSON") from None
    if not isinstance(body, dict):
        raise HTTPException(422, "a JSON object")
    return body


def sdp_text(v, name="sdp") -> str:
    if not isinstance(v, str) or not v.startswith("v=0") or len(v) > BODY_MAX:
        raise HTTPException(422, f"{name} is a session description")
    return v


def alias_of(x: dict) -> str:
    return f"{x['picture']}-{x['number']}"


def floor_now(st: dict, t: datetime | None = None) -> dict | None:
    """The floor while it lasts (at most 90 seconds from when it was given), else None."""
    f = st.get("floor")
    return f if f and when(f["until"]) > (t or now()) else None


def fall(st: dict) -> bool:
    """Ends the floor in a state; True when there was one. A voice that was published bumps `pub`, so the phones pull
    again without it (her own phone stops its microphone when the state no longer names her)."""
    f = st.get("floor")
    if not f:
        return False
    st["floor"] = None
    if f.get("published"):
        st["rtc"] = dict(st.get("rtc") or {}, pub=int((st.get("rtc") or {}).get("pub") or 0) + 1)
    return True


def floor_lock(cohort: dict | None, settings: dict) -> str | None:
    """Why this class cannot give the floor (C6.4, in code), or None: only a class whose every band is `ad`, and only
    with its `floor` setting on. Her consent version is checked for her, at the floor and at speak."""
    if not settings.get("floor"):
        return "the floor is off for this class (the admin's live setting)"
    bands = (cohort or {}).get("bands") or []
    if not bands or any(b != "ad" for b in bands):
        return "the floor is only for a class whose every band is adults"
    return None


def public_floor(f: dict | None) -> dict | None:
    return {"until": f["until"], "on": bool(f.get("published"))} if f else None


def public(s: dict) -> dict:
    """What a learner's phone may see of the class: the audio switch, the board, the floor (its end and whether it
    is sounding, never whose), the publish count."""
    st = s.get("state") or {}
    return {"v": s["v"], "audio": st.get("audio", "off"), "board": st.get("board"),
            "floor": public_floor(floor_now(st)), "pub": (st.get("rtc") or {}).get("pub", 0),
            "over": bool(s.get("ended_at"))}


def router(hub, needs) -> APIRouter:
    from ..server import Limit               # server.py imports this module first

    r = APIRouter()
    live_limit, join_limit, state_limit, hand_limit = Limit(30, 60), Limit(10, 60), Limit(20, 60), Limit(30, 60)
    roster_limit = Limit(60, 60)

    async def her(request: Request) -> dict:
        who = await hub.learner(request)
        if not who["consent_kind"]:
            raise HTTPException(403, "no consent: a live class needs it")
        return who

    async def her_settings(who: dict) -> dict:
        _, f, _ = await hub.cohort_modules(hub.her_cohort(who))
        return settings_of(hub, f)

    async def her_session(sid: str, who: dict, *, open_only=True) -> dict:
        """Her class's session `sid`: 404 when it is another class's (or none), 410 once it is over."""
        s = await hub.store.live_session(sid)
        if not s or s["cohort"] != hub.her_cohort(who):
            raise HTTPException(404, "Not Found")
        if open_only and s["ended_at"]:
            raise HTTPException(410, "the class is over")
        if open_only and stale(s, (await her_settings(who))["max_minutes"]):
            await end_session(hub, s)
            raise HTTPException(410, "the class is over")
        return s

    # --- the learner ---

    @r.get("/api/m/live", dependencies=needs(MODULE))
    async def live_now(request: Request):
        live_limit.check(hub.who(request))
        who = await her(request)
        s = await current(hub, hub.her_cohort(who), await her_settings(who))
        if not s:
            return {}
        here = [x for x in await hub.store.live_here(s["id"]) if now() - when(x["seen_at"]) <= timedelta(seconds=SEEN_S)]
        return {"id": s["id"], "subject": s["subject"], "since": s["started_at"], "here": len(here)}

    @r.post("/api/m/live/{sid}/join", dependencies=needs(MODULE))
    async def join(sid: str, request: Request):
        await body_of(request)
        join_limit.check(hub.who(request))
        who = await her(request)
        s = await her_session(sid, who)
        ticket = secrets.token_hex(16)
        await hub.store.live_join(sid, who["token_hash"], ticket)
        try:
            ice = await hub.rtc.ice()
        except RtcError:
            raise HTTPException(503, "the live class cannot be reached now") from None
        return {"ticket": ticket, "ice": ice, "state": public(s), "v": s["v"]}

    @r.post("/api/m/live/{sid}/sdp", dependencies=needs(MODULE))
    async def her_sdp(sid: str, request: Request):
        body = await body_of(request)
        who = await her(request)
        s = await her_session(sid, who)
        ticket = body.get("ticket")
        if not isinstance(ticket, str) or len(ticket) != 32 or not await hub.store.live_ticket(
                sid, who["token_hash"], ticket, iso(now() - timedelta(seconds=TICKET_S))):
            raise HTTPException(403, "join again")
        offer = sdp_text(body["sdp"]) if body.get("sdp") is not None else None
        if offer and not no_video(offer):
            raise HTTPException(422, "sound only")
        st = s["state"] or {}
        teacher = (st.get("rtc") or {}).get("sfu")
        f = floor_now(st)
        voice = f["sfu"] if f and f.get("published") and f["alias"] != alias_of(who) else None   # never her own
        try:
            sfu, answer = await hub.rtc.new_session(offer)
            pulled, again = (None, False)
            mic = st.get("audio") == "on" and teacher and (st.get("rtc") or {}).get("published")
            if st.get("audio") == "on" and voice:
                tracks = ([(teacher, TRACK)] if mic else []) + [(voice, VOICE)]
                pulled, again = await hub.rtc.pull_many(sfu, tracks)
            elif mic:
                pulled, again = await hub.rtc.pull(sfu, teacher, TRACK)
        except RtcError:
            raise HTTPException(503, "the live class cannot be reached now") from None
        await hub.store.live_set_sfu(sid, who["token_hash"], sfu)
        if pulled and again:
            return {"sdp": pulled, "type": "offer", "renegotiate": True, "answer": answer, "audio": st.get("audio")}
        return {"sdp": answer, "type": "answer" if answer else None, "renegotiate": False, "audio": st.get("audio")}

    @r.post("/api/m/live/{sid}/answer", dependencies=needs(MODULE))
    async def her_answer(sid: str, request: Request):
        body = await body_of(request)
        who = await her(request)
        await her_session(sid, who)
        row = await hub.store.live_present(sid, who["token_hash"])
        if not row or not row["sfu"]:
            raise HTTPException(409, "join again")
        try:
            await hub.rtc.renegotiate(row["sfu"], sdp_text(body.get("sdp")))
        except RtcError:
            raise HTTPException(503, "the live class cannot be reached now") from None
        return {"ok": True}

    @r.get("/api/m/live/{sid}/state", dependencies=needs(MODULE))
    async def state(sid: str, request: Request, v: int | None = None):
        state_limit.check(hub.who(request))
        who = await her(request)
        s = await her_session(sid, who, open_only=False)
        if not s["ended_at"] and stale(s, (await her_settings(who))["max_minutes"]):
            await end_session(hub, s)
            s = await hub.store.live_session(sid)
        if s["ended_at"]:
            return {"v": s["v"], "audio": "off", "board": None, "floor": None, "pub": 0, "over": True}
        st = dict(s["state"] or {})
        if st.get("floor") and not floor_now(st):          # 90 seconds are over: the floor falls for everyone
            fall(st)
            await hub.store.live_update(sid, state=st, bump=True)
            s = await hub.store.live_session(sid)
        await hub.store.live_seen(sid, who["token_hash"])
        if v is not None and v == s["v"]:
            return Response(status_code=204)
        row = await hub.store.live_present(sid, who["token_hash"])
        f = floor_now(s["state"] or {})
        return dict(public(s), hand=row["reason"] if row and row["hand_at"] else None, joined=bool(row),
                    floor_mine=bool(f and f["alias"] == alias_of(who)))

    @r.post("/api/m/live/{sid}/hand", dependencies=needs(MODULE))
    async def hand(sid: str, request: Request):
        body = await body_of(request)
        hand_limit.check(hub.who(request))
        who = await her(request)
        await her_session(sid, who)
        reason = body.get("reason")
        if reason is not None and (type(reason) is not int or reason not in REASONS):
            raise HTTPException(422, "a reason is 1, 2 or 3, or null to lower the hand")
        if not await hub.store.live_hand(sid, who["token_hash"], reason):
            raise HTTPException(409, "join again")
        return {"hand": reason is not None}

    @r.post("/api/m/live/{sid}/leave", dependencies=needs(MODULE))
    async def leave(sid: str, request: Request):
        await body_of(request)
        who = await her(request)
        s = await her_session(sid, who, open_only=False)
        row = await hub.store.live_leave(sid, who["token_hash"])
        if row and not s["ended_at"]:
            await hub.store.live_update(sid, add_min=minutes_between(row["joined_at"], row["seen_at"]))
            st = dict((await hub.store.live_session(sid))["state"] or {})
            if (st.get("floor") or {}).get("alias") == alias_of(who) and fall(st):     # she left with the floor
                await hub.store.live_update(sid, state=st, bump=True)
        return {"ok": True}

    @r.post("/api/m/live/{sid}/speak", dependencies=needs(MODULE))
    async def speak(sid: str, request: Request):
        body = await body_of(request)
        who = await her(request)
        if who.get("band") != "ad":                        # C6.A3: no child's microphone, ever
            raise HTTPException(403, "only an adult in an adult-only class may speak")
        s = await her_session(sid, who)
        st = dict(s["state"] or {})
        f = floor_now(st)
        if not f or f["alias"] != alias_of(who):
            raise HTTPException(403, "you do not have the floor")
        if body.get("done") is True:
            fall(st)
            v = await hub.store.live_update(sid, state=st, bump=True)
            return {"floor": None, "v": v}
        c, fl, _ = await hub.cohort_modules(hub.her_cohort(who))
        why = floor_lock(c, settings_of(hub, fl))
        if not why and not hub.consent_names_live(who.get("consent_version")):
            why = "her consent text does not name live classes"
        if why:
            raise refuse(409, "locked", why)
        ticket = body.get("ticket")
        if not isinstance(ticket, str) or len(ticket) != 32 or not await hub.store.live_ticket(
                sid, who["token_hash"], ticket, iso(now() - timedelta(seconds=TICKET_S))):
            raise HTTPException(403, "join again")
        offer = sdp_text(body.get("sdp"))
        mid = body.get("mid")
        if not isinstance(mid, str) or not 1 <= len(mid) <= 8:
            raise HTTPException(422, "mid is the transceiver's mid")
        if not no_video(offer):
            raise HTTPException(422, "sound only")
        try:
            sfu, _ = await hub.rtc.new_session(None)
            answer = await hub.rtc.publish(sfu, offer, mid, VOICE)
        except RtcError:
            raise HTTPException(503, "the live class cannot be reached now") from None
        st["floor"] = dict(f, sfu=sfu, published=True)
        st["rtc"] = dict(st.get("rtc") or {}, pub=int((st.get("rtc") or {}).get("pub") or 0) + 1)
        v = await hub.store.live_update(sid, state=st, bump=True)
        return {"sdp": answer, "until": f["until"], "v": v}

    # --- the teacher ---

    async def staff(request: Request) -> dict:
        me = await hub.staff.who(request)
        if request.method not in ("GET", "HEAD") and request.headers.get(WRITE_HEADER) != "1":
            raise HTTPException(403, "a staff change needs the X-Qalam header")   # on the hub too (C5 M1)
        if me["via"] == "pin":
            me["cohorts"] = [hub.cohort_id] if hub.cohort_id else []
        elif me["role"] not in ROLES:
            raise HTTPException(403, "Ask the admin to add you")
        return me

    async def her_class(me: dict, cid: str | None) -> tuple[dict, dict, set]:
        if not cid or cid not in me["cohorts"]:
            raise refuse(403, "not_your_class", "not your class")
        c, f, on = await hub.cohort_modules(cid)
        if not c:
            raise refuse(404, "no_cohort", "no such cohort")
        return c, settings_of(hub, f) if MODULE in hub.modules else {}, set(on)

    async def her_live(request: Request, sid: str) -> tuple[dict, dict, dict]:
        """(the staff member, the session, the module's settings) for a session of one of her classes."""
        me = await staff(request)
        s = await hub.store.live_session(sid)
        if not s:
            raise HTTPException(404, "no such class")
        _, settings, on = await her_class(me, s["cohort"])
        if MODULE not in on:
            raise HTTPException(404, "Not Found")
        return me, s, settings

    async def today_count(cid: str) -> int:
        day = iso(now().replace(hour=0, minute=0, second=0, microsecond=0))
        return len(await hub.store.live_sessions_since(day, cid))

    @r.get("/api/m/teacher/live")
    async def teacher_live(request: Request, cohort: str | None = None):
        me = await staff(request)
        c, settings, on = await her_class(me, cohort or (me["cohorts"] or [None])[0])
        if MODULE not in on:
            return {"on": False}
        s = await current(hub, c["id"], settings)
        return {"on": True, "open": {"id": s["id"], "subject": s["subject"], "since": s["started_at"]} if s else None,
                "floor": floor_lock(c, settings) is None,
                "today": await today_count(c["id"]), "per_day": settings["per_day"],
                "max_minutes": settings["max_minutes"], "subjects": list(timetable.LIVE_SUBJECTS),
                "month": await month_use(hub, c["id"])}

    @r.post("/api/m/teacher/live/start")
    async def start(request: Request):
        body = await body_of(request)
        me = await staff(request)
        c, settings, on = await her_class(me, body.get("cohort"))
        if MODULE not in on:
            raise HTTPException(404, "Not Found")
        subject = body.get("subject")
        if subject not in timetable.LIVE_SUBJECTS:
            raise HTTPException(422, f"subject is one of {', '.join(timetable.LIVE_SUBJECTS)}")
        if await current(hub, c["id"], settings):
            raise refuse(409, "live_open", "a live class is already open for this class")
        if await today_count(c["id"]) >= settings["per_day"]:
            raise refuse(429, "budget", f"this class has had its {settings['per_day']} live classes today")
        use = await month_use(hub)
        if use["gb"] >= use["cap"]:
            raise refuse(409, "cap", f"this month's live classes have used {use['gb']} GB of {use['cap']}")
        try:
            ice = await hub.rtc.ice()
        except RtcError:
            raise HTTPException(503, "the relay cannot be reached now") from None
        sid = "".join(secrets.choice(ID_CHARS) for _ in range(16))
        host = f"{me.get('role') or 'teacher'}:{me['label']}"[:60]
        state0 = {"audio": "off", "board": None, "floor": None, "rtc": {"sfu": None, "published": False, "pub": 0},
                  "low_since": None}
        if not await hub.store.live_start(id=sid, cohort=c["id"], subject=subject, host=host, state=state0):
            raise refuse(409, "live_open", "a live class is already open for this class")
        return {"id": sid, "ice": ice, "max_minutes": settings["max_minutes"]}

    @r.post("/api/m/teacher/live/{sid}/sdp")
    async def teacher_sdp(sid: str, request: Request):
        body = await body_of(request)
        _, s, _ = await her_live(request, sid)
        if s["ended_at"]:
            raise HTTPException(410, "the class is over")
        offer = sdp_text(body.get("sdp"))
        mid = body.get("mid")
        if not isinstance(mid, str) or not 1 <= len(mid) <= 8:
            raise HTTPException(422, "mid is the transceiver's mid")
        if not no_video(offer):
            raise HTTPException(422, "sound only")
        try:
            sfu, _ = await hub.rtc.new_session(None)
            answer = await hub.rtc.publish(sfu, offer, mid, TRACK)
        except RtcError:
            raise HTTPException(503, "the relay cannot be reached now") from None
        st = dict(s["state"] or {})
        pub = int((st.get("rtc") or {}).get("pub") or 0) + 1
        st["rtc"] = {"sfu": sfu, "published": True, "pub": pub}
        await hub.store.live_update(sid, state=st, bump=True, seen=True)
        return {"sdp": answer}

    @r.get("/api/m/teacher/live/{sid}/roster")
    async def roster(sid: str, request: Request):
        roster_limit.check(hub.who(request))
        _, s, settings = await her_live(request, sid)
        if not s["ended_at"] and stale(s, settings["max_minutes"]):
            await end_session(hub, s)
            s = await hub.store.live_session(sid)
        if s["ended_at"]:
            return {"v": s["v"], "over": True, "subject": s["subject"], "peak": s["peak"],
                    "minutes": minutes_between(s["started_at"], s["ended_at"])}
        t = now()
        room = await hub.store.live_here(sid)
        here = [x for x in room if t - when(x["seen_at"]) <= timedelta(seconds=SEEN_S)]
        st = dict(s["state"] or {})
        audio, low = st.get("audio", "off"), st.get("low_since")
        published = bool((st.get("rtc") or {}).get("published"))
        if published and len(here) >= MIN_LISTENERS:
            audio, low = "on", None
        elif audio == "on":
            if not published:
                audio, low = "off", None
            elif low is None:
                low = iso(t)
            elif t - when(low) >= timedelta(seconds=GRACE_S):
                audio, low = "off", None
        else:
            low = None
        changed = audio != st.get("audio", "off")
        f = st.get("floor")
        if f and (not floor_now(st, t) or audio != "on" or not any(alias_of(x) == f["alias"] for x in here)):
            changed = fall(st) or changed           # over 90 seconds, the sound off, or she is gone: it falls
        if changed or low != st.get("low_since"):
            st.update(audio=audio, low_since=low)
            v = await hub.store.live_update(sid, state=st, bump=changed, seen=True, peak=len(here))
        else:
            v = await hub.store.live_update(sid, seen=True, peak=len(here))
        hands = [{"alias": f"{x['picture']}-{x['number']}", "picture": x["picture"], "number": x["number"],
                  "reason": x["reason"], "since": x["hand_at"]} for x in room if x["hand_at"]]
        f = floor_now(st, t)
        return {"v": v, "here": len(here), "hands": hands, "audio": audio, "board": st.get("board"),
                "floor": {"alias": f["alias"], "until": f["until"], "on": bool(f.get("published"))} if f else None,
                "minutes": minutes_between(s["started_at"], iso(t)),
                "max_minutes": settings["max_minutes"], "over": False}

    @r.post("/api/m/teacher/live/{sid}/board")
    async def board(sid: str, request: Request):
        body = await body_of(request)
        _, s, _ = await her_live(request, sid)
        if s["ended_at"]:
            raise HTTPException(410, "the class is over")
        st = dict(s["state"] or {})
        if body:
            lesson, step = body.get("lesson"), body.get("step")
            l = hub.library.lessons.get(lesson) if isinstance(lesson, str) else None
            if not l or type(step) is not int or not 0 <= step < len(l.get("steps") or []):
                raise HTTPException(422, "a lesson this hub serves and one of its steps")
            st["board"] = {"lesson": lesson, "step": step}
        else:
            st["board"] = None
        v = await hub.store.live_update(sid, state=st, bump=True)
        return {"v": v, "board": st["board"]}

    @r.post("/api/m/teacher/live/{sid}/lower")
    async def lower(sid: str, request: Request):
        body = await body_of(request)
        _, s, _ = await her_live(request, sid)
        if body.get("all") is True:
            n = await hub.store.live_lower_all(sid)
            await hub.store.live_update(sid, bump=True)          # the phones hear it at their next poll
            return {"lowered": n}
        alias = body.get("alias")
        for x in await hub.store.live_here(sid):
            if isinstance(alias, str) and f"{x['picture']}-{x['number']}" == alias:
                await hub.store.live_hand(sid, x["token_hash"], None)
                await hub.store.live_update(sid, bump=True)
                return {"lowered": 1}
        raise HTTPException(404, "no such hand")

    @r.post("/api/m/teacher/live/{sid}/floor")
    async def floor(sid: str, request: Request):
        body = await body_of(request)
        _, s, settings = await her_live(request, sid)
        if s["ended_at"]:
            raise HTTPException(410, "the class is over")
        st = dict(s["state"] or {})
        alias = body.get("alias")
        if alias is None:                                   # {}: "Take back the floor"
            v = await hub.store.live_update(sid, state=st, bump=True) if fall(st) else s["v"]
            return {"floor": None, "v": v}
        if not isinstance(alias, str) or not 1 <= len(alias) <= 40:
            raise HTTPException(422, "alias is a learner's picture and number")
        c, _, _ = await hub.cohort_modules(s["cohort"])
        if why := floor_lock(c, settings):
            raise refuse(409, "locked", why)
        t = now()
        if floor_now(st, t):
            raise refuse(409, "floor_held", "someone has the floor: take it back first")
        if st.get("audio") != "on":
            raise refuse(409, "floor_few", "the floor waits until two learners or more are listening")
        x = next((x for x in await hub.store.live_here(sid)
                  if alias_of(x) == alias and t - when(x["seen_at"]) <= timedelta(seconds=SEEN_S)), None)
        if not x:
            raise HTTPException(404, "no such learner in the room")
        if x["band"] != "ad":
            raise refuse(409, "locked", "only an adult may have the floor")
        her_row = await hub.store.learner(x["token_hash"])
        if not her_row or not hub.consent_names_live(her_row.get("consent_version")):
            raise refuse(409, "locked", "her consent text does not name live classes")
        st["floor"] = {"alias": alias, "until": iso(t + timedelta(seconds=FLOOR_S)), "sfu": None, "published": False}
        v = await hub.store.live_update(sid, state=st, bump=True)
        return {"floor": {"alias": alias, "until": st["floor"]["until"], "on": False}, "v": v}

    @r.post("/api/m/teacher/live/{sid}/listen")
    async def listen(sid: str, request: Request):
        body = await body_of(request)
        _, s, _ = await her_live(request, sid)
        if s["ended_at"]:
            raise HTTPException(410, "the class is over")
        st = dict(s["state"] or {})
        f = floor_now(st)
        if not f or not f.get("published"):
            raise HTTPException(409, "no one is speaking")
        offer = sdp_text(body["sdp"]) if body.get("sdp") is not None else None
        if offer and not no_video(offer):
            raise HTTPException(422, "sound only")
        try:
            ear, answer = await hub.rtc.new_session(offer)
            pulled, again = await hub.rtc.pull(ear, f["sfu"], VOICE)
        except RtcError:
            raise HTTPException(503, "the relay cannot be reached now") from None
        st["rtc"] = dict(st.get("rtc") or {}, ear=ear)
        await hub.store.live_update(sid, state=st)
        if pulled and again:
            return {"sdp": pulled, "type": "offer", "renegotiate": True, "answer": answer}
        return {"sdp": answer, "type": "answer" if answer else None, "renegotiate": False}

    @r.post("/api/m/teacher/live/{sid}/answer")
    async def teacher_answer(sid: str, request: Request):
        body = await body_of(request)
        _, s, _ = await her_live(request, sid)
        ear = ((s["state"] or {}).get("rtc") or {}).get("ear")
        if s["ended_at"] or not ear:
            raise HTTPException(409, "listen again")
        try:
            await hub.rtc.renegotiate(ear, sdp_text(body.get("sdp")))
        except RtcError:
            raise HTTPException(503, "the relay cannot be reached now") from None
        return {"ok": True}

    @r.post("/api/m/teacher/live/{sid}/end")
    async def end(sid: str, request: Request):
        await body_of(request)
        _, s, _ = await her_live(request, sid)
        if not s["ended_at"]:
            await end_session(hub, s)
            s = await hub.store.live_session(sid)
        return {"over": True, "subject": s["subject"], "peak": s["peak"],
                "minutes": minutes_between(s["started_at"], s["ended_at"])}

    return r


def month_line(use: dict) -> dict:
    """The admin's month line (C6.1): classes, hours listened and the GB estimate against the cap."""
    return {"classes": use["classes"], "peak": use["peak"], "hours": round(use["minutes"] / 60, 1),
            "gb": use["gb"], "cap": use["cap"], "full": use["gb"] >= use["cap"],
            "pct": 100 if not use["cap"] else min(999, math.floor(100 * use["gb"] / use["cap"]))}
