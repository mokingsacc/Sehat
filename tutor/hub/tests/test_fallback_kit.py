"""The fallback kit (BUILD-PLAN P12, tutor/deploy): the container runs the hub's own app in online mode, as the
Worker does. CI builds the image and runs the smoke test against it (tutor.yml, job fallback-kit); these checks
keep it from drifting while nobody deploys it."""
import re
import tomllib

from tutor_hub.config import TUTOR

DEPLOY = TUTOR / "deploy"


def pins(path):
    out = {}
    for line in path.read_text().splitlines():
        m = re.match(r"^([A-Za-z0-9_.-]+)==(\S+)", line.strip())
        if m:
            out[m.group(1).lower()] = m.group(2)
    return out


def env_of(dockerfile):
    return dict(re.findall(r"(\w+)=(\S+?)\s*(?:\\|$)", dockerfile, re.M))


def test_the_container_has_the_hubs_packages_at_the_same_versions_without_the_pdf_maker():
    hub, kit = pins(TUTOR / "hub" / "requirements.txt"), pins(DEPLOY / "requirements.txt")
    assert "weasyprint" not in kit and "pytest" not in kit
    assert kit == {k: hub[k] for k in kit}


def test_the_container_runs_online_as_the_worker_does():
    env = env_of((DEPLOY / "Dockerfile").read_text())
    worker = tomllib.loads((TUTOR / "worker" / "wrangler.toml").read_text())["vars"]
    for k in ("TUTOR_HOME", "TUTOR_LACKS", "TUTOR_AI_PROVIDER"):
        assert env[k] == worker[k], k
    assert env["TUTOR_DATA"] == "/data"


def test_the_container_copies_every_folder_the_hub_reads():
    copied = set(re.findall(r"^COPY (\S+) ", (DEPLOY / "Dockerfile").read_text(), re.M))
    for folder in ("hub/tutor_hub", "migrations", "modules", "cohorts", "content", "app", "site", "tools/make_site.py"):
        assert folder in copied, folder


def test_the_blueprint_holds_no_secret_and_stays_in_frankfurt():
    text = (DEPLOY / "render.yaml").read_text()
    assert "region: frankfurt" in text
    assert "value:" not in text                 # every setting is typed in Render's dashboard (sync: false)
    names = re.findall(r"- key: (\S+)", text)
    assert names and not [n for n in names if re.search(r"KEY|TOKEN|SECRET|PASSWORD", n)]
