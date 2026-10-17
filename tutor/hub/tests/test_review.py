"""The Review module (P17, C3.4) and the staff gate (C3.2): reviewers mark each step and sign a lesson's content hash
on the hub (teacher PIN) or online (Cloudflare Access, checked here with a key made for the test); the staff table
keeps a peppered hash, never an email; tools/pull_signoffs.py copies signatures into the pack, after which the lesson
passes release mode, and one changed word voids it. No network."""
import base64
import hashlib
import importlib.util
import json
import random
import shutil
import time

import pytest
from fastapi.testclient import TestClient

from tutor_hub import staff
from tutor_hub.packs import Library
from tutor_hub.server import create_app, teacher_pin

from conftest import PACKS, TUTOR

STAGING = "qg1j2918yx"                       # cohorts/staging.json: review on
LESSON = "maths-7-fractions-add"
ROLES = ["Dari reader", "Pashto reader", "maths teacher"]
TEAM, AUD, PEPPER = "qalam-test", "aud-123", "pepper-for-tests"

spec = importlib.util.spec_from_file_location("pull_signoffs", TUTOR / "tools" / "pull_signoffs.py")
pull = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pull)


# a 2048-bit RSA key for the test's own Access team
def _prime(bits, rng):
    while True:
        n = rng.getrandbits(bits) | (1 << bits - 1) | 1
        if all(n % p for p in (3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37)) and all(
                pow(a, n - 1, n) == 1 for a in (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41)):
            return n


@pytest.fixture(scope="module")
def rsa():
    rng = random.Random(17)
    e = 65537
    while True:
        p, q = _prime(1024, rng), _prime(1024, rng)
        phi = (p - 1) * (q - 1)
        if p != q and phi % e:
            return {"n": p * q, "e": e, "d": pow(e, -1, phi), "kid": "k1"}


def b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def jwk(k):
    to = lambda i: b64(i.to_bytes((i.bit_length() + 7) // 8, "big"))
    return {"kid": k["kid"], "kty": "RSA", "alg": "RS256", "n": to(k["n"]), "e": to(k["e"])}


def token(k, **over):
    claims = {"aud": [AUD], "iss": f"https://{TEAM}.cloudflareaccess.com", "email": "Reviewer@Example.org",
              "exp": time.time() + 600, "iat": time.time(), **over}
    head = b64(json.dumps({"alg": "RS256", "kid": k["kid"]}).encode())
    body = b64(json.dumps(claims).encode())
    size = (k["n"].bit_length() + 7) // 8
    t = staff.SHA256_INFO + hashlib.sha256(f"{head}.{body}".encode()).digest()
    em = b"\x00\x01" + b"\xff" * (size - len(t) - 3) + b"\x00" + t
    sig = pow(int.from_bytes(em, "big"), k["d"], k["n"]).to_bytes(size, "big")
    return f"{head}.{body}.{b64(sig)}"


@pytest.fixture
def online(cfg, rsa):
    cfg.home, cfg.lacks, cfg.cohort = "online", ("printer", "pin"), STAGING
    cfg.access_team, cfg.access_aud, cfg.staff_pepper = TEAM, AUD, PEPPER
    with TestClient(create_app(cfg)) as c:
        c.hub = c.app.state.hub
        fetched = []

        async def keys(team):
            fetched.append(team)
            return [jwk(rsa)]
        c.hub.staff.fetcher = keys
        c.fetched = fetched
        yield c


@pytest.fixture
def village(cfg):
    cfg.cohort = STAGING                       # the reviewers' cohort, on a laptop hub: the PIN gate
    with TestClient(create_app(cfg)) as c:
        c.hub = c.app.state.hub
        c.pin = {"X-Teacher-Pin": teacher_pin(cfg.data)}
        yield c


def add_reviewer(c, email="reviewer@example.org", role="Dari reader", initials="AB"):
    import asyncio
    asyncio.run(c.hub.store.add_staff(id_hash=staff.id_hash(PEPPER, email), label="Dari reviewer 1", role=role,
                                      cohorts=[STAGING], initials=initials))


def test_access_lets_in_only_staff_with_a_token_signed_for_us(online, rsa):
    me = lambda **h: online.get("/api/m/review/me", headers=h)
    assert me().status_code == 401
    assert me(**{"Cf-Access-Jwt-Assertion": token(rsa)}).json()["error"] == "Ask the admin to add you"
    add_reviewer(online)
    r = me(**{"Cf-Access-Jwt-Assertion": token(rsa)})
    assert r.status_code == 200 and r.json()["role"] == "Dari reader" and r.json()["via"] == "access"
    assert "example" not in r.text.lower()                                   # the email is never given back
    for bad in (token(rsa, aud=["another-app"]), token(rsa, exp=time.time() - 3600),
                token(rsa, iss="https://evil.cloudflareaccess.com"), token(rsa)[:-6] + "AAAAAA",
                token({**rsa, "kid": "other"}), "not.a.token"):
        assert me(**{"Cf-Access-Jwt-Assertion": bad}).status_code == 403
    assert online.fetched[0] == TEAM


def test_the_staff_table_holds_no_email(online, cfg):
    import sqlite3
    add_reviewer(online)
    db = sqlite3.connect(cfg.data / "hub.db")
    rows = db.execute("SELECT * FROM staff").fetchall()
    db.close()
    assert len(rows) == 1
    blob = json.dumps(rows).lower()
    assert "@" not in blob and "example" not in blob and staff.id_hash(PEPPER, "reviewer@example.org") in blob


def test_without_the_access_settings_or_where_the_gate_is_off_there_are_no_staff_pages(cfg):
    cfg.home, cfg.lacks, cfg.cohort = "online", ("printer", "pin"), STAGING
    with TestClient(create_app(cfg)) as c:                                      # no team, audience or pepper
        assert c.get("/api/m/review/me").status_code == 404
    cfg.home, cfg.lacks, cfg.staff_gate = "hub", (), "off"                    # the fallback container's setting
    with TestClient(create_app(cfg)) as c:
        assert c.get("/api/m/review/me", headers={"X-Teacher-Pin": teacher_pin(cfg.data)}).status_code == 404


def test_the_hubs_own_cohort_has_review_off(hub_client):
    assert hub_client.get("/api/m/review/me", headers={"X-Teacher-Pin": hub_client.pin}).status_code == 404


def review_all(c, role, headers):
    d = c.get(f"/api/m/review/lessons/{LESSON}?role={role}", headers=headers).json()
    for s in d["steps"]:
        r = c.post(f"/api/m/review/lessons/{LESSON}/steps/{s['n']}", headers=headers,
                   json={"verdict": "ok", "step_hash": s["hash"], "role": role})
        assert r.status_code == 200, r.text
    return d


def test_a_reviewer_marks_every_step_then_signs_with_initials_only(village):
    h = village.pin
    assert village.get("/api/m/review/me").status_code == 401
    me = village.get("/api/m/review/me", headers=h).json()
    assert me["via"] == "pin" and set(ROLES) <= set(me["roles"])
    q = village.get("/api/m/review/queue?role=Dari reader", headers=h).json()
    row = next(l for p in q["packs"] for l in p["lessons"] if l["id"] == LESSON)
    assert row["status"] == "not_started" and row["code"] == "M7-03"
    d = village.get(f"/api/m/review/lessons/{LESSON}?role=Dari reader", headers=h).json()
    assert d["hash"].startswith("sha256:") and len(d["short"]) == 8 and len(d["steps"]) == 7       # 0 and six steps
    assert d["key"]["items"][0]["hints"] and d["no_recording"] == []
    assert village.get(f"/api/m/review/lessons/{LESSON}?role=Hanafi scholar", headers=h).status_code == 403

    sign = lambda **b: village.post(f"/api/m/review/lessons/{LESSON}/sign", headers=h,
                                    json={"hash": d["hash"], "role": "Dari reader", "initials": "AB", **b})
    assert sign().status_code == 409                                            # no step marked yet
    s2 = d["steps"][2]
    r = village.post(f"/api/m/review/lessons/{LESSON}/steps/2", headers=h, json={
        "verdict": "change", "chips": ["spelling"], "text": "call 0799123456 about the second sum",
        "step_hash": s2["hash"], "role": "Dari reader"})
    assert r.status_code == 200
    notes = village.get(f"/api/m/review/lessons/{LESSON}?role=Dari reader", headers=h).json()["steps"][2]
    assert notes["last"] == "change" and "0799123456" not in notes["text"]      # identifiers scrubbed
    assert village.post(f"/api/m/review/lessons/{LESSON}/steps/2", headers=h, json={
        "verdict": "ok", "step_hash": "sha256:old", "role": "Dari reader"}).status_code == 409
    q = village.get("/api/m/review/queue?role=Dari reader", headers=h).json()
    assert next(l for p in q["packs"] for l in p["lessons"] if l["id"] == LESSON)["status"] == "changes"

    review_all(village, "Dari reader", h)
    assert sign(initials="Ahmad").status_code == 422                            # initials only, never a name
    assert sign(hash="sha256:" + "0" * 64).status_code == 409
    r = sign()
    assert r.status_code == 200 and r.json()["signed"] and r.json()["new"]
    q = village.get("/api/m/review/queue?role=Dari reader", headers=h).json()
    assert next(l for p in q["packs"] for l in p["lessons"] if l["id"] == LESSON)["status"] == "signed"
    offs = village.get("/api/m/review/signoffs", headers=h).json()["signoffs"]
    assert offs == [{"lesson": LESSON, "hash": d["hash"], "role": "Dari reader", "initials": "AB",
                     "date": offs[0]["date"]}]


def test_online_the_role_and_initials_come_from_the_staff_row(online, rsa):
    add_reviewer(online, role="maths teacher", initials="EF")
    h = {"Cf-Access-Jwt-Assertion": token(rsa)}
    d = review_all(online, None, h)
    r = online.post(f"/api/m/review/lessons/{LESSON}/sign", headers=h, json={"hash": d["hash"], "role": "Dari reader"})
    assert r.status_code == 200 and r.json()["role"] == "maths teacher"       # her row decides, not the request
    assert online.get("/api/m/review/signoffs", headers=h).json()["signoffs"][0]["initials"] == "EF"


def test_pulled_signoffs_pass_release_and_one_changed_word_voids_them(village, tmp_path):
    h = village.pin
    for role, ini in zip(ROLES, ("AB", "CD", "EF")):
        d = review_all(village, role, h)
        assert village.post(f"/api/m/review/lessons/{LESSON}/sign", headers=h,
                            json={"hash": d["hash"], "role": role, "initials": ini}).status_code == 200
    offs = village.get("/api/m/review/signoffs", headers=h).json()["signoffs"]
    packs = tmp_path / "packs"
    shutil.copytree(PACKS, packs)
    shutil.copy(PACKS.parent / "sources.json", tmp_path / "sources.json")
    f = packs / "starter" / "lessons" / f"{LESSON}.json"
    before = f.read_text(encoding="utf-8")
    assert LESSON not in Library(packs, release=True).lessons                  # unsigned: not served in release
    report = pull.pull(offs, packs)
    assert len(report["copied"]) == 3 and not report["stale"]
    after = f.read_text(encoding="utf-8")
    assert after.splitlines()[:5] == before.splitlines()[:5]                    # only the review value changed
    lib = Library(packs, release=True)
    assert LESSON in lib.lessons and not any(LESSON in x for x in lib.hidden), lib.hidden
    assert json.loads(after)["review"]["status"] == "checked"
    assert pull.pull(offs, packs)["already"]                                    # pulling again changes nothing

    f.write_text(after.replace("کسر یعنی", "کسر یعنی:", 1), encoding="utf-8")   # one changed word
    lib = Library(packs, release=True)
    assert LESSON not in lib.lessons and any(LESSON in x for x in lib.hidden)
    assert len(pull.pull(offs, packs)["stale"]) == 3                            # the old signatures are left out


def test_the_staff_command_prints_sql_with_a_hash_and_never_the_email(cfg, capsys):
    from tutor_hub.__main__ import _staff
    from types import SimpleNamespace
    cfg.staff_pepper = PEPPER
    a = SimpleNamespace(command="staff-add", label="Dari reviewer 2", role="Dari reader", initials="GH", cohorts=STAGING)
    assert _staff(a, cfg, ask=lambda _: "Someone@Example.org") == 0
    out = capsys.readouterr().out
    assert staff.id_hash(PEPPER, "someone@example.org") in out and "@" not in out and "INSERT" in out
    cfg.staff_pepper = None
    assert _staff(a, cfg, ask=lambda _: "x@y.z") == 1


def test_a_skills_graph_is_reviewed_node_by_node_signed_and_pulled_into_its_file(village, tmp_path):
    h, role = village.pin, "maths teacher"
    q = village.get("/api/m/review/queue", params={"role": role}, headers=h).json()
    assert q["graphs"] == [{"subject": "maths", "version": q["graphs"][0]["version"], "nodes": 6, "status": "not_started"}]
    assert village.get("/api/m/review/queue", params={"role": "Dari reader"}, headers=h).json()["graphs"] == []
    assert village.get("/api/m/review/graphs/maths", params={"role": "Dari reader"}, headers=h).status_code == 403
    d = village.get("/api/m/review/graphs/maths", params={"role": role}, headers=h).json()
    assert len(d["steps"]) == 7 and "review" not in d["graph"] and d["lessons"][LESSON]["year"] == 7
    sign = lambda r, ini: village.post("/api/m/review/graphs/maths/sign", headers=h,
                                       json={"hash": d["hash"], "role": r, "initials": ini})
    assert sign(role, "EF").status_code == 409                             # not every node is OK yet
    assert village.post("/api/m/review/graphs/maths/steps/1", headers=h,
                        json={"verdict": "ok", "step_hash": "sha256:old0000", "role": role}).status_code == 409
    # an adult pathway: the maths teacher and an adult educator both sign
    for r, ini in ((role, "EF"), ("adult educator", "GH")):
        for st in d["steps"]:
            assert village.post(f"/api/m/review/graphs/maths/steps/{st['n']}", headers=h,
                                json={"verdict": "ok", "step_hash": st["hash"], "role": r}).status_code == 200
        assert sign(r, ini).status_code == 200
    q = village.get("/api/m/review/queue", params={"role": role}, headers=h).json()
    assert q["graphs"][0]["status"] == "signed"
    offs = village.get("/api/m/review/signoffs", headers=h).json()["signoffs"]
    assert [o["lesson"] for o in offs] == ["graph:maths", "graph:maths"]
    shutil.copytree(PACKS, tmp_path / "packs")
    shutil.copytree(PACKS.parent / "graph", tmp_path / "graph")
    shutil.copy(PACKS.parent / "sources.json", tmp_path / "sources.json")
    assert Library(tmp_path / "packs", release=True).graphs == {}
    report = pull.pull(offs, tmp_path / "packs")
    assert report["copied"] == [f"graph:maths: {role} EF {offs[0]['date']}", f"graph:maths: adult educator GH {offs[0]['date']}"]
    g = json.loads((tmp_path / "graph" / "maths.json").read_text(encoding="utf-8"))
    assert g["review"]["status"] == "checked" and [o["initials"] for o in g["review"]["signoffs"]] == ["EF", "GH"]
    assert Library(tmp_path / "packs").graphs["maths"]["_state"] == "signed"
