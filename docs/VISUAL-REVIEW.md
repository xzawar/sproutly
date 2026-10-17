# Visual review

Representative individual inspection, 2026-10-17. These are design checks, not an accessibility certification or a claim that every screenshot/device was manually inspected.

- **Desktop:** overview, calendar, login, growth, weather passed after refinement. Growth/forecast stat cards align; headings have panel padding; forgot-password link is separated; calendar status labels wrap instead of truncating.
- **Mobile:** overview, plants/detail, login, schedule, calendar, growth, weather, inbox, restore/rain confirmation and offline fallback passed. N-day interval is explicit and notes optional. Mobile SVG labels now use responsive coordinates rather than tiny scaled desktop text. Photo capture scrolls lazy images into view.
- **Presentation:** all ten rendered slides individually inspected. No clipped text/overlap found; layout validator reports no issues or warnings. Actual UI screenshot is labelled fictional local demo.
- **Diagrams:** ER and use-case PNGs individually inspected; editable DOT and SVG versions included.

Artifacts: `../screenshots/`, `presentation-build/preview/`, ER-DIAGRAM and USE-CASE-DIAGRAM. Remaining target-device and live-service testing is described in TEST-REPORT.
