"""python -m tutor_hub [serve | pin | new-pin | check]

serve    run the hub (default): python -m tutor_hub serve --port 8080
pin      show the teacher PIN
new-pin  make a new teacher PIN (the old one stops working when the hub restarts)
check    check every lesson pack and list the problems (exit code 1 if there are any)
"""
import argparse
import logging
import sys

from .config import Config


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m tutor_hub", description="The village learning hub.")
    ap.add_argument("command", nargs="?", default="serve", choices=["serve", "pin", "new-pin", "check"])
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8080)
    a = ap.parse_args(argv)
    cfg = Config.from_env()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    for noisy in ("fontTools", "weasyprint"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    if a.command == "check":
        from .packs import Library
        lib = Library(cfg.packs)
        for p in lib.problems:
            print("problem:", p)
        print(f"{len(lib.lessons)} lessons in {len(lib.packs)} pack(s), {len(lib.problems)} problem(s)")
        return 1 if lib.problems else 0

    pin_file = cfg.data / "teacher-pin.txt"
    if a.command == "new-pin":
        pin_file.unlink(missing_ok=True)
        a.command = "pin"
    if a.command == "pin":
        from .server import teacher_pin
        print(f"Teacher PIN: {teacher_pin(cfg.data)}")
        return 0

    import uvicorn
    from .server import create_app
    uvicorn.run(create_app(cfg), host=a.host, port=a.port, log_level="info")
    return 0


if __name__ == "__main__":
    sys.exit(main())
