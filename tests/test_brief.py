"""Brief and output tests (BR-13, BR-70 to BR-72, BR-04)."""
import json
import re

import pytest

from src.build import build

BANNED_EN = re.compile(r"\b(safe|unsafe|healthy|compliant)\b", re.I)
BANNED_HI = ("सुरक्षित", "असुरक्षित", "स्वस्थ")
URL = re.compile(r"https?://\S+")
NUM = re.compile(r"\d+(?:\.\d+)?")


@pytest.fixture(scope="module")
def data():
    return build(date="11-10-2026")


def numbers(text):
    return sorted(NUM.findall(URL.sub("", text)))


def test_no_banned_words_anywhere(data):
    """BR-13: no output string judges the water as fit or unfit for people."""
    blob = json.dumps(data, ensure_ascii=False)
    blob = URL.sub("", blob)
    assert not BANNED_EN.search(blob)
    for w in BANNED_HI:
        assert w not in blob


@pytest.mark.parametrize("scope", ["all", "durga"])
def test_same_numbers_en_hi(data, scope):
    """BR-71: English and Hindi contain the same numbers."""
    b = data["briefs"][scope]
    assert numbers(b["en"]["text"]) == numbers(b["hi"]["text"])


@pytest.mark.parametrize("scope", ["all", "durga"])
@pytest.mark.parametrize("lang", ["en", "hi"])
def test_fits_one_a4_page(data, scope, lang):
    """BR-70: about 45 lines of 110 characters fit one A4 page at print size."""
    text = data["briefs"][scope][lang]["text"]
    lines = sum(max(1, -(-len(line) // 110)) for line in text.splitlines())
    assert lines <= 48, lines


def test_honesty_box_always_present(data):
    """BR-72."""
    for scope in data["briefs"].values():
        for b in scope.values():
            assert sum(x["type"] == "box" for x in b["blocks"]) == 5


def allowed_numbers(data, scope):
    """Every number traceable to the evidence: readings, counts, totals, pages, ranges, limits."""
    ok = {"1", "2", "3", "100", "20", "10", "2026", "1000", "6.5", "8.5", "0"} | set(data["generated"].split("-"))
    ok |= {str(v) for v in data["headline"].values()}
    for g in data["scopes"][scope]:
        ok |= {str(g["rank"]), f"{g['total']:g}" if g["total"] is not None else ""}
        if g.get("rank_range"):
            ok |= {str(g["rank_range"]["min"]), str(g["rank_range"]["max"])}
        for c in g["components"]:
            ok |= {str(v) for v in c["facts"].values() if v is not None}
            for r in c["evidence"]:
                ok |= {str(r.get("value")), str(r["year"]), str(r["source_page"])}
    return ok


@pytest.mark.parametrize("scope", ["all", "durga"])
def test_brief_numbers_in_evidence(data, scope):
    """BR-04 / BR-70: every number in the brief also appears in the evidence or computed facts."""
    ok = allowed_numbers(data, scope)
    for lang in ("en", "hi"):
        stray = [n for n in numbers(data["briefs"][scope][lang]["text"]) if n not in ok]
        assert not stray, stray


def test_every_evidence_row_traceable(data):
    """BR-04: each evidence row has year, festival, phase, report file, page and #page link."""
    for g in data["scopes"]["all"]:
        for c in g["components"]:
            for r in c["evidence"]:
                keys = ("year", "festival", "report", "source_page", "link")
                keys += ("pre",) if c["key"] in ("impact", "recovery") else ("phase",)
                for k in keys:
                    assert r.get(k) not in (None, "")
                assert r["link"].endswith(f"#page={r['source_page']}")


def test_zero_do_in_bairagarh_evidence(data):
    g = next(g for g in data["scopes"]["all"] if g["id"] == "bairagarh")
    ox = next(c for c in g["components"] if c["key"] == "oxygen")
    assert sum(r["value"] == "0" for r in ox["evidence"]) == 4


def test_gaps_listed(data):
    text = data["briefs"]["all"]["en"]["text"]
    assert "Arch Bridge" in text
    assert "Bairagarh (Sant Hirdaram) kund; Malikhedi kund: no Durga 2025 table" in text
    assert "coliform" in text
