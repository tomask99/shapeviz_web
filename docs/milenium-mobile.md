# Milenium mobile layout

The uploaded standalone Milenium deck uses the scoped CSS and JavaScript in
`src/presentations/customizations/milenium-mobile.*`. These are embedded in a new
Storage HTML revision; the shared presentation renderer is unchanged.

The layout applies at widths up to 900px, and to coarse-pointer tablets up to
1400px wide (including landscape). Larger mouse-driven desktop layouts keep
the original CSS, markup, navigation and media behavior. Mobile slides scroll
vertically above the fixed navigation. Images preserve their intrinsic ratios;
horizontal swipes navigate without taking over vertical scrolling or pinch zoom.

To prepare a future revision:

```powershell
node --env-file-if-exists=.env scripts/update-milenium-mobile.js
```

Review `.cache/milenium-mobile/after.html` with the current media, check every
slide on phones and tablets in both orientations, exercise navigation, image and
video lightboxes and audio, and compare desktop screenshots against `before.html`.
Then publish the reviewed revision:

```powershell
node --env-file-if-exists=.env scripts/update-milenium-mobile.js --publish
```

Publishing checks that the live source and timestamp still match the prepared
baseline. It uploads to a new content-addressed path, verifies the bytes, and
conditionally updates only this deck's source path and storage ownership list.
The original HTML and all existing media remain available. The prior path and new
checksum are recorded in `.cache/milenium-mobile/published.json`; rollback means
restoring that previous source path on the same registry row. The user's original
ZIP backup in Downloads is unaffected.

Verification for the September 29, 2026 revision covered all 30 slides at
360×640, 390×844, 430×932, 844×390, 768×1024, 820×1180, 1180×820 and
1366×1024 in Chromium touch emulation: horizontal bounds, reachable content,
image proportions, navigation and lightboxes. Actual touch gestures, all five
videos, the voiceover controls and rotation were exercised separately.
Desktop comparisons at 1024×768 and 1440×900 were pixel-identical on all slides.
At 1920×1080 only 32 antialiased pixels differed on the final slide; its complete
computed styles and element bounds were identical. Physical iOS/Android devices
were not used for these checks.
