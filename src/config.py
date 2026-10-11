"""Load rules.yaml and ghats.yaml. No thresholds are defined in code."""
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent


def load_rules(path=None):
    """Return the rules dict from rules.yaml (all BR thresholds and weights)."""
    with open(path or ROOT / "rules.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_ghats(path=None):
    """BR-50: return the ghat register from ghats.yaml."""
    with open(path or ROOT / "ghats.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)["ghats"]
