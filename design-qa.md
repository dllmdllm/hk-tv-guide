# Design QA

Reference: user-supplied calendar screenshot, used locally as a structural reference and not published.

Target layout:

- Time runs vertically on the left from 00:00 to 24:00.
- Channels run horizontally across a sticky header.
- Programme blocks are positioned and sized from their real start and end times.

Checks performed:

- Desktop production build plus local browser QA: 1044 × 478 viewport, 14 channel headers, 25 hourly labels, 613 programme blocks.
- Mobile browser QA: 390 × 844 viewport, no page-level horizontal overflow; the EPG itself scrolls horizontally.
- Channel priority: first visible channels are 31, 77, 81, 99, followed by the remaining channels in their original order.
- Date navigation: next day and previous day both update the selected schedule.
- Filters and search: operator filtering and programme search both update the grid.
- Current time: red time line is centered on first load within 1px in desktop and mobile QA; “跳到而家” control uses the same centered position.
- Live state: currently airing programme blocks render with a high-contrast light background, accent outline, and “播放中” badge.
- Programme text: each non-micro programme block uses a consistent metadata/title/description structure, with metadata shown as `HH:mm-HH:mm (N分鐘)`.

Issues found and fixed:

- P1: short programme blocks produced crowded text. Blocks under 18px now render as clean timeline markers with details available from their link title.
- P1: the mobile date input caused page-level horizontal overflow. It is hidden at the mobile breakpoint; arrows and the seven-day strip remain available.
- P2: symbolic text controls were replaced with Phosphor icons.
- P1: first-load current-time scroll ignored the sticky header height, leaving the red line below center. Scroll calculation now includes header height.
- P2: currently airing blocks were not visually distinct enough. Live blocks now use high-contrast highlighting.
- P2: programme block typography was inconsistent. Blocks now use the same metadata/title/optional-description layout.

Final result: passed.
