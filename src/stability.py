"""BR-33: rank stability under random weight sets."""
import math
import random


def rank_ranges(rows, rules):
    """BR-33: recompute ranks under seeded random weights (each sub-weight scaled 1 +/- spread).

    Component points are linear in their weights, so scaling a sub-weight scales its points.
    Ties break as in BR-34. Returns {ghat id: {"min", "max", "top_share"}} and whether rank 1 is stable.
    """
    s = rules["stability"]
    rng = random.Random(s["seed"])
    ghats = [g for g in rows if g["has_history"]]
    keys = sorted({(c["key"], p) for g in ghats for c in g["components"] for p in c["parts"]})
    parts = {g["id"]: {(c["key"], p): v for c in g["components"] for p, v in c["parts"].items()}
             for g in ghats}
    tie = {g["id"]: (g["tie_min_do"] if g["tie_min_do"] is not None else math.inf,
                     -(g["tie_max_during_bod"] or 0.0)) for g in ghats}
    seen = {g["id"]: [] for g in ghats}
    for _ in range(s["runs"]):
        f = {k: rng.uniform(1 - s["spread"], 1 + s["spread"]) for k in keys}
        totals = {gid: sum(v * f[k] for k, v in p.items()) for gid, p in parts.items()}
        order = sorted(totals, key=lambda gid: (-round(totals[gid], 6), *tie[gid]))
        for i, gid in enumerate(order, 1):
            seen[gid].append(i)
    out = {gid: {"min": min(r), "max": max(r), "top_share": round(sum(x == 1 for x in r) / len(r), 3)}
           for gid, r in seen.items()}
    top = next((g["id"] for g in ghats if g["rank"] == 1), None)
    return out, bool(top) and out[top]["max"] == 1
