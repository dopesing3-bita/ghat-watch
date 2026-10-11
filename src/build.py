"""Pipeline: CSV -> engine -> stability -> brief -> docs/data.js. Run: python -m src.build"""
import argparse
import datetime as dt
import json

from .brief import build_briefs
from .config import ROOT, load_ghats, load_rules
from .engine import evaluate
from .i18n import LANGS, load_i18n, reason_text, stability_text
from .load import BDL, MISSING, VALID, load_readings
from .sources import BASE_URL, CRITERIA_URL, REPO_URL, REPORTS
from .stability import rank_ranges


def build(rules=None, ghats=None, date=None):
    """Run the whole pipeline and return the data object the UI reads."""
    rules = rules or load_rules()
    ghats = ghats or load_ghats()
    i18n = load_i18n()
    date = date or dt.date.today().strftime("%d-%m-%Y")
    df = load_readings(rules)
    result = evaluate(df, ghats, rules)
    ranges, top_stable = {}, {}
    for scope, rows in result["scopes"].items():
        ranges[scope], top_stable[scope] = rank_ranges(rows, rules)
        for g in rows:
            g["rank_range"] = ranges[scope].get(g["id"])
            g["reason"] = {lang: reason_text(g, rules, i18n, lang) for lang in LANGS}
            g["stability"] = ({lang: stability_text(g["rank_range"], i18n, lang) for lang in LANGS}
                              if g["rank_range"] else None)
    return {
        "generated": date,
        "default_scope": result["default_scope"],
        "headline": result["headline"],
        "reporting_limits": result["reporting_limits"],
        "scopes": result["scopes"],
        "top_stable": top_stable,
        "briefs": build_briefs(result, ranges, rules, i18n, date),
        "i18n": {lang: {k: i18n[lang][k] for k in ("ui", "flag", "focus", "help", "site", "actions", "assist", "datapage")} for lang in LANGS},
        "glossary": i18n["glossary"],
        "reports": {str(y): f"{BASE_URL}{f}" for y, f in REPORTS.items()},
        "criteria_url": CRITERIA_URL,
        "repo_url": REPO_URL,
        "stability_runs": rules["stability"]["runs"],
        "tiers": rules["tiers"],
        "limited_below": rules["confidence"]["limited_below"],
        "event": rules["event"],
        "plan": plan_groups(rules),
        "limits": {k: rules["limits"][k] for k in ("class", "do_min", "bod_max", "ph_min", "ph_max")},
        "rules": {k: rules[k] for k in ("weights", "tiers", "confidence")}
                 | {"flags": {"missing": rules["data"]["missing_flags"], "bdl": rules["data"]["bdl_flags"]}},
        "no_limit_parameters": rules["limits"]["no_limit_parameters"],
        "component_max": component_max(rules),
        **readings_table(df, ghats),
    }


def component_max(rules):
    """BR-20 to BR-24: maximum points of each score component, read from rules.yaml."""
    w = rules["weights"]
    return {"oxygen": w["oxygen"]["share_below_min"] + w["oxygen"]["any_below"] + w["oxygen"]["any_zero"],
            "organic": w["organic"]["share_above_max"] + w["organic"]["during_high"],
            "ph": w["ph"]["share_outside"], "impact": w["impact"]["share_worse"], "recovery": w["recovery"]["share_worse"]}


def readings_table(df, ghats):
    """BR-65: every reading for the analytics screens, in a compact form.

    Row: [ghat index, year, festival index, phase index, parameter index, value or null, status, source page].
    Status is valid / bdl / missing (BR-01, BR-02): bdl and missing rows never carry a number.
    """
    ids = [g["id"] for g in ghats]
    site_to_idx = {g["site"]: i for i, g in enumerate(ghats)}
    params = list(dict.fromkeys(df["parameter"]))
    fests, phases = ["Ganesh", "Durga"], ["pre", "during", "after"]
    units = {p: (df[df["parameter"] == p]["unit_assumed"].iloc[0] or None) for p in params}
    rows = []
    for _, r in df.iterrows():
        v = None if r["status"] != VALID else round(float(r["num"]), 4)
        rows.append([site_to_idx[r["site"]], int(r["year"]), fests.index(r["festival"]), phases.index(r["phase"]),
                     params.index(r["parameter"]), v, r["status"], int(r["source_page"])])
    counts = df["status"].value_counts().to_dict()
    return {"readings": {"ghat_ids": ids, "festivals": fests, "phases": phases, "parameters": params,
                         "units": units, "rows": rows},
            "dataset": {"file": "data/bhopal_ghats_2023_2025.csv", "rows": int(len(df)),
                        "years": sorted(int(y) for y in df["year"].unique()),
                        "ghats_with_data": int(df["site"].nunique()), "ghats_in_register": len(ghats),
                        "status_counts": {k: int(counts.get(k, 0)) for k in (VALID, BDL, MISSING)}}}


def plan_groups(rules):
    """BR-61: before / during / after groups of suggested actions. Every BR-60 action sits in exactly one."""
    groups = {k: list(rules["plan"][k]) for k in ("before", "during", "after")}
    keys = [a for g in groups.values() for a in g]
    if len(keys) != len(set(keys)):
        raise ValueError("rules.yaml plan: an action is listed in more than one group")
    return groups


def write_data_js(data, path=None):
    """Write window.GHAT_DATA so index.html works from disk (no fetch, no server)."""
    path = path or ROOT / "docs" / "data.js"
    path.write_text("window.GHAT_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
                    encoding="utf-8")
    return path


def print_table(data, scope):
    """Ranked table with every component, for the data verifier."""
    print(f"\nScope: {scope}   (top rank stable: {data['top_stable'][scope]})")
    print(f"{'#':>2}  {'Ghat':38} {'Total':>5} {'Oxy':>5} {'Org':>5} {'pH':>4} {'Imp':>5} {'Rec':>5} "
          f"{'Tier':>4} {'Conf':>5} {'Range':>6}  Flags")
    for g in data["scopes"][scope]:
        if not g["has_history"]:
            print(f"{'-':>2}  {g['site']:38} {'No history':>5}  -> {', '.join(g['focus'])}")
            continue
        c = {x["key"]: x["points"] for x in g["components"]}
        rr = g["rank_range"]
        print(f"{g['rank']:>2}  {g['site']:38} {g['total']:>5} {c['oxygen']:>5.1f} {c['organic']:>5.1f} "
              f"{c['ph']:>4.1f} {c['impact']:>5.1f} {c['recovery']:>5.1f} {g['tier']:>4} "
              f"{g['confidence']:>5.0%} {rr['min']:>3}-{rr['max']:<2}  {', '.join(g['flags'])}")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--date", help="Brief date, dd-mm-yyyy (default: today)")
    args = ap.parse_args()
    data = build(date=args.date)
    path = write_data_js(data)
    for scope in data["scopes"]:
        print_table(data, scope)
    print(f"\nWrote {path.relative_to(ROOT)} ({path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
