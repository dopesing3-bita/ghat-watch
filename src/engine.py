"""Rules engine: CPCB class B comparison, component scores, metals flags, tiers and ranking."""
import math

import pandas as pd

from .coverage import confidence, core_grid
from .load import BDL, MISSING, VALID
from .sources import page_link, report_file

DO, BOD, PH = "Dissolved oxygen", "BOD", "pH"
PHASE_ORDER = {"pre": 0, "during": 1, "after": 2}
FEST_ORDER = {"Ganesh": 0, "Durga": 1}


def fmt(x):
    """Format a number the same way everywhere (UI, brief, tests): 4.0 -> '4', 0.031 -> '0.031'."""
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    x = round(float(x), 3)
    return str(int(x)) if x == int(x) else f"{x:g}"


def limit_text(parameter, rules):
    """BR-10 / BR-11: the class B limit as text, or None when class B sets no limit."""
    lim = rules["limits"]
    if parameter == DO:
        return f">= {fmt(lim['do_min'])}"
    if parameter == BOD:
        return f"<= {fmt(lim['bod_max'])}"
    if parameter == PH:
        return f"{fmt(lim['ph_min'])} to {fmt(lim['ph_max'])}"
    return None


def verdict(parameter, status, value, rules):
    """BR-10, BR-11, BR-01, BR-02: pass, fail, bdl, not_sampled or no_limit for one reading."""
    if status == MISSING:
        return "not_sampled"
    if status == BDL:
        return "bdl"
    lim = rules["limits"]
    if parameter == DO:
        return "fail" if value < lim["do_min"] else "pass"
    if parameter == BOD:
        return "fail" if value > lim["bod_max"] else "pass"
    if parameter == PH:
        return "fail" if not (lim["ph_min"] <= value <= lim["ph_max"]) else "pass"
    return "no_limit"


def evidence_row(r, rules):
    """BR-03, BR-04: one reading with its unit, limit, verdict, report file, page and link."""
    value = None if pd.isna(r["num"]) else float(r["num"])
    return {
        "year": int(r["year"]), "festival": r["festival"], "phase": r["phase"],
        "parameter": r["parameter"], "value": fmt(value), "status": r["status"],
        "as_printed": r["value_as_printed"], "unit": r["unit_assumed"] or None,
        "limit": limit_text(r["parameter"], rules),
        "verdict": verdict(r["parameter"], r["status"], value, rules),
        "source_page": int(r["source_page"]), "report": report_file(r["year"]),
        "link": page_link(r["year"], r["source_page"]),
    }


def _sorted_rows(sub):
    return sub.assign(_f=sub["festival"].map(FEST_ORDER), _p=sub["phase"].map(PHASE_ORDER)) \
              .sort_values(["year", "_f", "_p"])


def _rows(sub, parameter, rules):
    return [evidence_row(r, rules) for _, r in _sorted_rows(sub[sub["parameter"] == parameter]).iterrows()]


def _share(n, d):
    return n / d if d else 0.0


def oxygen_component(sub, rules):
    """BR-20: oxygen stress, up to 40 points."""
    w = rules["weights"]["oxygen"]
    rows = _rows(sub, DO, rules)
    vals = [float(r["value"]) for r in rows if r["status"] == VALID]
    below = sum(v < rules["limits"]["do_min"] for v in vals)
    any_low = any(v < w["any_below_value"] for v in vals)
    zeros = sum(v == 0 for v in vals)
    parts = {
        "share": w["share_below_min"] * _share(below, len(vals)),
        "any_low": w["any_below"] if any_low else 0.0,
        "zero": w["any_zero"] if zeros else 0.0,
    }
    facts = {"below": below, "valid": len(vals), "zeros": zeros,
             "min": fmt(min(vals)) if vals else None, "any_low": any_low}
    return _component("oxygen", parts, w["share_below_min"] + w["any_below"] + w["any_zero"], facts, rows)


def organic_component(sub, rules):
    """BR-21: organic load, up to 25 points."""
    w = rules["weights"]["organic"]
    rows = _rows(sub, BOD, rules)
    valid = [r for r in rows if r["status"] == VALID]
    above = sum(float(r["value"]) > rules["limits"]["bod_max"] for r in valid)
    during = [float(r["value"]) for r in valid if r["phase"] == "during"]
    high = [v for v in during if v >= w["during_high_value"]]
    parts = {
        "share": w["share_above_max"] * _share(above, len(valid)),
        "during_high": w["during_high"] if high else 0.0,
    }
    facts = {"above": above, "valid": len(valid), "during_high_count": len(high),
             "max_during": fmt(max(during)) if during else None,
             "max": fmt(max(float(r["value"]) for r in valid)) if valid else None}
    return _component("organic", parts, w["share_above_max"] + w["during_high"], facts, rows)


def ph_component(sub, rules):
    """BR-22: pH outside 6.5 to 8.5, up to 5 points."""
    w = rules["weights"]["ph"]
    rows = _rows(sub, PH, rules)
    valid = [r for r in rows if r["status"] == VALID]
    outside = sum(r["verdict"] == "fail" for r in valid)
    parts = {"share": w["share_outside"] * _share(outside, len(valid))}
    return _component("ph", parts, w["share_outside"], {"outside": outside, "valid": len(valid)}, rows)


def _pairs(sub, events, later_phase, min_change, strict, rules):
    """BR-23 / BR-24: compare pre with a later phase per (year, festival, DO or BOD).

    Only pairs with both values valid are tested. All others are returned as not testable.
    """
    tested, not_testable = [], []
    for year, fest in events:
        for param in (DO, BOD):
            ev = sub[(sub["year"] == year) & (sub["festival"] == fest) & (sub["parameter"] == param)]
            pre = ev[ev["phase"] == "pre"]
            later = ev[ev["phase"] == later_phase]
            base = {"year": year, "festival": fest, "parameter": param}
            if pre.empty or later.empty:
                not_testable.append({**base, "reason": "no_table"})
                continue
            pre_r, later_r = pre.iloc[0], later.iloc[0]
            if pre_r["status"] != VALID or later_r["status"] != VALID:
                gap = [p for p, r in (("pre", pre_r), (later_phase, later_r)) if r["status"] != VALID]
                not_testable.append({**base, "reason": "not_sampled", "phases": gap,
                                     "source_page": int(pre_r["source_page"])})
                continue
            change = later_r["num"] - pre_r["num"] if param == BOD else pre_r["num"] - later_r["num"]
            worse = change > min_change if strict else change >= min_change - 1e-9
            tested.append({**base, "pre": fmt(pre_r["num"]), later_phase: fmt(later_r["num"]),
                           "change": fmt(change), "worse": bool(worse),
                           "source_page": int(pre_r["source_page"]),
                           "link": page_link(year, pre_r["source_page"]), "report": report_file(year)})
    return tested, not_testable


def impact_component(sub, events, rules):
    """BR-23: immersion impact, during worse than pre by at least 1 mg/l, up to 20 points."""
    w = rules["weights"]["impact"]
    tested, nt = _pairs(sub, events, "during", w["min_change"], False, rules)
    worse = sum(p["worse"] for p in tested)
    parts = {"share": w["share_worse"] * _share(worse, len(tested))}
    facts = {"worse": worse, "tested": len(tested), "not_testable": len(nt)}
    return _component("impact", parts, w["share_worse"], facts, tested, nt)


def recovery_component(sub, events, rules):
    """BR-24: recovery, after one week worse than pre by more than 0.5 mg/l, up to 10 points."""
    w = rules["weights"]["recovery"]
    tested, nt = _pairs(sub, events, "after", w["min_change"], True, rules)
    worse = sum(p["worse"] for p in tested)
    parts = {"share": w["share_worse"] * _share(worse, len(tested))}
    facts = {"worse": worse, "tested": len(tested), "not_testable": len(nt)}
    return _component("recovery", parts, w["share_worse"], facts, tested, nt)


def _component(key, parts, max_points, facts, evidence, not_testable=None):
    return {"key": key, "points": round(sum(parts.values()), 2), "max": max_points,
            "parts": parts, "facts": facts, "evidence": evidence, "not_testable": not_testable or []}


def reporting_limit_values(df, rules):
    """BR-26: (metal, year, festival) where every numeric reading has the same value.

    Checked per festival because each festival is a separate set of tables in the report.
    """
    m = rules["metals"]
    out = {}
    for (param, year, fest), g in df[df["parameter"].isin(m["parameters"]) & (df["status"] == VALID)] \
            .groupby(["parameter", "year", "festival"]):
        vals = g["num"].round(6).unique()
        if len(vals) == 1 and len(g) >= m["reporting_limit_min_readings"]:
            out[(param, int(year), fest)] = {"parameter": param, "year": int(year), "festival": fest,
                                             "value": fmt(vals[0]), "count": int(len(g))}
    return out


def metals(sub, events, rl, rules):
    """BR-25 / BR-26: metal readings, spikes (no points) and possible reporting-limit values."""
    m = rules["metals"]
    rows, spikes = [], []
    for param in m["parameters"]:
        for r in _rows(sub, param, rules):
            r["reporting_limit"] = (param, r["year"], r["festival"]) in rl
            rows.append(r)
    for year, fest in events:
        for param in m["parameters"]:
            if (param, year, fest) in rl:
                continue
            ev = sub[(sub["year"] == year) & (sub["festival"] == fest) & (sub["parameter"] == param)]
            pre, dur = ev[ev["phase"] == "pre"], ev[ev["phase"] == "during"]
            if pre.empty or dur.empty:
                continue
            p, d = pre.iloc[0], dur.iloc[0]
            kind = None
            if p["status"] == VALID and d["status"] == VALID and p["num"] > 0 \
                    and d["num"] >= m["spike_ratio"] * p["num"]:
                kind = "ratio"
            elif p["status"] == BDL and d["status"] == VALID:
                kind = "bdl_to_detected"
            if kind:
                spikes.append({"year": year, "festival": fest, "parameter": param, "kind": kind,
                               "pre": fmt(p["num"]) if p["status"] == VALID else "BDL",
                               "during": fmt(d["num"]),
                               "ratio": fmt(d["num"] / p["num"]) if kind == "ratio" else None,
                               "source_page": int(d["source_page"]),
                               "link": page_link(year, d["source_page"]), "report": report_file(year)})
    return rows, spikes


def tier(total, rules):
    """BR-30: Priority 1, 2 or 3. There is no green tier."""
    t = rules["tiers"]
    return 1 if total >= t["priority_1"] else 2 if total >= t["priority_2"] else 3


def focus(components, spikes, cells, rules):
    """BR-60: suggested focus. The officer decides."""
    f, c = rules["focus"], {k["key"]: k["points"] for k in components}
    out = []
    if c["oxygen"] >= f["oxygen"]:
        out.append("do_check")
    if c["organic"] >= f["organic"]:
        out.append("cleaning")
    if c["impact"] >= f["impact"]:
        out.append("test_during")
    if c["recovery"] >= f["recovery"]:
        out.append("retest_after")
    if spikes:
        out.append("metals")
    if any(x["status"] == MISSING for x in cells):
        out.append("fill_gap")
    return out


def scope_events(scope, rules):
    """BR-40: (year, festival) events in scope for a ghat, in time order."""
    fests = ["Durga"] if scope == "durga" else rules["confidence"]["festivals"]
    return [(y, f) for y in rules["confidence"]["years"] for f in fests]


def score_ghat(df, ghat, scope, rl, rules):
    """BR-20 to BR-26, BR-30, BR-32, BR-05, BR-60: everything about one ghat in one scope."""
    site = ghat["site"]
    sub = df[df["site"] == site]
    if scope == "durga":
        sub = sub[sub["festival"] == "Durga"]
    events = scope_events(scope, rules)
    comps = [oxygen_component(sub, rules), organic_component(sub, rules), ph_component(sub, rules),
             impact_component(sub, events, rules), recovery_component(sub, events, rules)]
    metal_rows, spikes = metals(sub, events, rl, rules)
    cells = core_grid(df, site, rules, ["Durga"] if scope == "durga" else None)
    conf = confidence(cells)
    total = round(sum(c["points"] for c in comps), 1)
    do_vals = sub[(sub["parameter"] == DO) & (sub["status"] == VALID)]["num"]
    bod_dur = sub[(sub["parameter"] == BOD) & (sub["status"] == VALID) & (sub["phase"] == "during")]["num"]
    flags = []
    if (sub["site_match_confidence"] == "medium").any():
        flags.append("identity_uncertain")
    if conf < rules["confidence"]["limited_below"]:
        flags.append("limited_data")
    if spikes:
        flags.append("metals_spike")
    if any(r["reporting_limit"] for r in metal_rows):
        flags.append("reporting_limit")
    return {
        "id": ghat["id"], "site": site, "name_hi": ghat["name_hi"], "water_body": ghat["water_body"],
        "designated_2026": ghat["designated_2026"], "register_source": ghat["source"],
        "has_history": True, "total": total, "tier": tier(total, rules),
        "confidence": round(conf, 3), "components": comps, "metals": metal_rows, "spikes": spikes,
        "coverage": cells, "flags": flags, "focus": focus(comps, spikes, cells, rules),
        "tie_min_do": float(do_vals.min()) if len(do_vals) else None,
        "tie_max_during_bod": float(bod_dur.max()) if len(bod_dur) else None,
    }


def tie_key(g):
    """BR-34: higher total first, then lowest DO ever, then highest during-immersion BOD."""
    return (-g["total"], g["tie_min_do"] if g["tie_min_do"] is not None else math.inf,
            -(g["tie_max_during_bod"] or 0.0))


def no_history_row(ghat):
    """BR-32: a designated ghat with no readings gets a No history row and a baseline action."""
    return {"id": ghat["id"], "site": ghat["site"], "name_hi": ghat["name_hi"],
            "water_body": ghat["water_body"], "designated_2026": ghat["designated_2026"],
            "register_source": ghat["source"], "has_history": False, "total": None, "tier": None,
            "rank": None, "confidence": 0.0, "components": [], "metals": [], "spikes": [],
            "coverage": [], "flags": ["no_history"], "focus": ["baseline_test"]}


def rank_scope(df, ghats, scope, rules, rl=None):
    """BR-30, BR-34, BR-32: rank ghats with history; No history rows go to the bottom."""
    rl = reporting_limit_values(df, rules) if rl is None else rl
    scored = [score_ghat(df, g, scope, rl, rules) for g in ghats if g["in_data"]]
    scored.sort(key=tie_key)
    for i, g in enumerate(scored, 1):
        g["rank"] = i
    return scored + [no_history_row(g) for g in ghats if not g["in_data"]]


def headline(df, rules):
    """BR-31: data-wide counts shown on every screen, so no ghat looks like it meets the limit."""
    lim = rules["limits"]
    do = df[(df["parameter"] == DO) & (df["status"] == VALID)]["num"]
    bod = df[(df["parameter"] == BOD) & (df["status"] == VALID)]["num"]
    return {"bod_above": int((bod > lim["bod_max"]).sum()), "bod_valid": int(len(bod)),
            "do_below": int((do < lim["do_min"]).sum()), "do_valid": int(len(do)),
            "do_zero": int((do == 0).sum()), "bod_max": fmt(lim["bod_max"]), "do_min": fmt(lim["do_min"])}


def evaluate(df, ghats, rules):
    """BR-40: rank in both scopes, flag ghats whose rank moves by 2 or more places."""
    rl = reporting_limit_values(df, rules)
    scopes = {s: rank_scope(df, ghats, s, rules, rl) for s in ("all", "durga")}
    ranks = {s: {g["id"]: g["rank"] for g in rows} for s, rows in scopes.items()}
    shift = rules["scope"]["rank_shift_flag"]
    for s, rows in scopes.items():
        other = "durga" if s == "all" else "all"
        for g in rows:
            a, b = g["rank"], ranks[other][g["id"]]
            g["other_scope_rank"] = b
            if a is not None and b is not None and abs(a - b) >= shift:
                g["flags"].append("scope_shift")
    return {"scopes": scopes, "headline": headline(df, rules),
            "reporting_limits": list(rl.values()), "default_scope": rules["scope"]["default"]}
