"""The website (docs/WEBSITE.md, W1): tools/make_site.py renders every page in three languages, refuses what the
ruling forbids, and writes a CSP whose hashes match the page's own inline script and style. The browser half of the
checks (layout, budgets, throttled first paint, the forwards) is tools/site_check.mjs."""
import base64
import html
import hashlib
import importlib.util
import json
import re
from pathlib import Path

import pytest

TUTOR = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def make_site():
    spec = importlib.util.spec_from_file_location("make_site", TUTOR / "tools" / "make_site.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def built(make_site, tmp_path_factory):
    out = tmp_path_factory.mktemp("site")
    return out, make_site.render(out)


def test_every_page_in_three_languages_with_its_lang_dir_and_alternates(built):
    out, rep = built
    urls = {p["url"] for p in rep["pages"]}
    assert {"/", "/ps/", "/en/", "/privacy/", "/ps/privacy/", "/en/privacy/"} <= urls
    for p in rep["pages"]:
        doc = (out / p["file"]).read_text(encoding="utf-8")
        hl, d = {"prs": ("fa-AF", "rtl"), "ps": ("ps-AF", "rtl"), "en": ("en", "ltr")}[p["lang"]]
        assert doc.startswith(f'<!doctype html><html lang="{hl}" dir="{d}"')
        alts = re.findall(r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">', doc)
        assert sorted(h for h, _ in alts) == ["en", "fa-AF", "ps-AF"]
        assert all(href in urls for _, href in alts)
        assert "data-t=" not in doc and "{{" not in doc and "{app_mb}" not in doc


def test_one_request_no_other_host_no_font_no_img(built):
    out, rep = built
    for p in rep["pages"]:
        doc = (out / p["file"]).read_text(encoding="utf-8")
        assert not re.search(r'<(img|iframe|form|link rel="stylesheet")', doc)
        assert not re.search(r'(src|href)="(https?:)?//', doc)
        assert "@font-face" not in doc and "@import" not in doc
        assert not re.search(r"\sstyle=|\son[a-z]+=", doc)


def test_the_csp_names_exactly_the_inline_scripts_and_styles(built):
    out, rep = built
    sha = lambda t: "'sha256-" + base64.b64encode(hashlib.sha256(t.encode()).digest()).decode() + "'"
    for p in rep["pages"]:
        doc = (out / p["file"]).read_text(encoding="utf-8")
        for s in re.findall(r"<script>(.*?)</script>", doc, re.S):
            assert sha(s) in rep["csp"]
        for s in re.findall(r"<style>(.*?)</style>", doc, re.S):
            assert sha(s) in rep["csp"]
    csp = rep["csp"]
    assert csp.startswith("default-src 'none'; script-src 'sha256-")
    for part in ("img-src data:", "connect-src 'self'", "worker-src 'self'", "base-uri 'none'", "form-action 'none'",
                 "frame-ancestors 'none'", "media-src 'self'"):
        assert part in csp
    assert "unsafe-inline" not in csp and "unsafe-eval" not in csp
    rules = rep["headers"].split("\n/")
    assert rep["headers"].startswith("/\n") and "/ps/*" in rep["headers"] and "/en/*" in rep["headers"]
    assert all("Referrer-Policy: no-referrer" in r and "Permissions-Policy: camera=(), microphone=(), geolocation=()" in r
               for r in rules)
    assert "/app" not in rep["headers"]                       # the app keeps its own rules and the camera


def test_forward_script_is_the_first_script_on_each_home(built):
    out, rep = built
    for p in rep["pages"]:
        doc = (out / p["file"]).read_text(encoding="utf-8")
        first = re.search(r"<script>(.*?)</script>", doc, re.S).group(1)
        if p["page"] == "home":
            assert doc.index("<script>") < doc.index("<title>")
            assert "join=" in first and "/app/" in first and "qalam.site.lang" in first and "site" in first
        else:
            assert "join=" not in first


def test_numbers_and_codes_per_language(built):
    out, _ = built
    prs = (out / "index.html").read_text(encoding="utf-8")
    en = (out / "en" / "index.html").read_text(encoding="utf-8")
    assert '<span class="code m">۴۸۲۱ ۷۵۹۰ ۳۶۶۱ ۲۰۴۳</span>' in prs and '<span class="code m">4821 7590 3661 2043</span>' in en
    assert 'href="/app/?year=3&amp;lang=prs"' in prs and 'aria-label="صنف ۳"' in prs
    assert "۰٫۶ میگابایت" in prs or "۰٫۵ میگابایت" in prs           # the app's real first open, compressed
    assert not re.search(r"[۰-۹]\s*·|·\s*[۰-۹]", re.sub(r"<[^>]+>", " ", prs))


def test_privacy_shows_the_consent_texts_in_force(built, make_site):
    out, _ = built
    doc = (out / "en" / "privacy" / "index.html").read_text(encoding="utf-8")
    from tutor_hub import learners
    for v in learners.CONSENT_VERSIONS.values():
        assert f'<bdi dir="ltr">{v}</bdi>' in doc
        full = json.loads((TUTOR / "content" / "consent" / "en" / f"{v}.json").read_text(encoding="utf-8"))["full"]
        assert all(html.escape(line) in doc for line in full)


def test_strings_match_across_languages(make_site):
    S = make_site.strings()
    keys = [sorted(k for k in S[x] if not k.startswith("_")) for x in make_site.LANGS]
    assert keys[0] == keys[1] == keys[2]
    for x in ("prs", "ps"):
        assert all(not re.search(r"[0-9]", v) for k, v in S[x].items() if not k.startswith("_") and k != "site.langs"), x


@pytest.mark.parametrize("bad, why", [
    ('<img src="/x.png">', "forbidden tag"), ('<a href="https://wa.me/1">x</a>', "share"),
    ("<p>Call +93 70 123 4567</p>", "phone"), ("<p>Mr Ahmad</p>", "title or name"),
    ("<h2>For girls</h2>", "girls"), ("<p>صنف ۶ · بعد</p>", "middle dot"), ('<p style="color:red">x</p>', "inline style"),
    ('<a href="/nowhere/">x</a>', "does not exist"), ("<p>a school in Mazar</p>", "below the province"),
    ("<style>@font-face{font-family:x}</style>", "web font"),
])
def test_the_lint_refuses(make_site, bad, why):
    found = make_site.lint("/x/", f"<html><body><main>{bad}</main></body></html>", {"/", "/privacy/"})
    assert any(why in f for f in found), found


def test_a_missing_string_stops_the_build(make_site, monkeypatch):
    real = make_site.json.loads
    def lose(text, *a, **kw):
        d = real(text, *a, **kw)
        if isinstance(d, dict) and d.get("_lang") == "ps":
            d.pop("home.h1")
        return d
    monkeypatch.setattr(make_site.json, "loads", lose)
    with pytest.raises(make_site.SiteError, match="ps.json lacks home.h1"):
        make_site.strings()
