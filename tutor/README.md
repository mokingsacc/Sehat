# Qalam: the village tutor (working name)

Free lessons for Afghan children in Dari and Pashto, from not-yet-in-school to year 12, with **worksheets printed
straight from the phone** and a **village or school hub** that answers questions, first from checked answers and
later with a local AI. No internet anywhere. Status: **foundations, October 2026**; every lesson is a draft until
native speakers and teachers check it.

- Years 0-6 get the bold, big look; years 7-12 the clean one. The year the child picks decides.
- Pen and paper first: every lesson ends with its one-page A4 worksheet; "Check my sheet" marks it.
- Every answer says where it came from: checked, worked out, from the lesson, from the teacher, or AI.
- The hub stores no names; progress stays on the phone.

## Try it

```bash
cd tutor/hub
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
TUTOR_PRINT=outbox .venv/bin/python -m tutor_hub serve --port 8080    # then open http://localhost:8080
.venv/bin/python -m pytest -q                                        # the tests
```

## Folders

| | |
|---|---|
| `app/` | the phone app (HTML, CSS, JavaScript modules, no build) |
| `hub/` | the hub server (Python, FastAPI) and its tests |
| `content/packs/` | lessons as data: steps, worksheets, question banks |
| `modules/`, `cohorts/` | one manifest per module; the seed cohorts and which modules they switch on |
| `migrations/` | the database tables as numbered SQL files, shared by the hub and the online server |
| `setup/` | installing a hub: service, Wi-Fi hotspot, printer, PIN |
| `tools/` | `validate_pack.py`, `validate_modules.py`, `make_sheets.py` |
| `docs/` | [how it fits together](docs/ARCHITECTURE.md), [writing lessons](docs/CONTENT.md), [the two looks](docs/DESIGN.md), [setting up a hub](docs/HUB-SETUP.md), [roadmap](docs/ROADMAP.md) |

It lives inside the Sehat repository for now, to reuse Sehat's Android shell and voices later; nothing in
Sehat's app, website or workflows touches it, and it can move to its own repository whole.

Fonts: Vazirmatn and Noto Naskh Arabic, SIL Open Font Licence (`app/fonts/OFL.txt`).
