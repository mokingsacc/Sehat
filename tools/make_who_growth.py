#!/usr/bin/env python3
"""Make content/who-growth.json: the WHO Child Growth Standards (2006) LMS tables for boys and girls, 0 to 5 years,
in a compact form for the growth tracker (js/growth-calc.js).

Source: the WHO's own tables as published in the WHO "anthro" R package (World Health Organization, GPL-3):
  https://github.com/WorldHealthOrganization/anthro/tree/master/data-raw/growthstandards
  weianthro.txt (weight-for-age, by day), lenanthro.txt (length/height-for-age, by day; length under 731 days,
  height from 731 days), wflanthro.txt (weight-for-length, 45 to 110 cm), wfhanthro.txt (weight-for-height, 65 to 120 cm).
These are the same numbers as the WHO "expanded tables" at https://www.who.int/tools/child-growth-standards/standards.

Kept: age tables every day for 0 to 28 days, then every 7 days (to 1826 days), length/height tables every 0.5 cm. The app interpolates in between;
tools/test_growth.mjs checks that the z-scores stay within 0.01 of the full daily / 0.1 cm tables.
Usage: python3 tools/make_who_growth.py <folder with the four .txt files>   (downloads them when no folder is given)"""
import json, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://raw.githubusercontent.com/WorldHealthOrganization/anthro/master/data-raw/growthstandards/"
FILES = {"wfa": "weianthro.txt", "lhfa": "lenanthro.txt", "wfl": "wflanthro.txt", "wfh": "wfhanthro.txt"}
STEP = {"wfa": 7, "lhfa": 7, "wfl": 0.5, "wfh": 0.5}

def read(folder, name):
    if folder: txt = open(os.path.join(folder, name), encoding="utf-8").read()
    else: txt = urllib.request.urlopen(BASE + name).read().decode("utf-8")
    rows = [r.split("\t") for r in txt.strip().splitlines()]
    head = rows[0]
    return [dict(zip(head, r)) for r in rows[1:]]

def compact(rows, key, step, lo, hi):
    """rows of one sex -> {x0, dx, L (number when constant), M, S} keeping x = lo, lo+step, ..., hi (hi always kept)."""
    by = {round(float(r[key]), 1): r for r in rows}
    xs, x = [], lo
    while x < hi - 1e-9: xs.append(round(x, 1)); x += step
    xs.append(hi)
    pick = [by[x] for x in xs]
    L = [round(float(r["l"]), 4) for r in pick]
    out = {"x0": lo, "dx": step, "n": len(xs), "last": hi,
           "L": L[0] if len(set(L)) == 1 else L,
           "M": [round(float(r["m"]), 4) for r in pick],
           "S": [round(float(r["s"]), 5) for r in pick]}
    return out

def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else None
    out = {"_source": "WHO Child Growth Standards 2006 (boys m, girls f, 0 to 5 years): LMS values from the WHO anthro R package "
                      "(github.com/WorldHealthOrganization/anthro, data-raw/growthstandards, the same values as the WHO expanded tables). "
                      "Each table is a list of segments {x0, dx, n, last, L, M, S}; wfa and lhfa by age in days (lhfa: segment 1 is length, 0 to 730 days; segment 2 is height, 731 to 1826 days), wfl by length 45 to 110 cm, "
                      "wfh by height 65 to 120 cm. Every day for the first 28 days, then every 7 days; every 0.5 cm; interpolate linearly in between. Made by tools/make_who_growth.py.",
           "version": 1}
    for ind, fname in FILES.items():
        rows = read(folder, fname)
        key = {"wfa": "age", "lhfa": "age", "wfl": "length", "wfh": "height"}[ind]
        out[ind] = {}
        for sex, code in (("m", "1"), ("f", "2")):
            rs = [r for r in rows if r["sex"] == code]
            # one or more segments; length/height-for-age has a step of 0.7 cm at 731 days (lying length -> standing height),
            # so it is kept as two segments that are never interpolated across
            parts = [rs] if ind != "lhfa" else [[r for r in rs if float(r[key]) < 731], [r for r in rs if float(r[key]) >= 731]]
            segs = []
            for part in parts:
                lo, hi = min(float(r[key]) for r in part), max(float(r[key]) for r in part)
                # the first 4 weeks change fast (newborns lose and regain weight): every day there
                if ind in ("wfa", "lhfa") and lo == 0: segs.append(compact(part, key, 1, 0, 28)); lo = 28
                segs.append(compact(part, key, STEP[ind], lo, hi))
            out[ind][sex] = segs
    p = os.path.join(ROOT, "content/who-growth.json")
    json.dump(out, open(p, "w", encoding="utf-8"), separators=(",", ":"))
    print(p, os.path.getsize(p), "bytes")

main()
