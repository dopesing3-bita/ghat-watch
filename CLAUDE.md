# Ghat Watch (Track 2, Bhopal Impact Lab 2026)

User: BMC officer planning Durga visarjan on 20 Oct 2026.
Outcome: ghats ranked by risk, each with a plain-words reason and traceable numbers, plus a short Hindi and English brief.

Source of truth for logic: docs/BUSINESS_RULES.md (BR ids). Thresholds and weights live in rules.yaml, never in code.

Hard constraints:
- No language model and no network call at runtime. No API keys. No paid service.
- Use only data in data/. Never scrape or log in to government portals.
- Missing is never clean. BDL is never zero. Never claim health effects.
- Python 3.11 with pandas, PyYAML and pytest for the pipeline. Plain HTML, CSS and JS for the UI. The UI must work by opening docs/index.html from disk.
- Every displayed number carries year, festival, phase, report file and source_page.
- MIT licence. Small modules. Each function's docstring names the BR id it implements.
- Run pytest before every commit.
