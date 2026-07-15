# Design QA

Reference: user-supplied calendar screenshot, used locally as a structural reference and not published.

Target layout:

- Time runs vertically on the left from 00:00 to 24:00.
- Channels run horizontally across a sticky header.
- Programme blocks are positioned and sized from their real start and end times.

Checks performed:

- Desktop production build: 1044 × 478 viewport, 14 channel headers, 25 hourly labels, 613 programme blocks.
- Mobile production build: 390 × 844 viewport, no page-level horizontal overflow; the EPG itself scrolls horizontally.
- Date navigation: next day and previous day both update the selected schedule.
- Filters and search: operator filtering and programme search both update the grid.
- Current time: red time line and “跳到而家” control work on today’s schedule.

Issues found and fixed:

- P1: short programme blocks produced crowded text. Blocks under 18px now render as clean timeline markers with details available from their link title.
- P1: the mobile date input caused page-level horizontal overflow. It is hidden at the mobile breakpoint; arrows and the seven-day strip remain available.
- P2: symbolic text controls were replaced with Phosphor icons.

Final result: passed.
