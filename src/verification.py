"""BR-04: write docs/VERIFICATION.md, 20 app numbers for a teammate to check against the PDF pages."""
from .config import ROOT
from .engine import fmt
from .load import VALID, load_readings
from .sources import page_link, report_file

PICKS = [
    # The four zero DO readings at Bairagarh (the demo story).
    ("Bairagarh (Sant Hirdaram) kund", 2023, "Ganesh", "after", "Dissolved oxygen"),
    ("Bairagarh (Sant Hirdaram) kund", 2023, "Durga", "pre", "Dissolved oxygen"),
    ("Bairagarh (Sant Hirdaram) kund", 2023, "Durga", "during", "Dissolved oxygen"),
    ("Bairagarh (Sant Hirdaram) kund", 2025, "Ganesh", "during", "Dissolved oxygen"),
    ("Bairagarh (Sant Hirdaram) kund", 2024, "Ganesh", "during", "BOD"),
    # Khatlapura 2024 Ganesh metals jump.
    ("Khatlapura ghat", 2024, "Ganesh", "pre", "Copper"),
    ("Khatlapura ghat", 2024, "Ganesh", "during", "Copper"),
    ("Khatlapura ghat", 2024, "Ganesh", "pre", "Chromium"),
    ("Khatlapura ghat", 2024, "Ganesh", "during", "Chromium"),
    # One or two DO / BOD readings at every ghat, across all three reports.
    ("Shahpura lake ghat", 2025, "Durga", "during", "Dissolved oxygen"),
    ("Shahpura lake ghat", 2024, "Durga", "during", "BOD"),
    ("Malikhedi kund", 2025, "Ganesh", "during", "Dissolved oxygen"),
    ("Malikhedi kund", 2023, "Ganesh", "after", "BOD"),
    ("Hathaikheda dam / kund", 2024, "Ganesh", "after", "BOD"),
    ("Hathaikheda dam / kund", 2023, "Durga", "during", "Dissolved oxygen"),
    ("Rani Kamlapati ghat / Kamla Park kund", 2025, "Durga", "pre", "Dissolved oxygen"),
    ("Rani Kamlapati ghat / Kamla Park kund", 2023, "Ganesh", "after", "BOD"),
    ("Prempura ghat", 2024, "Ganesh", "during", "Dissolved oxygen"),
    ("Prempura ghat", 2023, "Durga", "pre", "BOD"),
    ("Khatlapura ghat", 2025, "Durga", "after", "BOD"),
]


def write_verification(path=None):
    """BR-04: one table row per pick, with an empty column for the person who checks it."""
    df = load_readings()
    lines = [
        "# Verification against the PDF pages",
        "",
        "Twenty numbers taken from the app. Open the link, find the ghat table on that page, compare the value,",
        "then write your name in the last column. 'not sampled' means the report shows a blank, _, * or ** there.",
        "",
        "| # | Ghat | Year | Festival | Phase | Parameter | Value in app | As printed | Page | Report | Checked against PDF by |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for i, (site, year, fest, phase, param) in enumerate(PICKS, 1):
        r = df[(df.site == site) & (df.year == year) & (df.festival == fest) & (df.phase == phase)
               & (df.parameter == param)].iloc[0]
        value = fmt(r["num"]) if r["status"] == VALID else ("BDL" if r["status"] == "bdl" else "not sampled")
        lines.append(f"| {i} | {site} | {year} | {fest} | {phase} | {param} | {value} | {r['value_as_printed']} | "
                     f"[p.{r['source_page']}]({page_link(year, r['source_page'])}) | {report_file(year)} | |")
    path = path or ROOT / "docs" / "VERIFICATION.md"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


if __name__ == "__main__":
    print(write_verification())
