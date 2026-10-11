# Plan

## Files
- `rules.yaml` every limit, weight, tier, scope. `ghats.yaml` ghat register (BR-50).
- `src/load.py` reading status (BR-01/02/06). `src/sources.py` report links (BR-04). `src/coverage.py` coverage and confidence (BR-32).
- `src/engine.py` compliance, component scores, metals, tiers, ranking (BR-10 to BR-34, BR-40, BR-60). `src/stability.py` rank ranges (BR-33).
- `src/brief.py` Hindi and English brief from `i18n/` templates (BR-70 to BR-72).
- `src/build.py` writes `docs/data.js`. `docs/index.html`, `app.js`, `style.css` are the offline UI.

## Data model
- **Reading**: year, festival, site, phase, parameter, value, status (valid / bdl / missing), source_page, report file, link.
- **Ghat**: id, site, Hindi name, water body, in_data, designated_2026, identity confidence.
- **Component score**: key, points, max, plain-words detail, evidence rows, not-testable pairs.
- **Evidence row**: reading fields + limit + verdict (pass / fail / not sampled / BDL / no limit).

## Pipeline
CSV → load (status) → engine per scope (all, durga) → stability → brief (en, hi) → `docs/data.js` as `window.GHAT_DATA`.

## Screens
1. Ranking: countdown, tier counts, three-step guide, then tier, score, reason, badges, rank range, scope and language toggles, BR-31 line.
2. Ghat detail: score/coverage/rank-range tiles, DO and BOD charts against the limit, component bars, evidence tables with Report p.N links, coverage grid (missing hatched), metals.
3. Action plan (BR-61, BR-64): actions by date, tickable on the device, copy/WhatsApp/print.
4. Brief: one A4 page, copy, WhatsApp link, print.
5. How to use (BR-63): steps, controls, scoring, badges, glossary, FAQ, accessibility, upkeep.

## Tests by BR id
BR-01/02 status and counts. BR-10 limits at the edges. BR-20..24 Bairagarh ≈ 81.9, Prempura ≈ 21.1 last. BR-23 exclusion reported. BR-26 2025 Cr/Pb flagged. BR-30 tiers. BR-32 confidence and No history. BR-33 deterministic seed. BR-40 Durga scope. BR-13 banned words. BR-70..72 one page, same numbers EN and HI, numbers traceable to evidence.

## Risks
1. Weights are policy choices. Mitigation: rules.yaml, rank stability shown.
2. Rani Kamlapati may be two places. Mitigation: badge.
3. Designated ghat list comes from news. Mitigation: editable register, "confirm with BMC".
4. Hindi wording. Mitigation: REVIEW markers, fixed glossary.
5. Few sampling events per ghat. Mitigation: confidence badge, honesty box.
