"""The hub as the phones see it: lessons, Ask, worksheets, printing (to the outbox) and the teacher's page."""
from fastapi.testclient import TestClient


def test_hello_and_lists(hub_client):
    h = hub_client.get("/api/hello").json()
    assert h["hub"] == "Qalam" and h["lessons"] == 6 and h["ai"]["on"] is False
    assert h["printer"]["state"] == "outbox"
    packs = hub_client.get("/api/packs").json()["packs"]
    assert packs[0]["id"] == "starter"


def test_app_and_pictures_are_served(hub_client):
    assert "js/main.js" in hub_client.get("/").text
    assert hub_client.get("/packs/starter/pictures/milk.svg").status_code == 200
    assert hub_client.get("/packs/starter/pictures/..%2Fpack.json").status_code == 404
    assert hub_client.get("/api/lessons/nope").status_code == 404


def test_lesson_never_carries_sheet_answers(hub_client):
    l = hub_client.get("/api/lessons/maths-7-fractions-add").json()
    assert "sheet" not in l and l["pack"] == "starter"


def test_ask_a_sum(hub_client):
    a = hub_client.post("/api/ask", json={"text": "۱/۲ + ۱/۴ چند می‌شود؟", "lang": "prs", "year": 7}).json()
    assert a["source"] == "maths" and a["text"] == "$1/2 + 1/4 = 3/4$" and len(a["id"]) == 16


def test_question_waits_for_the_teacher_then_gets_an_answer(hub_client):
    a = hub_client.post("/api/ask", json={"text": "زلزله چرا می‌آید؟", "lang": "prs", "year": 8}).json()
    assert a["waiting"] and a["source"] == "none"
    assert hub_client.get(f"/api/ask/{a['id']}").json()["status"] == "waiting"
    pin = {"X-Teacher-Pin": hub_client.pin}
    q = hub_client.get("/api/teacher/queue", headers=pin).json()["questions"]
    assert len(q) == 1 and "token" not in q[0]
    r = hub_client.post(f"/api/teacher/answer/{q[0]['id']}", headers=pin,
                        json={"answer": "زمین از تکان خوردن لایه‌های زیر خاک می‌لرزد.", "approve": True})
    assert r.status_code == 200
    s = hub_client.get(f"/api/ask/{a['id']}").json()
    assert s["status"] == "reviewed" and "زمین" in s["teacher_answer"]
    # the approved answer now answers the next child at once
    b = hub_client.post("/api/ask", json={"text": "زلزله چرا می‌آید", "lang": "prs"}).json()
    assert b["source"] == "approved" and b["checked"]


def test_distress_goes_to_the_top_of_the_teacher_list(hub_client):
    hub_client.post("/api/ask", json={"text": "زلزله چرا می‌آید؟", "lang": "prs"})
    a = hub_client.post("/api/ask", json={"text": "پدرم مرا می‌زند", "lang": "prs"}).json()
    assert a["urgent"] and a["source"] == "rules"
    q = hub_client.get("/api/teacher/queue", headers={"X-Teacher-Pin": hub_client.pin}).json()["questions"]
    assert q[0]["urgent"] == 1


def test_child_can_send_an_answer_to_the_teacher(hub_client):
    a = hub_client.post("/api/ask", json={"text": "مخرج مشترک چیست؟", "lang": "prs"}).json()
    assert a["source"] == "bank"
    assert hub_client.post(f"/api/ask/{a['id']}/teacher").json() == {"ok": True}
    q = hub_client.get("/api/teacher/queue", headers={"X-Teacher-Pin": hub_client.pin}).json()["questions"]
    assert q and q[0]["answer"]


def test_sheet_page_seed_and_key(hub_client):
    r = hub_client.get("/api/sheets/maths-7-fractions-add.html?lang=prs")
    seed = int(r.headers["x-sheet-seed"])
    assert 1000 <= seed <= 9999 and f"M7-03-{seed}" in r.text
    key = hub_client.get(f"/api/sheets/maths-7-fractions-add/key?seed={seed}&lang=prs").json()
    assert key["code"] == "M7-03" and key["seed"] == seed and key["items"][0]["check"] == "value"
    again = hub_client.get(f"/api/sheets/maths-7-fractions-add/key?seed={seed}&lang=prs").json()
    assert again == key
    fixed = hub_client.get("/api/sheets/dari-1-sheen.html?lang=ps")
    assert fixed.headers["x-sheet-seed"] == "0"


def test_sheet_pdf(hub_client):
    r = hub_client.get("/api/sheets/dari-1-sheen.pdf?lang=prs")
    assert r.status_code == 200 and r.content.startswith(b"%PDF")


def test_print_a_worksheet_to_the_outbox(hub_client, cfg):
    r = hub_client.post("/api/print", json={"lesson": "maths-1-count-5", "lang": "prs", "name": "Maryam"}).json()
    hub_client.hub.prints.wait()
    job = hub_client.get(f"/api/print/{r['id']}").json()
    assert job["status"] == "saved"
    files = list((cfg.data / "outbox").glob("*.pdf"))
    assert len(files) == 1 and files[0].read_bytes().startswith(b"%PDF")
    # the name was printed once and never stored
    row = hub_client.hub.store.sync.print_job(r["id"])
    assert "Maryam" not in str(row)


def test_answer_sheets_and_many_copies_need_the_pin(hub_client):
    base = {"lesson": "maths-1-count-5", "lang": "prs"}
    assert hub_client.post("/api/print", json=dict(base, kind="answers")).status_code == 401
    assert hub_client.post("/api/print", json=dict(base, copies=4)).status_code == 401
    ok = hub_client.post("/api/print", json=dict(base, copies=20), headers={"X-Teacher-Pin": hub_client.pin})
    assert ok.status_code == 200
    hub_client.hub.prints.wait()


def test_hourly_limit_is_per_phone_address(hub_client):
    base = {"lesson": "dari-1-sheen", "lang": "prs", "copies": 3}
    teacher = {"X-Teacher-Pin": hub_client.pin}
    assert hub_client.post("/api/print", json=dict(base, copies=20), headers=teacher).status_code == 200
    for k in range(4):                     # the teacher's 20 don't count; what a phone says about itself changes nothing
        assert hub_client.post("/api/print", json=dict(base, device=f"phone-{k}")).status_code == 200
    assert hub_client.post("/api/print", json=dict(base, device="new-phone")).status_code == 429
    other_phone = TestClient(hub_client.app, client=("10.42.0.20", 50000))
    assert other_phone.post("/api/print", json=base).status_code == 200
    hub_client.hub.prints.wait()


def test_teacher_pages_need_the_pin_and_lock_after_wrong_tries(hub_client):
    assert hub_client.get("/api/teacher/summary").status_code == 401          # a missing PIN counts as a try
    for _ in range(4):
        assert hub_client.get("/api/teacher/summary", headers={"X-Teacher-Pin": "000000"}).status_code == 401
    assert hub_client.get("/api/teacher/summary", headers={"X-Teacher-Pin": hub_client.pin}).status_code == 429


def test_wrong_pins_wait_longer_each_round(hub_client):
    clock = [1000.0]
    hub_client.hub.clock = lambda: clock[0]
    wrong, right = {"X-Teacher-Pin": "000000"}, {"X-Teacher-Pin": hub_client.pin}

    def five_wrong():
        for _ in range(5):
            assert hub_client.get("/api/teacher/summary", headers=wrong).status_code == 401
    five_wrong()
    assert hub_client.get("/api/teacher/summary", headers=right).status_code == 429
    clock[0] += 61
    five_wrong()
    clock[0] += 61                         # the second wait is 15 minutes
    assert hub_client.get("/api/teacher/summary", headers=right).status_code == 429
    clock[0] += 15 * 60
    assert hub_client.get("/api/teacher/summary", headers=right).status_code == 200


def test_a_pin_in_other_letters_is_only_wrong(hub_client):
    r = hub_client.get("/api/teacher/summary", headers={"X-Teacher-Pin": "۱۲۳۴۵۶".encode()})
    assert r.status_code == 401


def test_one_phone_cannot_flood_ask(hub_client):
    for _ in range(10):
        assert hub_client.post("/api/ask", json={"text": "۱ + ۱", "lang": "prs"}).status_code == 200
    assert hub_client.post("/api/ask", json={"text": "۱ + ۱", "lang": "prs"}).status_code == 429
    other_phone = TestClient(hub_client.app, client=("10.42.0.21", 50000))
    assert other_phone.post("/api/ask", json={"text": "۱ + ۱", "lang": "prs"}).status_code == 200


def test_the_hub_keeps_no_access_log(monkeypatch, tmp_path):
    # the sheet preview's address carries the child's name, so request lines must never reach the journal
    import uvicorn

    from tutor_hub.__main__ import main
    seen = {}
    monkeypatch.setenv("TUTOR_DATA", str(tmp_path / "data"))
    monkeypatch.setenv("TUTOR_PRINT", "outbox")
    monkeypatch.setattr(uvicorn, "run", lambda app, **kw: seen.update(kw))
    assert main(["serve", "--port", "8099"]) == 0
    assert seen["access_log"] is False


def test_teacher_summary_and_hub_card(hub_client):
    pin = {"X-Teacher-Pin": hub_client.pin}
    s = hub_client.get("/api/teacher/summary", headers=pin).json()
    assert s["counts"]["asked_today"] == 0 and s["pack_problems"] == []
    j = hub_client.post("/api/teacher/hub-card", headers=pin).json()
    hub_client.hub.prints.wait()
    assert hub_client.get(f"/api/print/{j['id']}").json()["status"] == "saved"
    assert hub_client.get("/api/teacher/prints", headers=pin).json()["jobs"][0]["kind"] == "card"


def test_health_question_points_to_sehat_and_waits_for_the_teacher(hub_client):
    a = hub_client.post("/api/ask", json={"text": "وقتی تب دارم چه دوا بخورم؟", "lang": "prs"}).json()
    assert a["source"] == "rules" and a["waiting"] and not a["urgent"] and "صحت" in a["text"]
    pin = {"X-Teacher-Pin": hub_client.pin}
    q = hub_client.get("/api/teacher/queue", headers=pin).json()["questions"][0]
    assert q["source"] == "rules" and q["answer"]          # the teacher sees what the child was told
    hub_client.post(f"/api/teacher/answer/{q['id']}", headers=pin, json={"answer": "به کلینیک برو.", "approve": True})
    assert hub_client.hub.store.sync.approved() == []          # a safety message never becomes a reusable answer


# modules and cohorts (P1)

def test_hello_lists_the_five_modules_for_the_hub(hub_client):
    h = hub_client.get("/api/hello").json()
    assert h["cohort"]["id"] == hub_client.hub.cohort_id and h["core"] == h["version"]
    assert [m["id"] for m in h["modules"]] == ["ask", "check", "lessons", "print", "teacher"]
    ask = next(m for m in h["modules"] if m["id"] == "ask")
    assert ask["risk"] == "medium" and "ey" not in ask["bands"]
    assert hub_client.get(f"/api/hello?cohort={h['cohort']['id']}").json()["modules"] == h["modules"]
    assert [m["id"] for m in hub_client.get("/api/hello?band=ey").json()["modules"]] == ["lessons", "print", "teacher"]
    assert hub_client.get("/api/hello?cohort=nosuchcohort").status_code == 404
    assert hub_client.get("/api/hello?band=k9").status_code == 400


def test_print_off_makes_its_routes_404_for_that_cohort_only(hub_client):
    hub = hub_client.hub
    open_id = hub.seeds["staging"]["id"]
    hub.store.sync.set_flag(hub.cohort_id, "print", enabled=False, changed_by="admin")
    base = {"lesson": "maths-1-count-5", "lang": "prs"}
    assert hub_client.post("/api/print", json=base).status_code == 404
    assert hub_client.get("/api/sheets/dari-1-sheen.html").status_code == 404
    assert hub_client.post("/api/teacher/hub-card", headers={"X-Teacher-Pin": hub_client.pin}).status_code == 404
    assert "print" not in [m["id"] for m in hub_client.get("/api/hello").json()["modules"]]
    # everything else still works, and Check my sheet keeps its key
    assert hub_client.get("/api/lessons/maths-1-count-5").status_code == 200
    assert hub_client.get("/api/sheets/maths-7-fractions-add/key?seed=1234").status_code == 200
    assert hub_client.post("/api/ask", json={"text": "۱ + ۱", "lang": "prs"}).status_code == 200
    # another cohort keeps printing
    assert hub_client.post(f"/api/print?cohort={open_id}", json=base).status_code == 200
    hub.prints.wait()
    # switched on again, the next request sees it; both changes are logged
    hub.store.sync.set_flag(hub.cohort_id, "print", enabled=True, changed_by="admin")
    assert hub_client.post("/api/print", json=base).status_code == 200
    hub.prints.wait()
    log = hub.store.sync.flag_log(hub.cohort_id)
    assert [(r["module"], r["enabled"]) for r in log[:2]] == [("print", True), ("print", False)]


def test_a_module_whose_dependency_is_off_is_off(hub_client):
    hub = hub_client.hub
    hub.store.sync.set_flag(hub.cohort_id, "lessons", enabled=False, changed_by="admin")
    on = [m["id"] for m in hub_client.get("/api/hello").json()["modules"]]
    assert on == ["ask", "teacher"]                 # print and check depend on lessons
    assert hub_client.get("/api/packs").status_code == 404
    assert hub_client.get("/api/sheets/maths-7-fractions-add/key?seed=1").status_code == 404


def test_a_broken_manifest_is_left_out_and_the_hub_still_runs(cfg, tmp_path, caplog):
    import shutil

    from tutor_hub.config import TUTOR
    from tutor_hub.server import create_app
    mods = tmp_path / "modules"
    shutil.copytree(TUTOR / "modules", mods)
    (mods / "print" / "module.json").write_text('{"id": "print", "version": "one"}', encoding="utf-8")
    cfg.modules = mods
    with caplog.at_level("WARNING", logger="tutor.modules"):
        app = create_app(cfg)
    assert "print: unknown fields" in caplog.text or "print: missing fields" in caplog.text
    with TestClient(app) as c:
        assert [m["id"] for m in c.get("/api/hello").json()["modules"]] == ["ask", "check", "lessons", "teacher"]
        assert c.post("/api/print", json={"lesson": "maths-1-count-5"}).status_code == 404
        assert c.get("/api/lessons/maths-1-count-5").status_code == 200


def test_seeds_fill_empty_tables_once(cfg):
    from tutor_hub.server import create_app
    app = create_app(cfg)
    with TestClient(app) as c:
        hub = c.app.state.hub
        hub.store.sync.set_flag(hub.cohort_id, "ask", enabled=False, changed_by="admin")
    with TestClient(create_app(cfg)) as c:           # a restart keeps the admin's change
        assert "ask" not in [m["id"] for m in c.get("/api/hello").json()["modules"]]
        assert len(c.app.state.hub.store.sync.cohorts()) == 3
