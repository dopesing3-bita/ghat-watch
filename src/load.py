"""Read the Bhopal ghat CSV and give every reading a status."""
import pandas as pd

from .config import ROOT, load_rules

VALID, BDL, MISSING = "valid", "bdl", "missing"


def reading_status(value, flag, rules):
    """BR-01 / BR-02: valid (numeric), bdl (BDL or ND) or missing. Never 0 for bdl or missing."""
    flag = (flag or "").strip()
    if flag in rules["data"]["bdl_flags"]:
        return BDL
    if flag in rules["data"]["missing_flags"] and flag != "":
        return MISSING
    try:
        float(value)
        return VALID
    except (TypeError, ValueError):
        return MISSING


def load_readings(rules=None, path=None):
    """BR-01, BR-02, BR-03, BR-06: load the Bhopal file only, with status and numeric value.

    `num` holds a float for valid readings and NaN otherwise, so bdl and missing never become 0.
    """
    rules = rules or load_rules()
    df = pd.read_csv(path or ROOT / rules["data"]["file"], dtype=str, keep_default_na=False)
    df["year"] = df["year"].astype(int)
    df["source_page"] = df["source_page"].astype(int)
    df["status"] = [reading_status(v, f, rules) for v, f in zip(df["value"], df["flag"])]
    df["num"] = pd.to_numeric(df["value"].where(df["status"] == VALID), errors="coerce")
    return df
