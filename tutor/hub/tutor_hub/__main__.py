"""python -m tutor_hub [serve | pin | new-pin | admin-pin | new-admin-pin | check]

serve    run the hub (default): python -m tutor_hub serve --port 8080
pin      show the teacher PIN
new-pin  make a new teacher PIN (the old one stops working when the hub restarts)
admin-pin, new-admin-pin  the same for the admin PIN, which opens /admin/ on the hub (P21; not the teacher's)
check    check every lesson pack and list the problems (exit code 1 if there are any)
staff-add --label L --role R [--initials AB] [--cohorts ID,ID]  print the SQL that adds a staff member online
         (P17): it asks for the email, hashes it with TUTOR_STAFF_PEPPER and forgets it; run the SQL with
         `wrangler d1 execute qalam-staging --remote --command "..."`. Needed once, for the first admin: after that
         the admin panel's Staff page adds everyone. The hub needs no rows: its gate is the PIN.
staff-remove  the same, removing the staff member with that email.

Class codes come from the admin panel (/admin/, P21): Cohorts, then "New code".
"""
import argparse
import logging
import sys

from .config import Config


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m tutor_hub", description="The village learning hub.")
    ap.add_argument("command", nargs="?", default="serve", choices=["serve", "pin", "new-pin", "admin-pin", "new-admin-pin",
                                                                   "check", "staff-add", "staff-remove"])
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--label", help="staff-add: a neutral label, like 'Dari reviewer 2'")
    ap.add_argument("--role", help="staff-add: a reviewer role a lesson needs ('Dari reader'), teacher or admin")
    ap.add_argument("--initials", default="", help="staff-add: 1 to 4 capital letters, for signoffs")
    ap.add_argument("--cohorts", default="", help="staff-add: cohort ids, comma-separated")
    a = ap.parse_args(argv)
    if a.command in ("staff-add", "staff-remove"):
        return _staff(a, Config.from_env())
    cfg = Config.from_env()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    for noisy in ("fontTools", "weasyprint"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    if a.command == "check":
        from .packs import Library
        lib = Library(cfg.packs, release=cfg.release)
        for p in lib.sources.problems + lib.problems:
            print("problem:", p)
        for p in lib.hidden:
            print("not served (release mode):", p)
        print(f"{len(lib.lessons)} lessons in {len(lib.packs)} pack(s), {len(lib.problems)} problem(s)")
        return 1 if lib.problems or lib.sources.problems else 0

    if a.command in ("new-pin", "new-admin-pin"):
        (cfg.data / ("admin-pin.txt" if a.command == "new-admin-pin" else "teacher-pin.txt")).unlink(missing_ok=True)
        a.command = a.command[4:]
    if a.command == "pin":
        from .server import teacher_pin
        print(f"Teacher PIN: {teacher_pin(cfg.data)}")
        return 0
    if a.command == "admin-pin":
        from .server import admin_pin
        print(f"Admin PIN: {admin_pin(cfg.data)}")
        return 0

    import uvicorn
    from .server import create_app
    # no access log: addresses with a child's name in them (the sheet preview) must never reach the system journal
    uvicorn.run(create_app(cfg), host=a.host, port=a.port, log_level="info", access_log=False)
    return 0


def _staff(a, cfg, ask=input) -> int:
    """SQL for D1 that adds or removes a staff row; the email is read, hashed with the pepper and dropped."""
    from .staff import id_hash
    from .stores.base import check_staff
    if not cfg.staff_pepper:
        print("set TUTOR_STAFF_PEPPER first (the same secret as the Worker's)")
        return 1
    h = id_hash(cfg.staff_pepper, ask("Email (as Cloudflare Access knows it): "))
    q = lambda s: "'" + str(s).replace("'", "''") + "'"
    if a.command == "staff-remove":
        print(f"DELETE FROM staff WHERE id_hash={q(h)};")
        return 0
    cohorts = [c.strip() for c in a.cohorts.split(",") if c.strip()]
    try:
        cj = check_staff(id_hash=h, label=a.label or "", role=a.role or "", cohorts=cohorts, initials=a.initials)
    except ValueError as e:
        print(e)
        return 1
    print("INSERT OR REPLACE INTO staff(id_hash, label, role, cohorts, initials, added_at) VALUES("
          f"{q(h)}, {q(a.label.strip())}, {q(a.role.strip())}, {q(cj)}, {q(a.initials)}, strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now'));")
    return 0


if __name__ == "__main__":
    sys.exit(main())
