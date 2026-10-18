"""The school bag's card (W7, WEBSITE.md 3.6): its QR code is drawn on the phone by app/js/qr.js, a port of the
hub's maker (tutor_hub/qr.py, itself checked against segno), so the code never leaves the phone. Here the two agree
module for module, for every mask, on bag codes and on the sheets' own texts."""
import json
import random
import shutil
import subprocess

import pytest

from tutor_hub import qr

from conftest import TUTOR

pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="needs node, as the app's tests do")


def test_the_phones_qr_maker_draws_what_the_hubs_draws_for_every_mask():
    rnd = random.Random(7)
    codes = ["".join(rnd.choice("0123456789") for _ in range(16)) for _ in range(6)]      # the QR holds any 16
    texts = [f"Q1 BAG {c}" for c in codes] + ["Q1 M7-03-48217 PRS", "A", "Q1 E3-11-00001 EN"]
    cases = [(t, m) for t in texts for m in (None, *range(8))]
    script = ("import { matrix } from './app/js/qr.js';"
              "const cases = JSON.parse(process.argv[1]);"
              "console.log(JSON.stringify(cases.map(([t, m]) => matrix(t, m))));")
    out = subprocess.run(["node", "--input-type=module", "-e", script, json.dumps(cases)], cwd=TUTOR,
                         capture_output=True, text=True, check=True).stdout
    for (text, mask), js in zip(cases, json.loads(out)):
        assert js == qr.matrix(text, mask), (text, mask)
