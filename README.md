# Ghat Watch

**Team:** _TODO team name_ · **Members:** _TODO name (role), name (role), name (role), name (role)_
**Track:** Track 2, Visarjan Ghat Watch · Claude Impact Lab Bhopal, 11 October 2026
**Built for:** the Bhopal Municipal Corporation officer who plans Durga visarjan on **20 October 2026** and decides where to send extra cleaning, aeration and water testing.

Ghat Watch ranks Bhopal's immersion ghats by the water-quality risk recorded in three years of MPPCB reports (2023 to 2025, Ganesh and Durga). It shows the plain-words reason for each rank and every reading behind it, each linked to its report page. It also produces a one-page brief in Hindi and English that the officer can forward.

It is deterministic. There is no language model, no API key, no server and no network call. The officer opens one file.

## How to run

1. Download or clone this repo.
2. Open `docs/index.html` in any browser (double-click it). That's it. It works offline.

To rebuild the data after editing `rules.yaml` or `ghats.yaml` (Python 3.11):

3. `python3.11 -m venv .venv && .venv/bin/pip install -r requirements.txt`
4. `.venv/bin/python -m src.build` writes `docs/data.js` and prints the ranked table.
5. `.venv/bin/pytest` runs the 46 tests.

`docs/` can also be served from any static web server (for example GitHub Pages or an MPSeDC server).

## The three screens

1. **Ranking.** Ghats with tier, score out of 100, a one-line reason, data coverage, rank range and badges (limited data, identity uncertain, metals spike, possible reporting-limit value). A toggle switches between all festivals and Durga only; English/Hindi is switched the same way. Arch Bridge is shown as **No history**.
2. **Ghat detail.** The five score components as bars. Under each is the exact readings table: year, festival, phase, value (unit assumed), class B limit, result, and a **Report p.N** link to that page of the official PDF. Below that are a DO/BOD coverage grid, where missing cells are hatched and never green, and the metals table.
3. **Brief.** One A4 page in Hindi or English: top 3 ghats with their numbers, data gaps, an honesty box and sources. Buttons: copy text, share on WhatsApp, print or save as PDF.

Tip: `docs/index.html?lang=hi` opens straight in Hindi; `?scope=durga` opens the Durga-only view.

## How the ranking works

All rules are in [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md) (BR ids). All numbers are in [rules.yaml](rules.yaml).

- Readings are compared with **CPCB class B** (organised outdoor bathing): DO at least 5 mg/l, BOD at most 3 mg/l, pH 6.5 to 8.5.
- Score out of 100: oxygen stress (40), organic load (25), pH (5), **immersion impact** (20: was the water worse during immersion than before?) and **recovery** (10: was it still worse one week later?). Every ghat already has BOD above the limit before immersion, so the score separates what immersion adds from the pollution already there.
- Tiers: Priority 1 at 60 or more, Priority 2 from 35, Priority 3 below. There is no "green" tier.
- **Rank stability:** ranks are recomputed under 1,000 seeded random weight sets (each weight ±50%), and each ghat's rank range is shown.

Result on the Bhopal file (all festivals):

| Rank | Ghat | Score | Tier | Rank range |
|---|---|---|---|---|
| 1 | Bairagarh (Sant Hirdaram) kund | 81.9 | 1 | 1 to 1 |
| 2 | Shahpura lake ghat | 46.4 | 2 | 2 to 3 |
| 3 | Malikhedi kund | 42.8 | 2 | 2 to 4 |
| 4 | Hathaikheda dam / kund | 40.8 | 2 | 2 to 6 |
| 5 | Khatlapura ghat | 32.9 | 3 | 4 to 6 |
| 6 | Rani Kamlapati ghat / Kamla Park kund | 31.7 | 3 | 5 to 6 |
| 7 | Prempura ghat | 21.1 | 3 | 7 to 7 |
| – | Arch Bridge | No history | | baseline test before 20 October |

Bairagarh is first under every weight set we tried, and Prempura is last under every one. Ranks 2 to 6 are close and depend on the weights.

## What works

- Ranking, evidence and brief screens, offline, in English and Hindi, all-festivals and Durga-only views.
- Every reading shown carries year, festival, phase, report file and page, with a link to `report.pdf#page=N`.
- Missing data appears as "not sampled" or "no table in report" (hatched), never as clean. BDL is shown as BDL, never as 0.
- 46 tests (`tests/`), including: 42 of 116 DO readings below 5, 100 of 112 BOD readings above 3, the four zero DO readings all at Bairagarh, the prototype ranking, edge cases of the limits, weight changes with no code change, missing phases excluded and reported, banned words, same numbers in Hindi and English, one A4 page, and no network calls in the UI.
- [docs/VERIFICATION.md](docs/VERIFICATION.md): 20 app numbers for a teammate to check against the PDF pages.

## What does not work yet, and what the data can't say

- **Hindi text needs a native reader's approval.** Every Hindi string is marked `REVIEW: Hindi reviewer` in `i18n/` and `ghats.yaml`.
- **VERIFICATION.md is not yet filled in.** The "checked against PDF by" column is empty.
- **Units are assumed.** The reports print none.
- Each ghat has only a few sampling events across three years. The ranking is an indication, not a forecast of October 2026 water quality.
- **Total coliform is not in the data**, and the four metals have no class B limit (they give no points). The 2025 chromium values (0.03 everywhere) and 2025 Ganesh lead values (0.031 everywhere) look like reporting limits, so they are flagged and left out of spike detection.
- Weights and tier cut-offs are proposed policy choices that BMC or MPPCB should confirm.
- The designated-ghat list comes from news reports and must be confirmed with BMC. Shahpura and Rani Kamlapati are marked "unknown".
- "Rani Kamlapati ghat / Kamla Park kund" may be two places (the Ganesh tables say Kamla Park kund, the Durga tables say Lower Lake ghat).
- Bairagarh and Malikhedi have no Durga 2025 table. In Ganesh 2025 they were sampled only during immersion.
- Not used: the statewide file (not checked table by table) and the lake water-quality PDFs.
- No map, because map tiles need a network connection.
- This tool makes no health claims. It compares readings with CPCB class B limits only.

## Data used

From the participant pack (`data/`):
- `bhopal_ghats_2023_2025.csv` (1,524 readings, 7 ghats) and `cpcb_water_quality_criteria.csv`.
- Source reports, linked page by page in the app: [MPPCB 2025](https://www.mppcb.mp.gov.in/proc/mon/Ganesh_and_Durga_visarjan_report-2025.pdf), [MPPCB 2024](https://www.mppcb.mp.gov.in/proc/mon/Ganesh_and_Durga_visarjan_report-2024.pdf), [MPPCB 2023](https://www.mppcb.mp.gov.in/proc/mon/Idol_immer._Report_23_CPCB.pdf), [CPCB criteria](https://cpcb.gov.in/water-quality-criteria/).

Extra public data:
- Designated immersion ghats (Prempura, Khatlapura, Hathaikheda Dam, Arch Bridge, Bairagarh, Malikhedi): Free Press Journal, 26 Feb 2026, [NGT ban pushes BMC to build dedicated ghats](https://www.freepressjournal.in/amp/bhopal/mp-news-idol-immersion-to-shift-from-lakes-to-safer-sites-ngt-ban-pushes-bmc-to-build-4-dedicated-ghats). Recorded in `ghats.yaml`, editable by the officer. Confirm with BMC.

## Repo layout

```
rules.yaml, ghats.yaml          policy settings and ghat register (edit these, then rebuild)
i18n/                           English and Hindi templates and glossary (no runtime AI)
src/                            load → engine → stability → brief → build (each function names its BR id)
tests/                          pytest suite
docs/index.html, app.js, style.css, data.js   the offline app
docs/BUSINESS_RULES.md, docs/VERIFICATION.md, PLAN.md
```

## Licence

MIT. See [LICENSE](LICENSE). No personal data. No API keys or secrets.
