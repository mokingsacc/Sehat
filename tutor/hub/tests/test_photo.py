"""Photo marking (P14, C2.2): `POST /api/m/photo/mark` returns readings only, from a strip of answer cells, read
through the gateway's fake vision provider; the phone marks them. The strips in fixtures/photos/ were cut by the
app's own code (app/js/scan.js) from photos of printed sheets (tools/make_test_photos.mjs); vision.json says what
the fake "reads" in each, by its SHA-256, and what was written on the paper.

No image byte may be written anywhere: every writer is patched (files, the database, the logs), and there is no R2
binding at all. No network: the OpenAI request shape is checked against a recorder transport."""
import base64
import builtins
import hashlib
import io
import json
import logging
import pathlib
import shutil
import sqlite3
from fractions import Fraction

import httpx
import pytest
from fastapi.testclient import TestClient

from tutor_hub import sheets
from tutor_hub.ai import policy
from tutor_hub.ai.fake import FakeProvider
from tutor_hub.ai.providers import HttpProvider, with_images
from tutor_hub.mods import photo
from tutor_hub.server import create_app
from tutor_hub.stores.sqlite import MIGRATIONS, migrate

FIX = pathlib.Path(__file__).parent / "fixtures" / "photos"
VISION = json.loads((FIX / "vision.json").read_text(encoding="utf-8"))
CASES = VISION["cases"]
STAGING = "qg1j2918yx"                       # cohorts/staging.json: photo on
HUB_COHORT = "d6co6etep6"                    # cohorts/hub.json: photo off


def strip(name: str) -> bytes:
    return (FIX / f"{name}.jpg").read_bytes()


@pytest.fixture
def online(cfg):
    cfg.home = "online"
    cfg.lacks = ("printer", "pin")
    cfg.cohort = STAGING
    cfg.ai_provider = "fake"
    with TestClient(create_app(cfg)) as c:
        c.hub = c.app.state.hub
        c.hub.gateway.provider = FakeProvider.from_json(FIX / "vision.json")
        c.fake = c.hub.gateway.provider
        yield c


def join(c, consent=True):
    body = {"band": "s1", "lang": "prs", "picture": "key"}
    if consent:
        body["consent"] = {"kind": "guardian-on-phone", "version": c.hub.consent_version}
    r = c.post("/api/join", json=body)
    assert r.status_code == 200, r.text
    return {"X-Learner-Token": r.json()["token"]}


def send(c, name=None, headers=None, data=None, **over):
    case = CASES[name or "m7-prs-tilted"]
    body = {"code": case["code"], "seed": case["seed"], "lang": case["lang"],
            "strip": base64.b64encode(data if data is not None else strip(name or "m7-prs-tilted")).decode()}
    body.update(over)
    return c.post("/api/m/photo/mark", json=body, headers=headers if headers is not None else join(c))


def value(text):
    t = text.strip()
    if " " in t:
        w, f = t.split(" ", 1)
        return int(w) + Fraction(f)
    return Fraction(t)


@pytest.mark.parametrize("name", sorted(CASES))
def test_each_fixture_photo_is_read_and_marks_right_on_the_phone(online, name, library):
    case = CASES[name]
    r = send(online, name)
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == {"code", "readings"}                         # readings only: no marks, no hints, no answers
    assert all(set(x) == {"n", "read"} for x in body["readings"])
    assert body["readings"] == case["written"] and body["code"] == case["code"]
    # the phone's marking (numbers.js does the same): what was read against the key it keeps
    key = sheets.answer_key(library.lessons[case["lesson"]], case["seed"], case["lang"], lambda n: n)
    answers = {x["n"]: x["a"] for x in key["items"] if x.get("cell")}
    right = [bool(x["read"]) and value(x["read"]) == value(answers[x["n"]]) for x in body["readings"]]
    assert right == case["right"] and not all(right)
    # what left for the provider: one picture, the strip itself, and a prompt without a single answer
    sent = online.fake.sent[-1]
    assert sent["purpose"] == "read_sheet"
    assert sent["images"] == [hashlib.sha256(strip(name)).hexdigest()]
    text = json.dumps(sent["messages"], ensure_ascii=False)
    for a in answers.values():
        assert f'"{a}"' not in text and f" {a}." not in text and f" {a}\\n" not in text, a
    assert ("Persian digits" in text) == (case["lang"] != "en")
    assert [ln.split(":")[0] for ln in sent["messages"][-1]["content"].splitlines()[1:]] == \
        [f"Tile {n}" for n in answers]


def test_only_a_learner_who_agreed_and_only_where_photo_is_on(online):
    assert send(online, headers={}).status_code == 401
    assert send(online, headers={"X-Learner-Token": "x" * 32}).status_code == 401
    assert send(online, headers=join(online, consent=False)).status_code == 403
    assert send(online).status_code == 200
    r = online.post(f"/api/m/photo/mark?cohort={HUB_COHORT}", json={"code": "M7-03-48217", "seed": 4821,
                    "lang": "prs", "strip": base64.b64encode(strip("m7-prs-tilted")).decode()}, headers=join(online))
    assert r.status_code == 404                      # the hub's cohort and open have photo off
    hello = online.get("/api/hello").json()
    assert "photo" in [m["id"] for m in hello["modules"]]
    assert "photo" not in [m["id"] for m in online.get(f"/api/hello?cohort={HUB_COHORT}").json()["modules"]]


def test_a_strip_that_is_not_this_sheets_cells_is_refused(online):
    h = join(online)
    assert send(online, headers=h, code="M7-03-48271").status_code == 422       # a wrong check digit
    assert send(online, headers=h, seed=1234).status_code == 422                # the code says 4821
    assert send(online, headers=h, code="ZZ-99-48217", seed=4821).status_code in (404, 422)
    assert send(online, headers=h, data=strip("m1-prs-upside-down")).status_code == 422   # 4 cells, not 7
    assert send(online, headers=h, data=b"GIF89a" + bytes(200)).status_code == 422
    big = strip("m7-prs-tilted") + bytes(photo.MAX_BYTES)
    assert send(online, headers=h, data=big).status_code == 422
    assert send(online, headers=h, strip="not base64 at all!" * 10).status_code == 422
    assert online.fake.sent == []                                               # none of these reached the reader


def test_a_data_uri_strip_is_taken_too(online):
    data = "data:image/jpeg;base64," + base64.b64encode(strip("m7-prs-tilted")).decode()
    assert send(online, strip=data).status_code == 200


def test_when_the_reader_cannot_help_the_phone_is_told_why(online):
    h = join(online)
    online.hub.gateway.budget = 0
    assert send(online, headers=h).json() == {"error": "budget"}
    online.hub.gateway.budget = None
    online.fake.fail = "error"
    r = send(online, headers=h)
    assert r.status_code == 503 and r.json() == {"error": "error"}
    online.fake.fail = None
    # Pashto is not yet a language the AI is trusted in (TUTOR_AI_LANGS): nothing is sent
    n = len(online.fake.sent)
    assert send(online, "m7-prs-tilted", headers=h, lang="ps").json() == {"error": "language"}
    assert len(online.fake.sent) == n


def test_a_picture_nobody_knows_reads_as_question_marks(online):
    online.fake.vision.clear()
    r = send(online)
    assert r.status_code == 200
    assert {x["read"] for x in r.json()["readings"]} == {"?"}


@pytest.mark.parametrize("reply, want", [
    ('[{"n": 1, "read": "۵/۴"}, {"n": 2, "read": ""}]', ["5/4", "", "?"]),
    ('Here you are: [{"n": 1, "read": "1 1/4"}, {"n": 3, "read": "12"}] done', ["1 1/4", "?", "12"]),
    ('[[{"n": 2, "read": "3/5"}]]', ["?", "3/5", "?"]),
    ('[{"n": 1, "read": "five over four"}, {"n": 2, "read": "1234567890123"}, {"n": 9, "read": "1"}]', ["?", "?", "?"]),
    ("no json", ["?", "?", "?"]),
    ('{"n": 1}', ["?", "?", "?"]),
])
def test_readings_are_cleaned_to_the_sheets_cells(reply, want):
    cells = [{"n": 1, "kind": "frac"}, {"n": 2, "kind": "frac"}, {"n": 3, "kind": "int"}]
    assert [x["read"] for x in photo.readings(reply, cells)] == want


def test_jpeg_sizes_are_read_from_the_frame_header():
    assert photo.jpeg_size(strip("m7-prs-tilted")) == (600, photo.strip_height(7))
    assert photo.jpeg_size(strip("m1-prs-upside-down")) == (600, photo.strip_height(4))
    assert photo.jpeg_size(b"\xff\xd8\xff\xda" + bytes(20)) is None
    assert photo.jpeg_size(b"PNG") is None
    assert photo.strip_height(7) == 13 + 4 * 237


def test_no_image_byte_is_written_anywhere(online, monkeypatch, caplog, tmp_path):
    data = strip("m7-prs-tilted")
    b64 = base64.b64encode(data).decode()
    marks = [data[100:132], b64[200:240]]
    h = join(online)
    written = []
    real_open = builtins.open

    def guarded_open(file, mode="r", *a, **kw):
        if any(m in mode for m in "wax+"):
            written.append(("open", str(file)))
        return real_open(file, mode, *a, **kw)

    def refuse(name):
        def f(*a, **kw):
            written.append((name, a[0] if a else None))
            raise AssertionError(f"{name} called while a photo was read")
        return f
    monkeypatch.setattr(builtins, "open", guarded_open)
    monkeypatch.setattr(io, "open", guarded_open)
    for name in ("write_bytes", "write_text", "touch"):
        monkeypatch.setattr(pathlib.Path, name, refuse(name))
    for name in ("copy", "copyfile", "move"):
        monkeypatch.setattr(shutil, name, refuse(name))
    # every store call, with what it was given
    store = online.hub.store
    calls = []
    for name in dir(type(store)):
        fn = getattr(store, name)
        if name.startswith("_") or not callable(fn) or name in ("sync",):
            continue

        def wrap(fn=fn, name=name):
            async def w(*a, **kw):
                calls.append((name, a, kw))
                return await fn(*a, **kw)
            return w
        monkeypatch.setattr(store, name, wrap())
    caplog.set_level(logging.DEBUG)
    r = online.post("/api/m/photo/mark", headers=h, json={"code": "M7-03-48217", "seed": 4821, "lang": "prs",
                                                          "strip": b64})
    assert r.status_code == 200
    assert written == []
    assert {c[0] for c in calls} <= {"learner", "update_learner", "cohort", "flags", "ai_spent", "add_ai_usage"}, calls
    flat = repr(calls)
    assert not any(m.decode("latin-1") in flat if isinstance(m, bytes) else m in flat for m in marks)
    assert all(not isinstance(x, (bytes, bytearray)) for _, a, kw in calls for x in (*a, *kw.values()))
    logged = "\n".join(f"{r.getMessage()} {r.args!r}" for r in caplog.records)
    assert b64[200:240] not in logged and "base64" not in logged
    usage = [kw for n, _, kw in calls if n == "add_ai_usage"]
    assert len(usage) == 1 and set(usage[0]) == {"day", "cohort", "module", "purpose", "provider", "model", "tokens",
                                                 "cost_micro", "held"}
    # and the database on disk holds nothing of it
    for f in (online.hub.cfg.data).rglob("*"):
        if f.is_file():
            raw = f.read_bytes()
            assert data[100:132] not in raw and b64[200:240].encode() not in raw, f
    assert not hasattr(online.hub, "r2") and "r2" not in json.dumps(online.get("/api/hello").json()).lower()


@pytest.mark.anyio
async def test_the_openai_request_carries_the_strip_inline_and_asks_not_to_keep_it():
    seen = []

    def handler(request: httpx.Request):
        seen.append(request)
        return httpx.Response(200, json={"choices": [{"message": {"content": '[{"n": 1, "read": "5/4"}]'}}],
                                         "usage": {"prompt_tokens": 900, "completion_tokens": 12}})
    p = HttpProvider("openai", policy.OPENAI_URL, "vision-model", 10.0, key="test-key")
    p.client._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    data = strip("m7-prs-tilted")
    msgs = photo.prompt([{"n": 1, "kind": "frac"}], "prs")
    reply = await p.complete("read_sheet", msgs, images=[data], max_tokens=80, temperature=0.0)
    await p.aclose()
    assert reply.text == '[{"n": 1, "read": "5/4"}]' and (reply.tokens_in, reply.tokens_out) == (900, 12)
    (req,) = seen
    assert str(req.url) == "https://api.openai.com/v1/chat/completions"
    assert req.headers["authorization"] == "Bearer test-key"
    body = json.loads(req.content)
    assert body["store"] is False and body["stream"] is False and body["temperature"] == 0.0
    assert set(body) == {"model", "messages", "max_tokens", "temperature", "stream", "store"}   # no files, no upload
    system, user = body["messages"]
    assert system["role"] == "system" and isinstance(system["content"], str)
    assert [x["type"] for x in user["content"]] == ["text", "image_url"]
    assert user["content"][0]["text"] == msgs[1]["content"]
    url = user["content"][1]["image_url"]["url"]
    assert url == "data:image/jpeg;base64," + base64.b64encode(data).decode()
    assert msgs[1]["content"] == "The tiles, in order:\nTile 1: " + photo.KINDS["frac"] + "."   # not changed in place


@pytest.mark.anyio
async def test_text_only_calls_are_unchanged():
    seen = []
    p = HttpProvider("local", "http://127.0.0.1:8081/v1", "local", 10.0)
    p.client._client = httpx.AsyncClient(transport=httpx.MockTransport(
        lambda r: (seen.append(r), httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]}))[1]))
    await p.complete("explain", [{"role": "user", "content": "hi"}])
    await p.aclose()
    assert set(json.loads(seen[0].content)) == {"model", "messages", "max_tokens", "temperature", "stream"}
    assert with_images([{"role": "system", "content": "s"}], [b"x"])[-1]["content"][0]["type"] == "image_url"


def test_migration_0008_lets_an_existing_staging_database_try_photos(tmp_path):
    early = tmp_path / "early"
    early.mkdir()
    for f in sorted(MIGRATIONS.glob("*.sql")):
        if f.name < "0008":
            shutil.copy(f, early / f.name)
    db = sqlite3.connect(tmp_path / "t.db", isolation_level=None)
    migrate(db, early)
    for cid in (STAGING, HUB_COHORT):
        db.execute("INSERT INTO cohorts(id, label, langs, bands, settings, created) VALUES(?, 'x', '[]', '[]', '{}', 'now')",
                   (cid,))
    assert migrate(db) == ["0008_photo_flag", "0009_homework", "0010_review", "0011_timetable",
                           "0012_teacher", "0013_plan", "0014_admin"]
    rows = db.execute("SELECT cohort, enabled, changed_by FROM flags WHERE module='photo'").fetchall()
    assert rows == [(STAGING, 1, "seed")]
    assert db.execute("SELECT COUNT(*) FROM flag_log WHERE module='photo'").fetchone() == (1,)
