# Shapeviz project rules

## Icons: SVG only, no emoji

This applies to every existing and new public page, client file portal, admin
screen, presentation/template, generated HTML and app-authored notification.

- Never render emoji or use Unicode glyphs as UI icons. This includes arrows,
  play/pause, refresh, close, plus, checkmarks and pictographic symbols.
- Use SVG with `currentColor`. Prefer `svgIcon()` from `public/ui/icons.js` for
  JavaScript; inline SVG from the same geometry is also valid in HTML/templates.
  Shared sizing lives in `public/ui/icons.css`.
- Unicode variation selectors, emoji fonts and CSS `content` glyphs are not a
  fix. Do not hide the symptom by forcing a text font or text presentation.
- Decorative SVGs need `aria-hidden="true"` and `focusable="false"`. Icon-only
  controls must keep an accessible text label on the button/link.
- Dynamic state changes must render SVG again, not put a glyph into
  `textContent`. Check both initial markup and later JavaScript updates.
- In plain-text notifications, use words rather than emoji or SVG markup.
- Preserve normal text, punctuation, brand copyright/registered/trademark marks,
  user-provided filenames/content, URLs, attributes and code samples. Never run
  a blind emoji stripper on stored client data.
- Run `npm.cmd run icons:validate` after UI edits. `npm.cmd run build` runs the
  same check and must fail on application-authored emoji/text icons. Do not add
  broad exclusions or suppress the check to make a new UI pass.
- Verify affected controls in desktop and mobile browser layouts, including
  dynamic states, links and accessible names.

See [docs/ui-icons.md](docs/ui-icons.md) for the full policy and verification.
