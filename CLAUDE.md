# Ghat Watch (Track 2, Bhopal Impact Lab 2026)

User: BMC officer planning Durga visarjan on 20 Oct 2026.
Outcome: ghats ranked by risk, each with a plain-words reason and traceable numbers, plus a short Hindi and English brief.

Source of truth for logic: docs/BUSINESS_RULES.md (BR ids). Thresholds and weights live in rules.yaml, never in code.

Hard constraints:
- No language model and no network call at runtime. No API keys. No paid service.
- Use only data in data/. Never scrape or log in to government portals.
- Missing is never clean. BDL is never zero. Never claim health effects.
- Python 3.11 with pandas, PyYAML and pytest for the pipeline. Plain HTML, CSS and JS for the UI. The UI must work by opening docs/index.html from disk.
- UI design: teal and cream (#175A67, #2A707C, #0F454F, #EAE3DE), Cormorant Garamond for headings, Poppins for everything else. Fonts are local files in docs/fonts (no CDN). Teal is the brand, never a "pass" colour.
- Every UI string lives in i18n/en.yaml and i18n/hi.yaml with the same keys (tests check this). New Hindi lines get "# REVIEW: Hindi reviewer".
- Every displayed number carries year, festival, phase, report file and source_page.
- MIT licence. Small modules. Each function's docstring names the BR id it implements.
- Run pytest before every commit.
