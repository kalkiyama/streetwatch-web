# StreetWatch

**[streetwatch.earth](https://streetwatch.earth)** — one app to watch the public world.
Also on Android as *StreetWatch: Live Planet*.

Flights, ships, drones, road traffic, Earth and weather, public webcams, wildlife, and the
ISS. **7,448 feeds**, searchable and filterable by continent, country and layer, with
favourites and "near me". Public feeds only — private cameras of private spaces are excluded
by design.

Beyond the directory, a server-side sweep watches **1,106 airspaces** for military and UAV
activity, archives 90 days of it, and presents that history as an activity map, path replay,
and multi-stop route analysis.

## The rule everything follows

Every figure states its scope, and no label claims more than the data supports.

Counts carry the window and radius they were measured over. Contacts are separated by
altitude, so an aircraft overflying at 35,000 ft is not shown as using the field below it.
Proximity to a watched site is described as proximity — "low and close to this site", never
"landed" — because the nearest watched site is not necessarily the nearest airfield, and
where two watched sites overlap the app says so. An empty region means "not visible to public
ADS-B", never "nothing happened". The archive holds military and UAV contacts only; civil
traffic is never recorded, and every total says so.

Most of this app's history is the story of finding places where a correct number produced a
false impression, and fixing the presentation rather than the arithmetic.

## Stack

React 19 · Vite 7 · Leaflet · Tailwind 4 · lucide-react. Deployed on Vercel. PWA with an
Android TWA wrapper.

## Layout

| File | Role |
|---|---|
| `App.jsx` | Entry — wraps the app in `ErrorBoundary` and cookieless analytics |
| `StreetWatch.jsx` | App shell: catalog, search, filters, favourites, tabs |
| `config.js` | Backend URLs. **Empty string ⇒ labelled simulation, no backend needed** |
| `catalog.json` | The 7,448 feeds |
| `LiveRadar.jsx`, `AviationRadar.jsx`, `MarineRadar.jsx` | Radar surfaces |
| `WorldMap.jsx`, `RadarMap.jsx`, `HeatMap.jsx`, `PathMap.jsx`, `MapPanel.jsx` | Leaflet views |
| `DroneSweep.jsx` | Planet-wide sweep view, list and map |
| `RouteTrace.jsx` | Multi-stop itineraries with evidence grading |
| `TrackNarrative.jsx` | Plain-language track description |
| `AiBriefing.jsx` | AI digest over the archive |
| `EarthView.jsx`, `SpaceView.jsx`, `NearbyCams.jsx`, `FeedViewer.jsx` | Other layers |
| `Intro.jsx` | First-visit orientation, reopenable from the header |
| `mapTouch.js` | One finger scrolls the page, two fingers pan the map, on coarse pointers |
| `mapIcons.js`, `mapFollow.js`, `geometry.js`, `search.js`, `theme.js` | Shared helpers |

## Run

```bash
npm install
npm run dev
npm run build
```

## Backend

Earth and Space are live with no backend. Aviation, marine and the sweep need the proxy —
see the `streetwatch-proxy` repo. Point at it in `config.js`:

```js
export const BACKEND_URL     = "https://your-service.onrender.com";
export const AIS_BACKEND_URL = "https://your-service.onrender.com";
```

Leave both empty and the radars show a **clearly labelled simulation** rather than pretending
to have data. The radars flip SIM → LIVE automatically once a URL is set.

## What's live where

| Layer | Live in-app | Needs backend |
|---|---|---|
| Earth / weather (NASA) | ✅ | no |
| Space / ISS | ✅ | no |
| Aviation radar | ✅ | yes |
| Marine radar | ✅ | yes |
| Drone sweep, archive, heat map, routes | ✅ | yes |
| Traffic, webcams, wildlife | browser hand-off | no |

## Testing

There is no automated frontend test suite — the honest and known gap. `SMOKE-TEST.md` is the
manual list, and every line in it is a bug that actually shipped. Run it after any deploy
that touches the frontend.

Verify deploys by behaviour, never by build status. A green build proves the build ran.

## Honest limits

- Traffic cameras have no single global API; coverage is rich in US/UK/EU/AU, thin elsewhere.
- Catalog entries are launch points — once live, the radar shows *every* aircraft or ship near
  a location, not only the listed ones.
- Position accuracy varies by how it was derived (ADS-B, MLAT, TIS-B). The source is labelled.
- Barometric altitude is above sea level, not field elevation, so altitude thresholds are less
  accurate at high-elevation airfields.

## Attribution

Aircraft: airplanes.live · Vessels: Fintraffic Digitraffic, Kystverket, aisstream.io ·
Earth: NASA Worldview/GIBS · ISS: wheretheiss.at · Webcams: Windy ·
Traffic: respective public authorities.
