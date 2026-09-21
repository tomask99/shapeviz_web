# Presentation website clicks

The shared presentation tracker records trusted link activations to the site's
current origin or `https://shapevizweb.vercel.app`. Normal clicks, keyboard
activation and middle clicks are supported, including links inserted later.
Links to `/p`, `/api`, `/admin`, `/adminlogin`, `/presentation-system`, other
origins, download links and cancelled navigation are excluded. A CTA must use
a normal `<a href="...">` link; arbitrary JavaScript-only navigation is not detected.

The `website_clicked` event uses the existing presentation session and a unique
event ID. No destination query strings or visitor identity are stored. Existing
decks receive the shared tracker when served; reuploading is not necessary.

Admin statistics show total clicks, sessions with at least one click and the
percentage of visits with a click for the selected date range. Each presentation
row and each recent session shows its own click count. Sessions are visits, not
identified people; clicks do not prove that the destination finished loading.
Historic clicks before this feature cannot be recovered. Resetting a deck's
statistics also removes its click events through the existing cascade.

Deployment requires migration `20260921144920_presentation_cta_clicks.sql` before
the new API/tracker/admin assets. The migration preserves existing data and
service-only RPC permissions. The rollback-only verification script is
`supabase/tests/presentation_cta.sql` and requires an existing published deck.
When introducing a separate website domain, add its exact origin to
`websiteOrigins` in `public/presentation-system/tracker.js` and test its CTA.
