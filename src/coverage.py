"""Count valid, bdl and missing readings, and the expected DO and BOD readings."""
import pandas as pd

from .load import BDL, MISSING, VALID

CORE = ["Dissolved oxygen", "BOD"]


def coverage_counts(df):
    """BR-32: valid, bdl and missing counts per ghat, year, festival and phase."""
    counts = df.groupby(["site", "year", "festival", "phase", "status"]).size().unstack(fill_value=0)
    for col in (VALID, BDL, MISSING):
        if col not in counts:
            counts[col] = 0
    return counts[[VALID, BDL, MISSING]].reset_index()


def core_grid(df, site, rules, festivals=None):
    """BR-01 / BR-32: DO and BOD status for every expected (year, festival, phase) cell.

    A cell with no row in the data is 'missing' (no table in the report), never clean.
    """
    conf = rules["confidence"]
    festivals = festivals or conf["festivals"]
    sub = df[(df["site"] == site) & df["parameter"].isin(CORE)]
    cells = []
    for year in conf["years"]:
        for fest in festivals:
            for phase in conf["phases"]:
                for param in CORE:
                    row = sub[(sub["year"] == year) & (sub["festival"] == fest)
                              & (sub["phase"] == phase) & (sub["parameter"] == param)]
                    if row.empty:
                        cells.append(dict(year=year, festival=fest, phase=phase, parameter=param,
                                          status=MISSING, value=None, source_page=None, no_table=True))
                    else:
                        r = row.iloc[0]
                        cells.append(dict(year=year, festival=fest, phase=phase, parameter=param,
                                          status=r["status"],
                                          value=None if pd.isna(r["num"]) else float(r["num"]),
                                          source_page=int(r["source_page"]), no_table=False))
    return cells


def confidence(cells):
    """BR-32: valid DO and BOD readings divided by expected readings."""
    if not cells:
        return 0.0
    return sum(c["status"] == VALID for c in cells) / len(cells)
