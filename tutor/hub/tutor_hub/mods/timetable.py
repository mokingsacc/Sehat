"""The school day (P19, C2.4 and C3.1): the cohort's timetable for one band, for the phone to keep.

- `GET /api/m/timetable?cohort=&band=`: `{cohort, band, timetable: {days, holidays, ramadan, start, blocks}}`, or 404
  when the module is off for the cohort or band, or the cohort's timetable does not list the band.

No token is read and none is needed (F5): every learner in the cohort gets the same template, so the request says
nothing about who asks, and nothing about it is kept. The phone works out the day, rings the bells and picks the
lessons itself. Switching the module off for a cohort (the kill switch "school day and bells off") makes this a
404 and takes the school day off the phones at their next read of /api/hello, within a minute, without a word.
"""
from fastapi import APIRouter, HTTPException, Request

from .. import timetable

MODULE = "timetable"


def router(hub, needs) -> APIRouter:
    r = APIRouter(prefix="/api/m/timetable")

    @r.get("", dependencies=needs(MODULE))
    async def get(band: str, request: Request):
        cid = request.query_params.get("cohort") or hub.cohort_id
        cohort, _, on = await hub.cohort_modules(cid, band if band in timetable.BANDS else None)
        if not cohort or band not in timetable.BANDS or MODULE not in on:
            raise HTTPException(404, "no school day for this band")
        tt = timetable.for_band((cohort.get("settings") or {}).get("timetable"), band)
        if tt is None:
            raise HTTPException(404, "no school day for this band")
        return {"cohort": cohort["id"], "band": band, "timetable": tt}

    return r
