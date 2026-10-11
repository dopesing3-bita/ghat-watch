"""UI support tests (BR-61 to BR-64, BR-71): plan groups, event date, guide text, i18n parity, local-only assets."""
import datetime as dt
import json
import re

import pytest

from src.build import build, plan_groups
from src.config import ROOT, load_rules
from src.i18n import load_i18n

DOCS = ROOT / "docs"
# Placeholders app.js fills in the guide (helpParams): headline counts, component maxima, tiers, runs, dates.
HELP_PARAMS = {"do_min", "bod_max", "bod_above", "bod_valid", "do_below", "do_valid", "do_zero", "oxygen",
               "organic", "ph", "impact", "recovery", "p1", "p2", "runs", "limited", "event"}


@pytest.fixture(scope="module")
def i18n():
    return load_i18n()


@pytest.fixture(scope="module")
def data():
    return build(date="11-10-2026")


def test_hindi_has_every_english_key(i18n):
    """BR-71: every English string has a Hindi twin."""
    for group in ("ui", "flag", "focus", "reason", "brief"):
        assert set(i18n["en"][group]) == set(i18n["hi"][group]), group
    shape = lambda lang: [(s["id"], len(s["items"]), "p" in s) for s in i18n[lang]["help"]["sections"]]
    assert shape("en") == shape("hi")
    for k in ("before", "during", "after"):
        assert len(i18n["en"]["site"][k]) == len(i18n["hi"]["site"][k])


def test_every_ui_key_used_by_app_exists(i18n):
    """A typo in app.js would show 'undefined' on screen."""
    js = (DOCS / "app.js").read_text(encoding="utf-8")
    used = set(re.findall(r'\bui\("(\w+)"[,)]', js))
    used |= {f"nav_{k}" for k in ("ranking", "plan", "brief", "help")}
    used |= {f"plan_{k}" for k in ("before", "during", "after")} | {f"howto_{i}" for i in (1, 2, 3)}
    assert used <= set(i18n["en"]["ui"]), used - set(i18n["en"]["ui"])


def test_guide_placeholders_are_filled(i18n):
    """BR-63: every {placeholder} in the guide is one app.js fills from rules.yaml or the data."""
    for lang in ("en", "hi"):
        text = json.dumps(i18n[lang]["help"], ensure_ascii=False)
        assert set(re.findall(r"\{(\w+)\}", text)) <= HELP_PARAMS


def test_plan_places_every_action_once(data, i18n):
    """BR-61: each suggested action (BR-60) sits in exactly one of before / during / after."""
    keys = [a for g in data["plan"].values() for a in g]
    assert sorted(keys) == sorted(set(keys)) == sorted(i18n["en"]["focus"])
    for scope in data["scopes"].values():
        for g in scope:
            assert set(g["focus"]) <= set(keys)


def test_plan_rejects_an_action_in_two_groups():
    rules = load_rules()
    rules["plan"]["during"] = rules["plan"]["during"] + ["cleaning"]
    with pytest.raises(ValueError):
        plan_groups(rules)


def test_event_dates(data):
    """BR-62: the countdown date is a real date and the re-test comes after it."""
    assert dt.date.fromisoformat(data["event"]["date"]) == dt.date(2026, 10, 20)
    assert data["event"]["after_days"] > 0


def test_fonts_are_local_files():
    """Fonts ship with the app (SIL OFL), so it still looks right offline."""
    css = (DOCS / "style.css").read_text(encoding="utf-8")
    urls = re.findall(r"url\(([^)]+)\)", css)
    assert urls and all(u.startswith("fonts/") for u in urls)
    for u in urls:
        assert (DOCS / u).is_file(), u
    assert (DOCS / "fonts" / "OFL-Poppins.txt").is_file()
    assert (DOCS / "fonts" / "OFL-CormorantGaramond.txt").is_file()


def test_offline_cache_lists_real_files_only():
    """sw.js caches the app's own files and nothing from another site."""
    sw = (DOCS / "sw.js").read_text(encoding="utf-8")
    assert not re.search(r"https?://", sw)
    files = re.findall(r'"([\w./-]+\.(?:html|css|js|svg|webmanifest|woff2))"', sw)
    assert "data.js" in files and "app.js" in files
    for f in files:
        assert (DOCS / f).is_file(), f
    manifest = json.loads((DOCS / "manifest.webmanifest").read_text(encoding="utf-8"))
    assert not re.search(r"https?://", json.dumps(manifest))


def test_water_bodies_have_hindi_names(data, i18n):
    """Hindi screens show the water body in Hindi."""
    for g in data["scopes"]["all"]:
        assert g["water_body"] in i18n["glossary"]["water_body"], g["water_body"]
