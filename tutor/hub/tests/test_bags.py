"""The school bag's relay (W6, WEBSITE.md 3.6 and 3.7): the store's half on SQLite and on the D1 fake (the same
contract), and the routes on a hub of each kind. A relay keeps only HMAC(pepper, F_r), SHA-256(W_r), the sealed blob,
the seat that wrote it, an etag and dates; it opens nothing. The attack cases: a wrong W_r (403), a bag too big
(413), a stale write (412, also when two phones write at once), a stopped bag (410), a write without the consent
that names the bag (403), and the limits. Retention and deletion with her are in test_privacy.py too."""
import asyncio
import base64
import hashlib
import hmac
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from fakes.d1 import FakeD1, ffi as fake_ffi
from tutor_hub import learners
from tutor_hub.config import Config
from tutor_hub.server import DEV_PEPPER, create_app
from tutor_hub.stores import D1Store, SqliteStore
from tutor_hub.stores.base import BAG_MAX
from tutor_hub.stores.sqlite import MIGRATIONS

BAG_CONSENT = {"hub": "hub-2026-10c", "online": "online-2026-10c"}
OLD_CONSENT = {"hub": "hub-2026-10b", "online": "online-2026-10b"}


def hx(n=32):
    return secrets.token_hex(n)


def sealed(kb=1, fill=None):
    """Bytes shaped as bag.js seals them: a 24-byte nonce, whole KB of plaintext, a 16-byte tag."""
    n = 24 + kb * 1024 + 16
    return fill * n if fill is not None else os.urandom(n)


def b64(raw):
    return base64.b64encode(raw).decode()


# the store's contract, on both stores

@pytest.fixture(params=["sqlite", "d1"])
async def store(request, tmp_path):
    s = SqliteStore(tmp_path / "hub.db") if request.param == "sqlite" else \
        D1Store(FakeD1(tmp_path / "d1.db"), ffi=fake_ffi, migrations=MIGRATIONS)
    s.path_for_test = tmp_path / ("hub.db" if request.param == "sqlite" else "d1.db")
    await s.open()
    await s.add_cohort(id="d6co6etep6", label="Class", langs=["prs"], bands=["s1"], settings={})
    yield s
    await s.close()
    if isinstance(s, D1Store):
        s.db.sqlite.close()


def put(store, bid, w, th, want, etag=None, blob="AAAA"):
    return store.put_bag(id=bid, w=w, token_hash=th, etag=etag or hx(8), size=3, blob=blob, want=want)


@pytest.mark.anyio
async def test_a_bag_is_written_only_when_its_etag_and_w_hold(store):
    bid, w, th = hx(), hx(), "a" * 64
    assert await store.bag(bid) is None
    assert await put(store, bid, w, th, "new", etag="0" * 16)
    row = await store.bag(bid)
    assert row["etag"] == "0" * 16 and row["w"] == w and row["token_hash"] == th and row["gone"] is None
    assert row["day"] == datetime.now(timezone.utc).strftime("%Y-%m-%d")
    assert not await put(store, bid, w, th, "new")                    # there is one: pull, merge, write again
    assert not await put(store, bid, w, th, "f" * 16)                 # a stale etag
    assert not await put(store, bid, hx(), th, "0" * 16)              # another code's W_r
    assert (await store.bag(bid))["etag"] == "0" * 16
    assert await put(store, bid, w, "b" * 64, "0" * 16, etag="1" * 16, blob="BBBB")   # her other seat writes it
    row = await store.bag(bid)
    assert (row["etag"], row["blob"], row["token_hash"]) == ("1" * 16, "BBBB", "b" * 64)
    other = hx()                                                      # a relay that lost it takes it back
    assert await put(store, other, w, th, "9" * 16)


@pytest.mark.anyio
async def test_two_phones_writing_at_once_cannot_both_win(store):
    bid, w, th = hx(), hx(), "a" * 64
    await put(store, bid, w, th, "new", etag="0" * 16)
    won = await asyncio.gather(*(put(store, bid, w, th, "0" * 16, etag=f"{i:016x}") for i in range(1, 7)))
    assert sum(won) == 1
    assert (await store.bag(bid))["etag"] == f"{won.index(True) + 1:016x}"


@pytest.mark.anyio
async def test_one_bag_per_seat_and_a_stopped_bag_is_a_tombstone(store):
    w, th = hx(), "a" * 64
    first, second, sister = hx(), hx(), hx()
    await put(store, first, w, th, "new")
    await put(store, sister, hx(), "c" * 64, "new")                   # another learner's bag stays
    assert await put(store, second, w, th, "new")                     # her new code: the old bag stops
    old = await store.bag(first)
    assert old["gone"] and old["blob"] is None and old["token_hash"] is None and old["size"] == 0
    assert (await store.bag(sister))["gone"] is None and (await store.bag(second))["gone"] is None
    assert not await put(store, first, w, th, old["etag"])            # a tombstone takes no write
    assert await store.delete_bag(second, hx()) == "wrong"
    assert await store.delete_bag(second, w) == "done"
    assert await store.delete_bag(second, w) == "done"                # and again: done already
    assert await store.delete_bag(hx(), w) == "none"
    assert (await store.bag(second))["blob"] is None


@pytest.mark.anyio
async def test_her_bags_stop_when_she_is_deleted_or_idle_for_a_year(store):
    for th in ("a" * 64, "b" * 64):
        await store.add_learner(token_hash=th, cohort="d6co6etep6", picture="key", band="s1")
    mine, idle = hx(), hx()
    await put(store, mine, hx(), "a" * 64, "new")
    await put(store, idle, hx(), "b" * 64, "new")
    assert await store.delete_learner("a" * 64)
    assert (await store.bag(mine))["gone"] and (await store.bag(mine))["token_hash"] is None
    db = sqlite3.connect(store.path_for_test)
    db.execute("UPDATE learners SET last_seen='2020-01-01' WHERE token_hash=?", ("b" * 64,))
    db.commit()
    await store.prune_learners(learners.IDLE_DAYS)
    assert (await store.bag(idle))["gone"]


@pytest.mark.anyio
async def test_bags_unwritten_for_a_year_and_tombstones_after_30_days_go(store):
    now = datetime.now(timezone.utc)
    day = lambda d: (now - timedelta(days=d)).strftime("%Y-%m-%d")     # noqa: E731
    ids = {k: hx() for k in ("old", "recent", "old_gone", "recent_gone")}
    for k, bid in ids.items():
        await put(store, bid, hx(), hx(), "new")
    db = sqlite3.connect(store.path_for_test)
    db.execute("UPDATE bags SET day=? WHERE id=?", (day(366), ids["old"]))
    db.execute("UPDATE bags SET day=? WHERE id=?", (day(364), ids["recent"]))
    db.execute("UPDATE bags SET blob=NULL, token_hash=NULL, gone=? WHERE id=?", (day(31), ids["old_gone"]))
    db.execute("UPDATE bags SET blob=NULL, token_hash=NULL, gone=? WHERE id=?", (day(29), ids["recent_gone"]))
    db.commit()
    await store.prune_learners(learners.IDLE_DAYS)        # the relay's retention runs with the learners'
    left = {r[0] for r in db.execute("SELECT id FROM bags")}
    assert left == {ids["recent"], ids["recent_gone"]}


# the routes, on a hub (SQLite) and on the Worker's store (the D1 fake)

@pytest.fixture(params=["hub", "online"])
def relay(request, tmp_path):
    if request.param == "hub":
        cfg = Config.from_env(data=tmp_path / "data", print_backend="outbox", llm_url=None, openai_key=None,
                              anthropic_key=None, gemini_key=None, compat_key=None, bag_pepper=None)
        app = create_app(cfg)
    else:
        cfg = Config.from_env(data=tmp_path / "data", home="online", lacks=("printer", "pin"), llm_url=None,
                              openai_key=None, anthropic_key=None, gemini_key=None, compat_key=None, bag_pepper=None)
        db = FakeD1(tmp_path / "d1.db")
        app = create_app(cfg, store=D1Store(db, ffi=fake_ffi, migrations=MIGRATIONS))
    with TestClient(app) as c:
        c.hub = app.state.hub
        c.home = request.param
        c.db_path = tmp_path / ("data/hub.db" if request.param == "hub" else "d1.db")
        yield c


def learner(c, version="bag"):
    body = {"band": "s1", "lang": "en", "picture": "key"}
    if version:
        body["consent"] = {"kind": "self", "version": (BAG_CONSENT if version == "bag" else OLD_CONSENT)[c.home]}
    j = c.post("/api/join", json=body).json()
    return {"X-Learner-Token": j["token"]}


def keys():
    return {"f": hx(), "w": hx()}


def test_a_bag_travels_through_the_relay_and_comes_back_as_it_went(relay):
    c, me, k = relay, learner(relay), keys()
    assert c.get("/api/hello").json()["bag"] == {"max": BAG_MAX}
    none = c.post("/api/bag/get", json={"f": k["f"]})                         # not here yet
    assert none.status_code == 404 and none.headers["cache-control"] == "no-store"   # refusals are never cached either
    assert c.post("/api/bag/put", json={**k, "if": "new", "blob": "x"}).headers["cache-control"] == "no-store"   # 401
    blob = b64(sealed(3))
    r = c.post("/api/bag/put", json={**k, "if": "new", "blob": blob}, headers=me)
    assert r.status_code == 200 and re.fullmatch(r"[0-9a-f]{16}", r.json()["etag"])
    etag = r.json()["etag"]
    got = c.post("/api/bag/get", json={"f": k["f"]})                           # no token: a new phone recovers her
    assert got.status_code == 200 and got.json() == {"etag": etag, "blob": blob}
    assert got.headers["cache-control"] == "no-store"
    assert c.post("/api/bag/get", json={"f": k["f"], "etag": etag}).status_code == 304
    c.hub.bag_spacing._seen.clear()                                            # ten seconds later
    r2 = c.post("/api/bag/put", json={**k, "if": etag, "blob": b64(sealed(2))}, headers=me)
    assert r2.status_code == 200 and r2.json()["etag"] != etag
    # nothing the phone sent is kept as it came: the id is peppered, W_r hashed
    row = c.portal.call(c.hub.store.bag, c.hub.bag_id(k["f"]))
    assert row["id"] == hmac.new(c.hub.pepper.encode(), bytes.fromhex(k["f"]), hashlib.sha256).hexdigest() != k["f"]
    assert row["w"] == hashlib.sha256(bytes.fromhex(k["w"])).hexdigest() != k["w"]
    assert row["size"] == len(sealed(2))


def test_a_stale_write_is_412_and_the_phone_learns_the_etag_to_merge_from(relay):
    c, me, k = relay, learner(relay), keys()
    first = c.post("/api/bag/put", json={**k, "if": "new", "blob": b64(sealed())}, headers=me).json()["etag"]
    c.hub.bag_spacing._seen.clear()                       # ten seconds later another phone, with an old copy
    again = c.post("/api/bag/put", json={**k, "if": "new", "blob": b64(sealed())}, headers=me)
    assert again.status_code == 412 and again.json() == {"etag": first}
    stale = c.post("/api/bag/put", json={**k, "if": "0" * 16, "blob": b64(sealed())}, headers=me)
    assert stale.status_code == 412 and stale.json() == {"etag": first}
    # a refused write does not spend the bag's 10 seconds: it pulls, merges and writes again at once
    assert c.post("/api/bag/put", json={**k, "if": first, "blob": b64(sealed())}, headers=me).status_code == 200


def test_a_wrong_w_is_403_and_changes_nothing(relay):
    c, me, k = relay, learner(relay), keys()
    etag = c.post("/api/bag/put", json={**k, "if": "new", "blob": b64(sealed())}, headers=me).json()["etag"]
    thief = learner(c)                                    # anyone may join; F_r alone does not let her write
    for who in (me, thief):
        r = c.post("/api/bag/put", json={"f": k["f"], "w": hx(), "if": etag, "blob": b64(sealed())}, headers=who)
        assert r.status_code == 403
        assert c.post("/api/bag/delete", json={"f": k["f"], "w": hx()}, headers=who).status_code == 403
    assert c.post("/api/bag/get", json={"f": k["f"], "etag": etag}).status_code == 304


def test_a_bag_over_64_kb_is_413_and_what_is_not_a_bag_422(relay):
    c, me, k = relay, learner(relay), keys()
    big = sealed(64)                                      # 64 KB of plaintext and the nonce and tag: over the cap
    assert len(big) > BAG_MAX
    assert c.post("/api/bag/put", json={**k, "if": "new", "blob": b64(big)}, headers=me).status_code == 413
    huge = b"{" + b" " * (200 * 1024) + b"}"
    assert c.post("/api/bag/put", content=huge, headers={**me, "content-type": "application/json"}).status_code == 413
    most = sealed(63)                                     # the largest bag.js makes: 63 KB of plaintext, sealed
    assert len(most) <= BAG_MAX < len(most) + 1024
    assert c.post("/api/bag/put", json={**k, "if": "new", "blob": b64(most)}, headers=me).status_code == 200
    for bad in (b64(os.urandom(1000)), b64(os.urandom(1064 + 5)), "not base64!", 12):
        r = c.post("/api/bag/put", json={**keys(), "if": "new", "blob": bad}, headers=me)
        assert r.status_code == 422, bad
    for body in ({"f": "ABC", "w": k["w"], "if": "new", "blob": b64(sealed())},
                 {**keys(), "if": "maybe", "blob": b64(sealed())},
                 {**keys(), "if": "new", "blob": b64(sealed()), "code": "1234567890123456"},
                 {"f": k["f"], "if": "new", "blob": b64(sealed())}):
        assert c.post("/api/bag/put", json=body, headers=me).status_code == 422
    assert c.post("/api/bag/get", json={"f": k["f"], "code": "x"}).status_code == 422


def test_only_a_seat_whose_consent_names_the_bag_may_write_one(relay):
    c, k = relay, keys()
    body = {**k, "if": "new", "blob": b64(sealed())}
    assert c.post("/api/bag/put", json=body).status_code == 401
    assert c.post("/api/bag/put", json=body, headers={"X-Learner-Token": learners.new_token()}).status_code == 401
    assert c.post("/api/bag/put", json=body, headers=learner(c, version=None)).status_code == 403
    assert c.post("/api/bag/put", json=body, headers=learner(c, version="old")).status_code == 403
    assert c.post("/api/bag/get", json={"f": k["f"]}).status_code == 404       # nothing was kept
    assert c.post("/api/bag/put", json=body, headers=learner(c)).status_code == 200
    assert c.post("/api/bag/delete", json={"f": k["f"], "w": k["w"]}).status_code == 401


def test_a_stopped_bag_answers_410_for_30_days(relay):
    c, me, k = relay, learner(relay), keys()
    etag = c.post("/api/bag/put", json={**k, "if": "new", "blob": b64(sealed())}, headers=me).json()["etag"]
    assert c.post("/api/bag/delete", json=k, headers=me).status_code == 204
    gone = c.post("/api/bag/get", json={"f": k["f"], "etag": etag})
    assert gone.status_code == 410 and gone.json() == {"gone": datetime.now(timezone.utc).strftime("%Y-%m-%d")}
    for want in (etag, "new"):
        assert c.post("/api/bag/put", json={**k, "if": want, "blob": b64(sealed())}, headers=me).status_code == 410
    assert c.post("/api/bag/delete", json=k, headers=me).status_code == 204       # done already
    assert c.post("/api/bag/delete", json=keys(), headers=me).status_code == 204  # never here: nothing to do
    # "Make a new code": her seat writes a bag under a new id, and the old one stops for her other phones
    k2, k3 = keys(), keys()
    c.post("/api/bag/put", json={**k2, "if": "new", "blob": b64(sealed())}, headers=me)
    c.post("/api/bag/put", json={**k3, "if": "new", "blob": b64(sealed())}, headers=me)
    assert c.post("/api/bag/get", json={"f": k2["f"]}).status_code == 410
    assert c.post("/api/bag/get", json={"f": k3["f"]}).status_code == 200


def test_her_bag_stops_with_her(relay):
    c, me, k = relay, learner(relay), keys()
    c.post("/api/bag/put", json={**k, "if": "new", "blob": b64(sealed())}, headers=me)
    assert c.delete("/api/me", headers=me).json() == {"deleted": True}
    assert c.post("/api/bag/get", json={"f": k["f"]}).status_code == 410
    row = c.portal.call(c.hub.store.bag, c.hub.bag_id(k["f"]))
    assert row["blob"] is None and row["token_hash"] is None and row["size"] == 0


def test_the_limits(relay):
    c, me, k = relay, learner(relay), keys()
    etag = c.post("/api/bag/put", json={**k, "if": "new", "blob": b64(sealed())}, headers=me).json()["etag"]
    # one stored write every 10 seconds per bag; what is refused anyway (412) is said first
    assert c.post("/api/bag/put", json={**k, "if": etag, "blob": b64(sealed())}, headers=me).status_code == 429
    assert c.post("/api/bag/put", json={**k, "if": "new", "blob": b64(sealed())}, headers=me).status_code == 412
    c.hub.bag_spacing._seen.clear()                       # ten seconds later
    etag = c.post("/api/bag/put", json={**k, "if": etag, "blob": b64(sealed())}, headers=me).json()["etag"]
    # 30 writes an hour per token
    for _ in range(26):                                   # four so far, refused ones too
        assert c.post("/api/bag/put", json={**keys(), "if": "new", "blob": b64(sealed())}, headers=me).status_code == 200
    assert c.post("/api/bag/put", json={**keys(), "if": "new", "blob": b64(sealed())}, headers=me).status_code == 429
    # a pull of a bag that is not here counts as a wrong code: 20 an hour from one address
    for i in range(20):
        assert c.post("/api/bag/get", json={"f": hx()}).status_code == 404, i
    assert c.post("/api/bag/get", json={"f": hx()}).status_code == 429
    assert c.post("/api/join", json={"cohort_code": "ZZZZ-ZZZZ", "band": "s1", "lang": "en",
                                     "picture": "key"}).status_code == 429       # the same count as class codes


def test_60_pulls_an_hour_per_caller(relay):
    c, me, k = relay, learner(relay), keys()
    etag = c.post("/api/bag/put", json={**k, "if": "new", "blob": b64(sealed())}, headers=me).json()["etag"]
    for _ in range(60):
        assert c.post("/api/bag/get", json={"f": k["f"], "etag": etag}).status_code == 304
    assert c.post("/api/bag/get", json={"f": k["f"], "etag": etag}).status_code == 429


def test_the_pepper(relay, tmp_path):
    c = relay
    if c.home == "hub":                                   # made at first start beside the database, kept, private
        f = tmp_path / "data" / "bag-pepper.txt"
        assert re.fullmatch(r"[0-9a-f]{64}", c.hub.pepper) and f.read_text().strip() == c.hub.pepper
        assert f.stat().st_mode & 0o077 == 0
    else:                                                 # staging's Worker without the secret: named, no secret
        assert c.hub.pepper == DEV_PEPPER


def test_the_secret_is_the_pepper_online_and_production_will_not_start_without_it(tmp_path):
    base = dict(data=tmp_path / "data", home="online", lacks=("printer", "pin"), llm_url=None, openai_key=None,
                anthropic_key=None, gemini_key=None, compat_key=None)
    store = lambda: D1Store(FakeD1(tmp_path / "d1.db"), ffi=fake_ffi, migrations=MIGRATIONS)   # noqa: E731
    app = create_app(Config.from_env(**base, bag_pepper="p" * 64, release=True), store=store())
    with TestClient(app):
        assert app.state.hub.pepper == "p" * 64
    app = create_app(Config.from_env(**base, bag_pepper=None, release=True), store=store())
    with pytest.raises(RuntimeError, match="TUTOR_BAG_PEPPER"):
        with TestClient(app):
            pass
    assert "p" * 64 not in repr(Config.from_env(**base, bag_pepper="p" * 64))     # never in a log line
