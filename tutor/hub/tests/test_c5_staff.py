"""C5 staff pages (P34, C5.1 and C5.2): the commonest staff refusals carry a stable `code` beside the sentence, which
the pages show in the reader's language; the cohort page says since when and by whom a kill switch is off, from the
Log, and gives each module's capabilities so the risk sentence can be read in Dari and Pashto. Nothing new is
stored."""
from test_admin import as_admin, get, hub, post  # noqa: F401  (fixtures and helpers)
from test_review import online, rsa  # noqa: F401

HUB = "d6co6etep6"


def test_refusals_carry_their_code(hub, cfg):
    r = hub.get("/api/m/admin/cohorts/nosuchcohort1", headers=hub.pin)
    assert r.status_code == 404 and r.json() == {"error": "no such cohort", "code": "no_cohort"}
    r = hub.post(f"/api/m/admin/cohorts/{HUB}/settings", headers=hub.pin, json={"settings": {"ai_budget": -5}})
    assert r.status_code == 422 and r.json()["code"] == "budget"
    r = hub.post(f"/api/m/admin/cohorts/{HUB}/flags/photo", headers=hub.pin, json={"enabled": True})
    assert r.status_code == 409 and r.json()["code"] == "confirm_first" and r.json()["risks"][0]["capabilities"]
    r = hub.get("/api/m/teacher/me", headers={"X-Teacher-Pin": "000000"})
    assert r.status_code == 401 and r.json()["code"] == "wrong_pin"
    # a plain refusal keeps its old shape: the sentence only
    assert "code" not in hub.post("/api/m/admin/cohorts", headers=hub.pin, json={"label": "Girls class",
                                                                                 "langs": ["prs"], "bands": ["s1"]}).json()
    for _ in range(5):
        hub.get("/api/m/admin/me", headers={"X-Admin-Pin": "000001"})
    assert hub.get("/api/m/admin/me", headers=hub.pin).json()["code"] == "wait"


def test_last_admin_and_access_codes(online, rsa):
    assert online.get("/api/m/admin/me").json()["code"] == "access"
    as_admin(online, rsa)
    me = next(s for s in get(online, "/staff")["staff"] if s["label"] == "Admin A")
    r = online.delete(f"/api/m/admin/staff/{me['id']}", headers=online.pin)
    assert r.status_code == 409 and r.json()["code"] == "last_admin"


def test_not_your_class(online, rsa):
    as_admin(online, rsa, "teacher@example.org", role="teacher")
    r = online.get(f"/api/m/teacher/todo?cohort={HUB}", headers=online.pin)
    assert r.status_code == 403 and r.json()["code"] == "not_your_class"


def test_since_when_a_kill_switch_is_off(hub):
    c = get(hub, f"/cohorts/{HUB}")
    assert c["since"] == {"ai": None, "day": None} and all("capabilities" in m for m in c["modules"])
    post(hub, f"/cohorts/{HUB}/kill", {"switch": "ai", "on": False})
    c = get(hub, f"/cohorts/{HUB}")
    assert c["ai"] is False and c["since"]["ai"]["by"] == "admin:hub" and c["since"]["ai"]["at"]
    post(hub, f"/cohorts/{HUB}/kill", {"switch": "ai", "on": True})
    assert get(hub, f"/cohorts/{HUB}")["since"]["ai"] is None
