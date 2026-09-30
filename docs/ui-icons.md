# SVG icon policy

Shapeviz uses SVG for all app-authored icons. Unicode arrow, play, refresh and
other icon glyphs can turn into colored emoji on iOS even when desktop browsers
show plain text. A font override or variation selector does not satisfy this rule.

The repository-wide instruction is in [AGENTS.md](../AGENTS.md). It covers the
public site, admin, file portals, templates/presentations and generated content.

For dynamic markup, import `svgIcon` from `public/ui/icons.js` and insert the
returned trusted SVG, for example `button.innerHTML = 'Open ' + svgIcon('arrowRight')`.
Escape any user-provided text separately. Static HTML may embed the same inline
SVG. The icon inherits `currentColor` and uses `public/ui/icons.css` for sizing.
Keep decorative icons hidden from assistive technology and keep meaningful
labels on icon-only controls. Plain-text notifications use words, not pictograms.

`npm.cmd run icons:validate` scans HTML, JavaScript, CSS, SVG and JSON under all
runtime and generator directories. It catches literal glyphs, HTML entities,
JavaScript Unicode escapes and CSS escapes. Brand copyright, registered and
trademark marks remain normal typography; an emoji variation selector is still
rejected. Tests may contain deliberate failure fixtures. User filenames, notes,
URLs and uploaded code are never blindly stripped or rewritten.

`npm.cmd run build` runs the check before creating the build. New UI must pass
it, including state updates such as play/pause and dynamically inserted buttons.
The presentation compatibility pass converts supported visible icon glyphs in
legacy links/buttons to SVG while preserving scripts, attributes and slide text.

The audit replaced remaining glyph icons in the client portal, CRM and research
screens, project/client links, dialogs, upload controls, gallery/video controls
and HTML generators. Existing SVG icons were kept. Notifications now use plain
text. Desktop/mobile browser checks cover rendering, accessible names, navigation
and control state changes; regression fixtures also verify that escaped emoji
cannot silently re-enter future builds.
