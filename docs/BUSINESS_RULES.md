# Business rules

Weights and thresholds are proposed policy choices, not science. They live in `rules.yaml` and should be reviewed by someone who knows the domain. Every function in `src/` names the BR id it implements.

## Data handling

| ID | Rule | Why and source |
|---|---|---|
| BR-01 | Missing is never clean. `not sampled`, `*`, `**` and blank are missing. They are excluded from pass/fail counts and shown as "not sampled". | Problem statement, "Codes you will see". |
| BR-02 | BDL and ND mean very low, not zero and not missing. Never convert them to 0. Show them as "BDL". | Same source. |
| BR-03 | Units are assumed, so show "(unit assumed: mg/l)" next to values. | The reports print no units. |
| BR-04 | Every number shown carries year, festival, phase, report file, source page and a link to report URL#page=N. | Jury check: "traceable to the report and page". |
| BR-05 | Ghats with `site_match_confidence = medium` (Rani Kamlapati / Kamla Park kund) get the badge "identity uncertain, may be two places". | Data dictionary. |
| BR-06 | Rank only with the Bhopal file. The statewide file (21,600 rows, 879 marked `needs_check`) is not used. | Data dictionary says it was not checked table by table. |

## Compared with CPCB limits

| ID | Rule | Why and source |
|---|---|---|
| BR-10 | Use CPCB class B (organised outdoor bathing). A reading fails if DO is below 5, BOD is above 3, or pH is outside 6.5 to 8.5. DO of exactly 5 and BOD of exactly 3 pass. | Class B is the nearest listed use to human contact with the water. File: `cpcb_water_quality_criteria.csv`. |
| BR-11 | Parameters with no class B limit (COD, solids, turbidity, conductivity, four metals) are reported but never called a violation. | CPCB table has no class B limit for them. |
| BR-12 | Total coliform is a class B parameter but is not in the data. Show a permanent notice: "Not covered by these reports". | CPCB table versus the CSV columns. |
| BR-13 | Never claim health effects. Say "below the CPCB class B minimum of 5 mg/l". Never use the words that judge the water as fit or unfit for people. | Problem statement constraint. |

## Scoring (0 to 100, additive)

| ID | Component | Rule |
|---|---|---|
| BR-20 | Oxygen stress, up to 40 | 20 × share of valid DO readings below 5, plus 10 if any DO is below 2, plus 10 if any DO is 0. |
| BR-21 | Organic load, up to 25 | 15 × share of valid BOD readings above 3, plus 10 if any during-immersion BOD is 9 or more (three times the limit). |
| BR-22 | pH, up to 5 | 5 × share of valid pH readings outside 6.5 to 8.5. |
| BR-23 | Immersion impact, up to 20 | 20 × share of (year, festival, parameter) pairs where during is worse than pre by at least 1 mg/l (DO fell or BOD rose). Only pairs with both values count. Others are reported as "not testable". |
| BR-24 | Recovery, up to 10 | 10 × share of pairs where after one week is worse than pre by more than 0.5 mg/l. Same exclusion rule. |
| BR-25 | Metals: no points | Flag a spike when during is at least 5 times pre and both are numeric, or when a metal goes from BDL to detected. State that the cause is not established by the data. |
| BR-26 | Reporting-limit values | If a metal has the same value in every phase and ghat of a year and festival (each festival is a separate set of tables), flag "possible reporting-limit value" and exclude it from spike logic. Observed in 2025 chromium (0.03, both festivals) and 2025 Ganesh lead (0.031, 17 readings). 2025 Durga lead varies, so it stays in spike logic. |

## Ranking, tiers and confidence

| ID | Rule |
|---|---|
| BR-30 | Tiers: Priority 1 at 60 or more, Priority 2 from 35 to 59.9, Priority 3 below 35. There is no "green" tier. |
| BR-31 | The ranking is relative. State on every screen that BOD exceeded the limit at 100 of 112 readings, so no ghat is shown as meeting the limit. |
| BR-32 | Confidence = valid DO and BOD readings divided by expected readings. Below 80 percent, keep the rank and add the badge "limited data". A ghat with no readings (Arch Bridge) goes to a "No history" row with the action "baseline test before 20 October". |
| BR-33 | Rank stability. Recompute ranks under 1,000 seeded random weight sets (each weight ±50 percent). Show each ghat's rank range. If the top rank is unstable, say so plainly. |
| BR-34 | Ties break on lowest DO ever recorded, then on highest during-immersion BOD. |
| BR-40 | Default scope is all festivals 2023 to 2025 (more evidence). Offer a Durga-only toggle and flag ghats whose rank differs by 2 or more places between the two views. |

## Ghat register and suggested focus

| ID | Rule |
|---|---|
| BR-50 | `ghats.yaml` lists each ghat, whether it is in the data, whether it is designated for 2026, and the source. Free Press Journal, 26 Feb and 22 Sep 2026: Prempura, Khatlapura, Hathaikheda Dam, Arch Bridge, Bairagarh and Malikhedi are the immersion sites. Shahpura and Rani Kamlapati are "unknown, confirm with BMC". New ghats under construction (Barkatullah University campus, Sanjeev Nagar, Neelbadh) have no readings; add them with `in_data: false` if they open. The officer can edit the file. |
| BR-60 | Suggested focus (the officer decides). Oxygen component of 20 or more: "DO check before immersion and aeration planning". Organic component of 15 or more: "extra cleaning". Immersion impact of 10 or more: "test during immersion, not only before". Recovery of 5 or more: "re-test one week after". Metals spike: "include metals in testing". Any missing phase: "fill the sampling gap". |

| BR-61 | Action plan. Each BR-60 action belongs to exactly one date group in `rules.yaml` (`plan`): before visarjan, during visarjan, or by one week after. The build fails if an action is in two groups. Ticks are kept in the browser only. |
| BR-62 | Dates. The visarjan date and the re-test gap live in `rules.yaml` (`event`). The countdown is computed in the browser from the device clock. |
| BR-63 | How to use. The guide is fixed text in `i18n/` (no runtime AI). Its numbers (limits, maximum points, tier cut-offs, runs, the BR-31 counts) are filled from `rules.yaml` and the data, never typed in. |
| BR-64 | Standard site measures. The action plan also lists general measures from the CPCB idol-immersion guidelines (2010) for every site. They are labelled as guidance, are not derived from the readings, and carry no points. |

## The brief

| ID | Rule |
|---|---|
| BR-70 | One A4 page: date, top 3 ghats with the numbers behind each, data gaps, honesty box, sources. |
| BR-71 | Hindi and English come from fixed templates and a glossary file. No runtime AI. A Hindi-reading teammate approves every Hindi string. Both languages show identical numbers. |
| BR-72 | The honesty box is always present: units assumed, ranking is relative, coliform not covered, metals have no class B limit, no health claims. |

## Guardrails from the pack

No personal data. No live or scraped government systems. No API keys in code. MIT licence. Public repo by 5:00 PM.
