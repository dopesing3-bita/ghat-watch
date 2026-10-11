"""BR-71: fixed templates and glossary. No runtime AI."""
import yaml

from .config import ROOT

LANGS = ("en", "hi")


def load_i18n():
    """BR-71: load en.yaml, hi.yaml and glossary.yaml."""
    out = {}
    for lang in LANGS:
        with open(ROOT / "i18n" / f"{lang}.yaml", encoding="utf-8") as f:
            out[lang] = yaml.safe_load(f)
    with open(ROOT / "i18n" / "glossary.yaml", encoding="utf-8") as f:
        out["glossary"] = yaml.safe_load(f)
    return out


def term(i18n, group, key, lang):
    """BR-71: one glossary term in one language."""
    return i18n["glossary"][group][key][lang]


def ghat_name(g, lang):
    """Ghat name in the chosen language (Hindi from ghats.yaml)."""
    return g["name_hi"] if lang == "hi" else g["site"]


def reason_fragments(g, rules):
    """BR-60 / BR-13: plain-words facts behind the score, strongest component first, at most 3.

    Returns (template key, params) pairs so English and Hindi carry the same numbers.
    """
    if not g["has_history"]:
        return [("no_history", {})]
    lim = {"do_min": rules["limits"]["do_min"], "bod_max": rules["limits"]["bod_max"]}
    lim = {k: f"{v:g}" for k, v in lim.items()}
    groups = []
    for c in sorted(g["components"], key=lambda c: -c["points"]):
        f, frags = c["facts"], []
        if c["points"] <= 0:
            continue
        if c["key"] == "oxygen":
            frags.append(("oxygen", {**lim, **f}))
            if f["zeros"]:
                frags.append(("oxygen_zero", f))
        elif c["key"] == "organic":
            frags.append(("organic", {**lim, **f}))
            if f["during_high_count"]:
                frags.append(("organic_high", f))
        else:
            frags.append((c["key"], f))
        groups.append(frags)
    return [x for grp in groups for x in grp][:3]


def reason_text(g, rules, i18n, lang):
    """BR-60: one-line plain-words reason in one language."""
    t = i18n[lang]["reason"]
    return t["joiner"].join(t[k].format(**p) for k, p in reason_fragments(g, rules))


def stability_text(rr, i18n, lang):
    """BR-33: rank range in words."""
    t = i18n[lang]["ui"]
    key = "rank_fixed" if rr["min"] == rr["max"] else "rank_range"
    return t[key].format(**rr)
