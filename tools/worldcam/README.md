# WorldCam

An interactive 3D globe for finding publicly listed webcams. Static, no build step,
no server. Drop the folder into `tools/worldcam/` and it runs on GitHub Pages.

## Files

```
worldcam/
├── index.html          page shell
├── css/worldcam.css
└── js/
    ├── config.js       constants, geo maths, demo dataset
    ├── globe.js        earth material, atmosphere, stars, sun position
    ├── markers.js      instanced markers, clustering, picking
    ├── controls.js     orbit controls, pinch, fly-to
    ├── webcams.js      data layer (Windy adapter + demo fallback)
    ├── ui.js           panel, search, filters, status, toasts
    └── main.js         wiring and render loop
```

Three.js r128 comes from cdnjs; the Earth imagery (NASA, public domain, redistributed
with three-globe) from unpkg. If the imagery fails to load, the globe falls back to a
plain shaded sphere instead of breaking.

## Two ways to get real cameras on the globe

### A. Curated YouTube live streams — no account anywhere

Open `curator.html` in a browser. Paste a YouTube live stream URL, look the place up
(OpenStreetMap's public geocoder, no key), press **Add camera**, and download
`cameras.json` when you are done. Save it to `data/cameras.json` and commit.

These are genuine continuous video streams, embedded straight into the panel. The preview
in the curator is exactly what a visitor sees, so if a stream refuses to be embedded or
has gone offline, you find out before you add it. Your working list is kept in the
browser, so you can build it up over several sittings.

The trade-off is maintenance: streams occasionally end, and operators sometimes restart
them under a new video ID. Re-open the curator and drop the dead ones.

`data/cameras.json` ships with a single verified entry so the pipeline works out of the
box. Replace it with your own list.

### B. Windy export — about a thousand cameras, mostly still images

Most of Windy's cameras send a fresh photo every few minutes rather than continuous
video; some have a live stream, and the export prefers it where it exists. This is the
route for quantity.


1. Get a free key at <https://api.windy.com/keys>, type **Webcams API**. Leave the key's
   **Domains** field empty — the export runs from your machine, not from a browser.
2. Run the export:

   ```bash
   node export-cameras.mjs YOUR_KEY
   ```

   It writes `data/cameras.json` (about 1,000 cameras — the free tier caps the listing
   offset there).
3. Commit that file.

From then on the globe loads the committed list, with **no key at runtime**, for every
visitor. Clicking a marker embeds Windy's player directly in the page, which their free
tier explicitly allows in unlimited size. The required attribution is rendered in the
panel. Re-run the script whenever you want to refresh the list.

The key exists only as a command-line argument. It is never written to the output file.

## Webcam data

Windy's Webcams API only accepts its key as an HTTP header, so a static site cannot use
one without publishing it. This tool therefore ships **no key**. Instead:

Three sources, tried in this order:

1. **A visitor's own key**, if they pasted one under **Source**. Kept in their browser,
   sent only to `api.windy.com`, gives the freshest list. Free keys are domain-restricted,
   so the site's domain has to be allowed in Windy's key manager or the browser refuses
   the request — the tool says so explicitly when that happens.
2. **`data/cameras.json`**, the committed export. This is what every ordinary visitor
   gets: real cameras, real coordinates, embeddable players, no key involved.
3. **Demo markers**, if neither is available. Placeholders at real coordinates that do not
   pretend to be cameras: no preview, no status, no link, labelled `DEMO DATA` on the
   globe, in the panel and in the status bar.

The export stores player URLs but no image URLs, because free-tier image links expire
after roughly ten minutes while player embeds do not.

Swapping in a different provider means writing one `normalise()` adapter in `webcams.js`;
nothing downstream knows where the points came from.

## What is genuinely computed

The day/night terminator uses the real sub-solar point for the current UTC time
(declination and hour angle, accurate to well under a degree, verified against the 2026
equinox and both solstices). The status bar shows that position and the current UTC time.
Nothing else on screen is simulated.

## Performance

All markers are one `InstancedMesh` capped at 4,000 instances, so twenty thousand data
points still cost a single draw call. Clustering uses a lat/lon grid whose cell size
follows camera distance, and points behind the horizon are culled before clustering.
Rebuilds happen on view or filter changes, not per frame.

## Known limits

- Search covers the loaded dataset only. There is no geocoding service, so searching for
  a place with no camera in the set returns nothing rather than flying somewhere empty.
- Category names come from Windy's own taxonomy, mapped onto a shorter list. Only
  categories present in the loaded data are shown.
- Camera feeds are opened on the provider's own page. Nothing is proxied or re-hosted.
