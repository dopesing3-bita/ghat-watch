"""Ghat Watch 2.0 checks (BR-65, BR-80 to BR-87): readings table, bilingual strings, secrets, network rules, AI tests."""
import json
import re
import shutil
import subprocess

import pytest

from src.build import build
from src.config import ROOT
from src.i18n import load_i18n
from src.load import BDL, MISSING, VALID

DOCS = ROOT / "docs"
KEY_PATTERNS = [r"AIza[0-9A-Za-z_\-]{30,}", r"\bAQ\.[0-9A-Za-z_\-]{30,}", r"\bsk_[0-9a-f]{30,}"]


@pytest.fixture(scope="module")
def data():
    return build(date="11-10-2026")


def test_readings_table_matches_csv(data, df):
    """BR-65: one row per CSV reading; BDL and missing never carry a number (BR-01, BR-02)."""
    R = data["readings"]
    assert len(R["rows"]) == len(df) == data["dataset"]["rows"]
    counts = {VALID: 0, BDL: 0, MISSING: 0}
    for row in R["rows"]:
        counts[row[6]] += 1
        assert (row[5] is None) == (row[6] != VALID)
    assert counts == data["dataset"]["status_counts"]
    assert counts[BDL] == 174
    do = [r for r in R["rows"] if R["parameters"][r[4]] == "Dissolved oxygen" and r[6] == VALID]
    assert len(do) == 116 and sum(r[5] < 5 for r in do) == 42


def test_dataset_facts_are_computed(data, df):
    ds = data["dataset"]
    assert ds["years"] == sorted(df["year"].unique().tolist())
    assert ds["ghats_with_data"] == df["site"].nunique() == 7
    assert data["component_max"] == {"oxygen": 40, "organic": 25, "ph": 5, "impact": 20, "recovery": 10}


def test_new_strings_exist_in_both_languages():
    """BR-71: every new English string has a Hindi twin."""
    i = load_i18n()
    for group in ("actions", "assist"):
        assert set(i["en"][group]) == set(i["hi"][group]), group
    assert len(i["en"]["assist"]["chips"]) == len(i["hi"]["assist"]["chips"]) == 8
    shape = lambda lang: [(s["id"], len(s["p"])) for s in i[lang]["datapage"]["sections"]]
    assert shape("en") == shape("hi")


def test_ui_keys_used_by_new_modules_exist():
    i = load_i18n()["en"]
    for f in ("analytics.js", "assistant.js", "app.js", "upload.js"):
        js = (DOCS / f).read_text(encoding="utf-8")
        used = set(re.findall(r'\bui\("(\w+)"[,)]', js))
        assert used <= set(i["ui"]), (f, used - set(i["ui"]))
    js = (DOCS / "assistant.js").read_text(encoding="utf-8") + (DOCS / "assist-core.js").read_text(encoding="utf-8")
    used = set(re.findall(r"\b(?:A\(\)|a)\.(\w+)", js)) - {"length", "push", "slice", "every", "map", "filter", "forEach", "indexOf", "join", "some"}
    assert used <= set(i["assist"]), used - set(i["assist"])


def committable_files():
    out = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard"], cwd=ROOT,
                         capture_output=True, text=True, check=True).stdout.split()
    return [ROOT / f for f in out if (ROOT / f).is_file() and not f.endswith((".woff2", ".png"))]


def test_no_api_keys_in_any_committable_file():
    """BR-87: the Gemini key lives only in server-side environment variables."""
    for path in committable_files():
        text = path.read_text(encoding="utf-8", errors="ignore")
        for pat in KEY_PATTERNS:
            assert not re.search(pat, text), f"possible key in {path.relative_to(ROOT)}"
    env = (ROOT / ".env.example").read_text(encoding="utf-8")
    assert "GEMINI_API_KEY=your-gemini-api-key-here" in env


def test_env_files_are_git_ignored():
    for name in (".env", ".env.local", ".env.production"):
        r = subprocess.run(["git", "check-ignore", "-q", name], cwd=ROOT)
        assert r.returncode == 0, name
    assert subprocess.run(["git", "check-ignore", "-q", ".env.example"], cwd=ROOT).returncode == 1


def test_browser_code_holds_no_key_and_calls_only_the_relative_api():
    """BR-87: the browser never talks to Gemini directly; only to same-origin api/gemini, when the user asks."""
    for f in ("assistant.js", "analytics.js", "assist-core.js", "upload.js", "upload-core.js"):
        js = (DOCS / f).read_text(encoding="utf-8")
        assert not re.search(r"https?://", js), f
        assert "GEMINI_API_KEY" not in js and "generativelanguage" not in js
    js = (DOCS / "assistant.js").read_text(encoding="utf-8")
    assert set(re.findall(r'fetch\("([^"]+)"', js)) == {"api/gemini"}
    for f in ("analytics.js", "assist-core.js", "data.js", "upload.js", "upload-core.js"):
        assert "fetch(" not in (DOCS / f).read_text(encoding="utf-8")
    api = (ROOT / "api" / "gemini.js").read_text(encoding="utf-8")
    assert "process.env.GEMINI_API_KEY" in api


def test_service_worker_never_caches_the_api():
    sw = (DOCS / "sw.js").read_text(encoding="utf-8")
    assert 'url.pathname.indexOf("/api/") === 0) return' in sw
    for f in ("assist-core.js", "analytics.js", "assistant.js", "upload-core.js", "upload.js"):
        assert f'"{f}"' in sw


def test_vercel_function_bundles_the_data():
    v = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
    fn = v["functions"]["api/gemini.js"]
    assert "data.js" in fn["includeFiles"] and "assist-core.js" in fn["includeFiles"]
    assert v["outputDirectory"] == "docs"


def test_brief_says_actions_need_human_review(data):
    for scope in data["briefs"].values():
        for lang, b in scope.items():
            assert load_i18n()[lang]["ui"]["brief_review"] in b["text"]


@pytest.mark.skipif(not shutil.which("node"), reason="Node.js not installed")
def test_ai_endpoint_and_evidence_engine_js_suite():
    """BR-80 to BR-87: the mocked Gemini tests in tests/js (no network, no API credits)."""
    files = sorted(str(p) for p in (ROOT / "tests" / "js").glob("*.test.js"))
    env = {"PATH": subprocess.os.environ.get("PATH", "")}           # no GEMINI_API_KEY leaks into the tests
    r = subprocess.run(["node", "--test", *files], cwd=ROOT, capture_output=True, text=True, timeout=120, env=env)
    assert r.returncode == 0, r.stdout[-3000:] + r.stderr[-2000:]
    assert re.search(r"# pass (\d+)|ℹ pass (\d+)", r.stdout)


def test_upload_rules_are_exported_from_rules_yaml(data):
    """BR-91: the browser preview scores with the same weights, tiers and flags as the Python engine."""
    from src.config import load_rules
    r = load_rules()
    assert data["rules"]["weights"] == r["weights"] and data["rules"]["tiers"] == r["tiers"]
    assert data["rules"]["flags"] == {"missing": r["data"]["missing_flags"], "bdl": r["data"]["bdl_flags"]}
    assert data["rules"]["confidence"]["years"] == r["confidence"]["years"]


def test_upload_strings_exist_in_both_languages_and_are_used():
    i = load_i18n()
    ups = {k for k in i["en"]["ui"] if k.startswith("up_")} | {"nav_upload"}
    assert ups == {k for k in i["hi"]["ui"] if k.startswith("up_")} | {"nav_upload"}
    js = (DOCS / "upload.js").read_text(encoding="utf-8")
    used = set(re.findall(r'ui\("(\w+)"', js)) | {"up_e_" + c for c in re.findall(r'code: "(\w+)"', js)}
    assert {u for u in used if u.startswith("up_") and not u.endswith("_")} <= ups
    core = (DOCS / "upload-core.js").read_text(encoding="utf-8")
    codes = set(re.findall(r'err\(rowNo, "(\w+)"', core)) | {"empty", "big", "columns"}
    assert {"up_e_" + c for c in codes} <= ups, {"up_e_" + c for c in codes} - ups


def test_service_worker_files_exist():
    sw = (DOCS / "sw.js").read_text(encoding="utf-8")
    for f in re.findall(r'"([\w./-]+\.(?:js|css|html|svg|webmanifest|woff2))"', sw):
        assert (DOCS / f).is_file(), f
