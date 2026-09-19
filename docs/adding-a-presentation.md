# Adding a presentation

## Bespoke standalone HTML

Create a local draft:

```powershell
npm.cmd run presentation:new -- company-x
```

Put `index.html`, `project.json` and all media under
`presentations/company-x/`. Use relative asset URLs under `assets/`; filesystem
paths and `..` traversal are rejected. Include the shared tracker with a
`data-deck` value matching the slug.

Validate without changing Supabase:

```powershell
npm.cmd run presentations:validate
npm.cmd run presentation:publish -- presentations/company-x --dry-run
```

After visual review, set `status` to `published` and upload:

```powershell
npm.cmd run presentation:publish -- presentations/company-x
```

The command uploads media to Supabase, stores the externalized HTML privately,
upserts the registry and prints `/p/company-x`. It never requires a router edit.

## Client version of the universal template

Copy `presentations/_template/template-instance.example.json`, then change the
slug, client data and the five allowlisted content fields. Validate first:

```powershell
npm.cmd run presentation:create:template -- presentations/minotti.json --dry-run
```

Create the instance:

```powershell
npm.cmd run presentation:create:template -- presentations/minotti.json
```

This writes only a small database row. The shared
`shapeviz-introduction-v1` HTML stays versioned in Git, while `/p/minotti`
receives its own escaped text and analytics identity. Keep a new instance as
`draft` until its copy has been reviewed; draft URLs return 404.

## Analytics hooks for bespoke decks

Add `.slide` or `data-slide` to every meaningful section. For explicit
next/previous navigation, toggle `active` on the visible slide and dispatch:

```js
document.dispatchEvent(new CustomEvent('shapeviz:slidechange'));
```

Give each video a stable `data-video-id`. Include:

```html
<script src="/presentation-system/tracker.js"
        data-deck="company-x"
        data-analytics="true"></script>
```

Video completion means at least 90% playback. The event endpoint also verifies
that the matching published project has analytics enabled.

## Re-importing Milenium

The original monolithic file is local and Git-ignored because it exceeds
GitHub's single-file limit. Recreate the externalized working directory with:

```powershell
npm.cmd run presentation:import:milenium
```

Then run the dry run, browser tests and publisher. Once the remote upload is
verified, large generated media no longer needs to remain in the website Git
history for future versions.
