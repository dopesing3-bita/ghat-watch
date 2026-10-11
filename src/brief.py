"""BR-70 to BR-72: the one-page Hindi and English brief."""
from .i18n import LANGS, ghat_name, reason_text, stability_text, term
from .load import MISSING
from .sources import BASE_URL, REPORTS


def _pages(g):
    """BR-04: report pages behind a ghat's DO and BOD readings, grouped by year."""
    by_year = {}
    for c in g["components"]:
        if c["key"] in ("oxygen", "organic"):
            for r in c["evidence"]:
                by_year.setdefault(r["year"], set()).add(r["source_page"])
    return "; ".join(f"{y} p.{', '.join(str(p) for p in sorted(ps))}" for y, ps in sorted(by_year.items()))


def gaps(rows):
    """BR-01 / BR-32: ghats with no history, events with no table, other not-sampled cells."""
    no_hist = [g for g in rows if not g["has_history"]]
    no_table, other = {}, 0
    for g in rows:
        seen = set()
        for c in g["coverage"]:
            if c["no_table"]:
                key = (c["year"], c["festival"])
                if key not in seen:
                    no_table.setdefault(key, []).append(g)
                    seen.add(key)
            elif c["status"] == MISSING:
                other += 1
    return no_hist, no_table, other


def build_brief(result, scope, ranges, rules, i18n, lang, date):
    """BR-70, BR-71, BR-72: the brief as blocks (for screen and print) and plain text (for copy)."""
    t, ui = i18n[lang]["brief"], i18n[lang]["ui"]
    rows = result["scopes"][scope]
    head = result["headline"]
    blocks = [("h1", t["title"]),
              ("p", t["prepared"].format(date=date, scope=ui["scope_all" if scope == "all" else "scope_durga"])),
              ("p", ui["headline"].format(**head)),
              ("h2", t["top"])]
    for g in [g for g in rows if g["has_history"]][:3]:
        blocks.append(("h3", t["ghat_line"].format(rank=g["rank"], name=ghat_name(g, lang),
                                                   total=f"{g['total']:g}",
                                                   tier=term(i18n, "tier", g["tier"], lang))))
        blocks.append(("li", t["numbers"].format(reason=reason_text(g, rules, i18n, lang))))
        blocks.append(("li", stability_text(ranges[g["id"]], i18n, lang)))
        blocks.append(("li", t["focus_line"].format(
            focus=t["sep"].join(i18n[lang]["focus"][f] for f in g["focus"]))))
        blocks.append(("li", t["pages"].format(pages=_pages(g))))
    no_hist, no_table, other = gaps(rows)
    blocks.append(("h2", t["gaps"]))
    for g in no_hist:
        blocks.append(("li", t["gap_no_history"].format(name=ghat_name(g, lang))))
    for (year, fest), gs in sorted(no_table.items()):
        blocks.append(("li", t["gap_no_table"].format(
            names=t["sep"].join(ghat_name(g, lang) for g in gs), year=year,
            festival=term(i18n, "festival", fest, lang))))
    if other:
        blocks.append(("li", t["gap_cells"].format(count=other)))
    blocks.append(("li", t["gap_coliform"]))
    blocks.append(("box_h", t["honesty"]))
    for k in ("honesty_units", "honesty_relative", "honesty_coliform", "honesty_metals", "honesty_health"):
        blocks.append(("box", t[k].format(**head)))
    blocks.append(("p", ui["brief_review"]))
    blocks.append(("h2", t["sources"]))
    for year in sorted(REPORTS):
        blocks.append(("src", f"{BASE_URL}{REPORTS[year]}"))
    blocks = [{"type": k, "text": v} for k, v in blocks]
    return {"lang": lang, "blocks": blocks, "text": to_text(blocks)}


def to_text(blocks):
    """BR-70: plain text for copy and WhatsApp share."""
    lines = []
    for b in blocks:
        if b["type"] in ("h1", "h2", "box_h"):
            lines += ["", f"*{b['text']}*"] if lines else [f"*{b['text']}*"]
        elif b["type"] in ("li", "box", "src"):
            lines.append(f"- {b['text']}")
        else:
            lines.append(b["text"])
    return "\n".join(lines).strip()


def build_briefs(result, ranges_by_scope, rules, i18n, date):
    """BR-71: both languages for both scopes, from the same numbers."""
    return {s: {lang: build_brief(result, s, ranges_by_scope[s], rules, i18n, lang, date) for lang in LANGS}
            for s in result["scopes"]}
