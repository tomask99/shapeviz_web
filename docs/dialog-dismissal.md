# Shared dialog dismissal

23 September 2026.

Repository completion and fresh verification: [25 September checkpoint](completion-checkpoint-2026-09-25.md). The deployment details below describe the original 23 September release.

`public/dialog-dismiss.js` is loaded by the public gallery, Studio/CRM/Research and Connected apps. It adds a labeled close cross when a native dialog does not already have one, including dialogs inserted or rebuilt dynamically. Added crosses remain visible while scrolling long reviews.

A primary-pointer click on the backdrop requests dismissal. Both the pointer-down and click must occur outside the same dialog's bounds; clicking dialog padding or dragging from content onto the backdrop does not dismiss it. Nested dialogs close independently. Escape remains supported.

Dismissal uses `requestClose`, with a cancel-event fallback for older browsers. Existing cancel guards prevent dismissal while a save is in flight, and existing close handlers still clean up component state. Studio's common save wrapper and the connection revoke dialog also guard cancellation. Closing a presentation preview clears its iframe contents.

Tests cover the actual Research approval preview, cancellation without creating a Lead, mobile scrolling, public image cleanup, existing Studio controls, nested dialogs, fallback behavior, drag gestures and save guards.

Validation: 304 unit/API tests passed (one opt-in skipped), build passed. The full browser regression found six ambiguous Close selectors; the added cross now has the distinct accessible name Close dialog. All 41 tests in the affected dialog/Research groups then passed, alongside the other successful full-regression cases (166 distinct passing browser scenarios, 11 opt-in tests skipped). Mobile approval screenshots were visually inspected.

Production deployment `shapeviz-lol18ix1q-tomask99-s-projects.vercel.app` is READY on the canonical alias. A browser smoke check against the deployed assets passed Studio backdrop dismissal and the actual Research approval cross, with synthetic API responses and no real CRM mutations.
