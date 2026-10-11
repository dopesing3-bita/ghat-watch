"""Rules engine tests (BR-10 to BR-34, BR-40, BR-60)."""
import copy

import pytest

from src.config import load_ghats
from src.engine import evaluate, verdict
from src.stability import rank_ranges


@pytest.fixture(scope="module")
def result(df, rules):
    return evaluate(df, load_ghats(), rules)


def by_id(rows):
    return {g["id"]: g for g in rows}


def test_bairagarh_first(result):
    top = result["scopes"]["all"][0]
    assert top["id"] == "bairagarh" and top["rank"] == 1
    assert top["total"] == pytest.approx(81.9, abs=1)
    assert top["tier"] == 1


def test_prempura_last_ranked(result):
    ranked = [g for g in result["scopes"]["all"] if g["has_history"]]
    assert ranked[-1]["id"] == "prempura"
    assert ranked[-1]["total"] == pytest.approx(21.1, abs=1)


def test_prototype_order(result):
    """Matches the prototype ranking in the build plan."""
    order = [g["id"] for g in result["scopes"]["all"] if g["has_history"]]
    assert order == ["bairagarh", "shahpura", "malikhedi", "hathaikheda", "khatlapura",
                     "rani-kamlapati", "prempura"]


def test_component_maxima(result):
    maxima = {"oxygen": 40, "organic": 25, "ph": 5, "impact": 20, "recovery": 10}
    for g in result["scopes"]["all"]:
        for c in g["components"]:
            assert 0 <= c["points"] <= maxima[c["key"]]


def test_class_b_edges(rules):
    """BR-10: DO of exactly 5 and BOD of exactly 3 pass; missing and BDL are never pass or fail."""
    assert verdict("Dissolved oxygen", "valid", 5.0, rules) == "pass"
    assert verdict("Dissolved oxygen", "valid", 4.99, rules) == "fail"
    assert verdict("BOD", "valid", 3.0, rules) == "pass"
    assert verdict("BOD", "valid", 3.01, rules) == "fail"
    assert verdict("pH", "valid", 8.6, rules) == "fail"
    assert verdict("BOD", "missing", None, rules) == "not_sampled"
    assert verdict("Copper", "bdl", None, rules) == "bdl"


def test_no_limit_parameters_never_fail(rules):
    """BR-11."""
    for p in rules["limits"]["no_limit_parameters"]:
        assert verdict(p, "valid", 9999.0, rules) == "no_limit"


def test_weight_change_changes_output(df, rules):
    """Weights live in rules.yaml: change one, the output changes with no code change."""
    r2 = copy.deepcopy(rules)
    r2["weights"]["oxygen"]["any_zero"] = 0
    a = by_id(evaluate(df, load_ghats(), rules)["scopes"]["all"])["bairagarh"]["total"]
    b = by_id(evaluate(df, load_ghats(), r2)["scopes"]["all"])["bairagarh"]["total"]
    assert a - b == pytest.approx(10, abs=0.05)


def test_missing_phase_excluded_and_reported(result):
    """BR-23: Prempura 2023 Durga BOD is not sampled, so that pair is not testable and listed."""
    g = by_id(result["scopes"]["all"])["prempura"]
    impact = next(c for c in g["components"] if c["key"] == "impact")
    nt = [p for p in impact["not_testable"] if p["year"] == 2023 and p["festival"] == "Durga"
          and p["parameter"] == "BOD"]
    assert nt and nt[0]["reason"] == "not_sampled"
    assert all(not (p["year"] == 2023 and p["festival"] == "Durga" and p["parameter"] == "BOD")
               for p in impact["evidence"])
    assert impact["facts"]["not_testable"] >= 1


def test_no_table_reported(result):
    """BR-01 / BR-23: Bairagarh Durga 2025 has no table: not testable, coverage cells missing."""
    g = by_id(result["scopes"]["all"])["bairagarh"]
    impact = next(c for c in g["components"] if c["key"] == "impact")
    assert any(p["reason"] == "no_table" and p["year"] == 2025 and p["festival"] == "Durga"
               for p in impact["not_testable"])
    assert "limited_data" in g["flags"]


def test_reporting_limit_values(result):
    """BR-26: 2025 chromium (both festivals) and 2025 Ganesh lead."""
    rl = {(r["parameter"], r["year"], r["festival"]) for r in result["reporting_limits"]}
    assert ("Chromium", 2025, "Ganesh") in rl and ("Chromium", 2025, "Durga") in rl
    assert ("Lead", 2025, "Ganesh") in rl
    assert ("Lead", 2025, "Durga") not in rl


def test_khatlapura_2024_metal_spike(result):
    """BR-25: copper 0.081 -> 2.66 and chromium 0.09 -> 1.98 at Khatlapura, Ganesh 2024."""
    g = by_id(result["scopes"]["all"])["khatlapura"]
    spikes = {(s["year"], s["festival"], s["parameter"]): s for s in g["spikes"]}
    assert spikes[(2024, "Ganesh", "Copper")]["during"] == "2.66"
    assert spikes[(2024, "Ganesh", "Chromium")]["pre"] == "0.09"
    assert "metals_spike" in g["flags"]


def test_metals_give_no_points(result):
    for g in result["scopes"]["all"]:
        assert {c["key"] for c in g["components"]} <= {"oxygen", "organic", "ph", "impact", "recovery"}


def test_identity_uncertain(result):
    """BR-05."""
    assert "identity_uncertain" in by_id(result["scopes"]["all"])["rani-kamlapati"]["flags"]


def test_no_history_row(result):
    """BR-32: Arch Bridge sits at the bottom with a baseline action."""
    last = result["scopes"]["all"][-1]
    assert last["id"] == "arch-bridge" and not last["has_history"]
    assert last["rank"] is None and last["focus"] == ["baseline_test"]


def test_tiers(result, rules):
    """BR-30: no green tier."""
    for g in result["scopes"]["all"]:
        if g["has_history"]:
            assert g["tier"] in (1, 2, 3)


def test_headline(result):
    """BR-31."""
    h = result["headline"]
    assert (h["bod_above"], h["bod_valid"], h["do_below"], h["do_valid"]) == (100, 112, 42, 116)


def test_durga_scope_and_shift_flag(result):
    """BR-40: Durga-only scope uses Durga rows only; rank shifts of 2+ are flagged."""
    durga = by_id(result["scopes"]["durga"])
    for g in durga.values():
        for c in g["components"]:
            for r in c["evidence"]:
                assert r["festival"] == "Durga"
    allr = by_id(result["scopes"]["all"])
    for gid, g in allr.items():
        if g["rank"] and durga[gid]["rank"]:
            moved = abs(g["rank"] - durga[gid]["rank"]) >= 2
            assert moved == ("scope_shift" in g["flags"])


def test_stability_deterministic(result, rules):
    """BR-33: same seed, same ranges; Bairagarh holds rank 1."""
    a, top_a = rank_ranges(result["scopes"]["all"], rules)
    b, top_b = rank_ranges(result["scopes"]["all"], rules)
    assert a == b and top_a == top_b
    assert a["bairagarh"] == {"min": 1, "max": 1, "top_share": 1.0}
    for g in result["scopes"]["all"]:
        if g["has_history"]:
            assert a[g["id"]]["min"] <= g["rank"] <= a[g["id"]]["max"]


def test_ties_break_on_lowest_do(df, rules):
    """BR-34: with all weights zero, every total ties and lowest DO ever decides."""
    r2 = copy.deepcopy(rules)
    for comp in r2["weights"].values():
        for k in comp:
            if not k.endswith("_value") and k != "min_change":
                comp[k] = 0
    rows = [g for g in evaluate(df, load_ghats(), r2)["scopes"]["all"] if g["has_history"]]
    mins = [g["tie_min_do"] for g in rows]
    assert mins == sorted(mins)


def test_focus(result):
    """BR-60."""
    g = by_id(result["scopes"]["all"])["bairagarh"]
    assert {"do_check", "cleaning", "test_during", "retest_after", "metals", "fill_gap"} <= set(g["focus"])
