# TENGRI SOLAR

A personal solar, circadian-rhythm and environmental-intelligence app for iPhone and iPad, inspired by Tengri, the Eternal Blue Sky of the Kazakh steppe.

It's a Progressive Web App (React + TypeScript + Vite). It runs in Safari and can be added to the Home Screen. It does five things:

- calculates the Sun's position, sunrise, sunset and all three twilights on your device
- fetches real weather, UV and solar-irradiance forecasts from Open-Meteo
- plans outdoor time conservatively around UV and heat
- keeps a private sleep and outdoor-light journal with trends and personal experiments
- explains the science, including Ray Peat's and Jack Kruse's ideas, with each claim labelled by strength of evidence

> Educational tool, not medical advice. It doesn't diagnose anything, and it doesn't claim to measure your biology.

---

## Screens

| Screen | What it does |
|---|---|
| **Solar Command Center** (Today) | Shows a live sky with the Sun at its calculated position. Also shows local time, location and altitude, Sun elevation and azimuth, a countdown to the next solar event, current UV and its category, modelled weather, a "recommended now" action with its reasoning, the next outdoor window and your sleep target. In-app reminders appear here. |
| **Solar Explorer** (Sky) | A 24-hour solar clock you can drag (or step with arrow keys) to inspect any moment. Includes a date picker with equinox and solstice presets, elevation curves compared with the solstices, a full event table, how far your clock is ahead of or behind the Sun, and charts of daylight, sunrise and sunset across the year. |
| **Exposure Planner** (Plan) | Shows the UV forecast against clear-sky UV, the daily maximum and peak time, and outdoor windows sorted by UV and heat. You can plan a session or log what you actually did. Logged sessions are stored with the model's UV, cloud and temperature, plus the *ambient* UV dose. |
| **Circadian Studio** (Rhythm) | Lets you edit your schedule and compares your plan with what you logged night by night. Shows consistency statistics and rule-based suggestions with an **Accept / Modify / Dismiss** choice. Also has a daylight plan, reminders exported as a calendar file (.ics), an evening-light guide and an iOS settings guide. |
| **Solar Journal** | A quick morning log where every field except the date is optional, plus a history list. Includes 7/30/90-day trends, a two-variable relationship explorer (same day or next day, Pearson r and Spearman ρ, with a caveat), personal experiments (baseline vs. change) and CSV/JSON export and import. |
| **Spectrum Lab** | An interactive solar spectrum from the ASTM G173-03 reference, with the share of energy in each band. For your sky right now it separates what is calculated, modelled, estimated (wide ranges) and unavailable. |
| **Knowledge Archive** | 27 evidence cards in three categories: established science, Ray Peat and Jack Kruse. Includes search, filters, a side-by-side comparison, a 51-entry source registry and the rating method. |
| **Settings** | Location and altitude, saved places, units, 12/24-hour clock, theme (which can follow the Sun), reduced motion, horizon dip, sleep schedule, reminders, data-provider settings, evidence preferences, install guide, a privacy statement, export, and "delete everything". |

On iPhone there's a bottom tab bar (Today, Sky, Plan, Rhythm, Journal, More). On iPad there's a side rail: icons only in portrait, labelled in landscape. Wider screens use multi-column dashboards.

---

## Data integrity: what every number means

Each value carries a provenance badge.

| Badge | Meaning | Examples |
|---|---|---|
| **Calculated** | Deterministic geometry done on your device | Sun position, sunrise and sunset, twilight, air mass, top-of-atmosphere irradiance |
| **Model estimate** | Weather-model output for the grid cell around you. It is not a ground station. | Open-Meteo "current" temperature, cloud cover, wind |
| **Forecast** | A model prediction for a future time | Hourly UV index, clear-sky UV, irradiance |
| **App estimate** | Derived by this app with stated assumptions and wide ranges | The split of modelled irradiance into UV, visible and infrared bands |
| **Your entry** | What you logged | Sleep, sessions, schedule |
| **Stale** | Last known value, older than 3 hours | Shown with its age |
| **Unavailable** | Not supplied. **Never filled in.** | Measured spectral infrared (no provider supplies it) |

- A failed request never replaces data with invented values. The last snapshot stays visible with its timestamp and a stale label, or the app shows an explicit "unavailable" state. Sun calculations keep working offline.
- If Open-Meteo rejects the full set of variables, the app retries with a core set and lists the missing fields.
- Every external number is range-checked before it is shown (`src/lib/data/validate.ts`).
- The app never gives "safe minutes" in the sun and never labels a time window "safe". The UV index (ambient, measured on a horizontal surface) is kept distinct from personal dose.

### Providers

| Need | Provider | Notes |
|---|---|---|
| Weather, UV, irradiance | [Open-Meteo Forecast API](https://open-meteo.com/en/docs) | No key needed. Free for non-commercial use (fair use about 10,000 calls a day). Data licence CC BY 4.0, credited in the app. Radiation values are the mean of the preceding hour. |
| Terrain elevation | Open-Meteo Elevation API (Copernicus DEM, about 90 m) | Only used when GPS gives no altitude. |
| Place search | Open-Meteo Geocoding API | Only the typed text is sent. |
| Sun position and events | On-device NOAA / Meeus algorithm | `src/lib/astro/solar.ts` |

Providers sit behind a `WeatherProvider` interface (`src/lib/data/types.ts`). To add another, implement `fetchSnapshot()` and register it in `src/state/environment.ts`. If a future provider needs a secret key, **don't put the key in the frontend**. Add a small server-side proxy, such as a Cloudflare Worker or Netlify Function, that holds the key, and point the provider at that proxy.

---

## Architecture

```
src/
  lib/astro/solar.ts        NOAA solar engine: position, refraction, events by root-finding, polar cases
  lib/time/tz.ts            IANA time-zone maths (DST-safe local days, wall-clock ↔ UTC)
  lib/data/                 provider interface, Open-Meteo client, validation, freshness, interpolation, WMO codes
  lib/uv.ts                 WHO UV categories, protection text, ambient erythemal dose (SED)
  lib/planner.ts            outdoor windows (UV categories + heat notes)
  lib/advisor.ts            "recommended now" and in-app reminders
  lib/sleep.ts              sleep arithmetic across midnight, summaries, gradual shifts
  lib/recommend.ts          transparent rules: observed → suggestion → why → confidence → test next
  lib/stats.ts              per-day variable table, correlation, experiment analysis
  lib/spectrum.ts           ASTM G173-03 reference data, bands, honest band estimates
  lib/exporters.ts          CSV (formula-injection safe), JSON backup, .ics reminders
  lib/storage/persist.ts    localStorage wrapper, sanitising helpers, tiny external store
  state/                    settings, journal, environment snapshot, solar context, app provider
  content/                  evidence cards + source registry
  components/               design-system primitives, SolarHero, SolarClock, charts, forms
  screens/                  the eight screens (lazy-loaded)
  styles/                   design tokens (palette, type, spacing) + component styles
tests/e2e/                  Playwright specs (iPhone/iPad viewports)
```

- **Stack:** React 19, TypeScript, Vite 8, vite-plugin-pwa (Workbox). Charts are plain SVG with no chart library. Runtime dependencies are only React and two self-hosted open-source fonts.
- **Design:** the palette has Eternal Sky, Steppe Blue, Solar Gold, Dawn, Zenith, Night and Earth tones. Typography is Cormorant Garamond for display text and Inter for interface text, both SIL OFL and self-hosted, with tabular numerals. Signature elements are the shanyrak and sun brand mark, a koshkar-muiz (ram's-horn) ornament band, a sky that follows the real Sun's elevation, a star field at night and a steppe horizon.
- **Theme:** "Follow the Sun" switches to the day palette when the Sun is more than 6° up. Motion respects `prefers-reduced-motion` and can be overridden in Settings.
- **Security:** a strict Content-Security-Policy is added to production builds. The only allowed outside hosts are the two Open-Meteo APIs. There are no analytics, trackers or third-party scripts.

### The solar engine

- It follows the NOAA Solar Calculator (Meeus) equations and includes NOAA's refraction approximation.
- Sunrise and sunset use the standard −0.833° Sun-centre altitude. Civil, nautical and astronomical twilight use −6°, −12° and −18°.
- Events are found by sampling every 5 minutes and refining by bisection, within the location's *local* day. That handles 23- and 25-hour DST days, polar day, polar night and white nights without special cases.
- An optional horizon-dip setting applies only to a raised viewpoint over a flat horizon. Ordinary altitude above sea level doesn't change the horizon.
- **Tests** cross-check the engine against the independent [astronomy-engine](https://github.com/cosinekitty/astronomy) ephemeris:
  - sunrise, sunset, civil, nautical and astronomical twilight and solar noon agree within **±2 minutes** for 6 cities × 4 dates
  - Sun elevation and azimuth agree within **0.05° / 0.1°**
  - also covered: Meeus Example 25.a, Tromsø's midnight sun and polar night, the South Pole, Reykjavík's white nights, New York's 23-hour day and London's 25-hour day

---

## Run it locally

Requirements: Node 20+ (22 recommended).

```bash
npm install
npm run dev          # http://localhost:5173  (hot reload)
npm test             # unit + integration tests (Vitest, jsdom)
npm run build        # type-check + production build into dist/
npm run preview      # serve the production build at http://localhost:4173
npm run test:e2e     # Playwright at iPhone/iPad viewports (needs a build first)
npm run icons        # regenerate icons + iOS splash screens from public/icons/icon.svg
```

To try it on your iPhone or iPad over Wi-Fi, run `npm run dev -- --host` and open the printed `http://<your-computer-ip>:5173` in Safari. Over plain `http` on a LAN address, **GPS location and offline mode are blocked**, because they require HTTPS. Search for a place or enter coordinates instead, or deploy over HTTPS as described below.

No API keys or environment variables are needed.

---

## Deploy (HTTPS is required for GPS and offline mode)

The build is a static folder (`dist/`). It uses relative paths and hash routing, so it works at a domain root or in a sub-path.

### Option A: GitHub Pages (workflow included)

1. Push this repository to GitHub, with `main` as the branch.
2. In the repository go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. The workflow `.github/workflows/deploy.yml` runs the tests, builds and publishes on every push to `main`. The site appears at `https://<user>.github.io/<repo>/`.

### Option B: Netlify, Vercel or Cloudflare Pages

Connect the repository and set the build command to `npm run build` and the output directory to `dist`. No environment variables are needed. Each of these gives you HTTPS automatically.

### Option C: any static host

Run `npm run build` and upload the contents of `dist/`.

---

## Use it on iPhone and iPad

1. Open the HTTPS address in **Safari**.
2. Tap **Share → Add to Home Screen → Add**.
3. Launch **Tengri Solar** from the icon. It runs full screen with its own icon and splash screen.
4. On first launch, pick **Search**, **Use GPS** or **Coordinates**. GPS asks for permission once. If you denied it, go to Settings → Privacy & Security → Location Services → Safari Websites, or the app's own entry.
5. Optionally, open **Rhythm → Add reminders to Calendar (.ics)** to get real wind-down and morning-light alerts from the iOS Calendar.

| Works offline | Needs internet |
|---|---|
| Sun position, sunrise, sunset, twilight, solar clock, seasons | Weather, UV, irradiance |
| Journal, trends, experiments, export | Place search, elevation lookup |
| Knowledge Archive, Spectrum reference data | Refreshing data |
| Last weather snapshot (labelled with its age) | |

The Home Screen app and Safari keep **separate storage**. Use the JSON backup to move data between them.

---

## Privacy

- **Stored on the device only** (`localStorage`, keys prefixed `tengri.`): settings, saved places, the journal, sessions, experiments, recommendation decisions and the last weather snapshot. The service worker caches app files.
- **Sent over the network:**
  - Coordinates (4 decimals, about 11 m), and altitude only if you turn that on, go to `api.open-meteo.com`.
  - Typed place names go to `geocoding-api.open-meteo.com`.
  - Your hosting provider and Open-Meteo can see your IP address, as with any website.
- **Never sent:** journal entries. There are no analytics, accounts or AI services.
- **Delete everything:** Settings → Privacy & data → *Delete all data & reset*.
- **Storage eviction:** Safari may clear storage for websites you haven't used for weeks. Home Screen apps are much less affected. Export backups now and then.

No system can promise absolute privacy. This app keeps what it sends to a minimum and tells you what that is.

---

## Honest limits of a PWA, and a native path

| Wanted | PWA on iOS today | What this app does |
|---|---|---|
| Notifications while closed | Only Web Push for Home Screen apps, and it needs a push server | Calendar `.ics` reminders plus in-app banners. There's no server, so there's no tracking. |
| Control brightness, Night Shift, True Tone | Not possible from the web | Step-by-step guide to the iOS settings |
| HealthKit sleep data | Not available to the web | Manual journal plus CSV/JSON import and export |
| Background location | Not available | Location is only taken when you tap the button |
| Ambient light sensor | Not exposed in Safari | Not used |

**Native migration path.** Wrap the same React app in **Capacitor**, or rebuild the UI in SwiftUI and port the TypeScript logic, which is mostly pure functions in `src/lib`. Then add:

1. HealthKit read access for sleep analysis, mapped to the `DailyEntry` fields
2. `UNUserNotificationCenter` local notifications to replace the `.ics` reminders
3. Optional WeatherKit as a second `WeatherProvider`

The existing tests carry over unchanged.

---

## Verification status for this build

These checks were run in the build sandbox:

- **TypeScript:** `tsc -b` passes in strict mode.
- **Unit and integration tests:** 95 pass across 5 Vitest files. They cover:
  - solar maths versus astronomy-engine, polar cases and DST
  - time-zone conversions
  - Open-Meteo parsing and validation, the 400 fallback, 429 and network errors, missing fields
  - stale and fresh data, and interpolation without filling gaps
  - UV categories and ambient dose
  - sleep arithmetic, the planner, the advisor and reminders, the recommendation rules
  - statistics and experiments
  - storage persistence and corrupted data
  - CSV, JSON and ICS export
  - app shell integration, including the onboarding and network-failure states
- **End-to-end:** 30 Playwright tests pass at five emulated viewports: iPhone SE, iPhone 15, iPhone landscape, iPad portrait and iPad landscape. They cover:
  - every screen renders without horizontal overflow and with the right navigation
  - no JavaScript errors
  - provider failure shows explicit unavailable states
  - onboarding with coordinates
  - a journal entry persists across a reload and shows up in trends
  - the solar clock can be scrubbed with the keyboard
- **Production build:** `npm run build` succeeds and generates the service worker.

**Not verified here:**

- **Live Open-Meteo responses.** The sandbox's network policy blocks `api.open-meteo.com`. The request format follows Open-Meteo's documented parameters, and responses were tested with fixtures that copy its JSON structure. On first use on a real device, confirm the Command Center shows "Updated just now" with a *Model estimate* badge. If the API ever rejects a variable, the app falls back automatically and lists what's missing in Settings → Data providers.
- **Real Safari or WebKit.** Only Chromium was available, with iPhone and iPad emulated by viewport, pixel ratio and touch. Test on your own devices too, especially the Home Screen install, safe areas and GPS.
- **Deployment.** No hosting credentials were available, so the app hasn't been deployed. Follow the steps above.
- **Knowledge library citations.** Entries marked *Not re-verified* in the source registry were entered from well-known references but weren't checked online in this build. For those, links go to PubMed title searches rather than DOIs I couldn't confirm.

---

## Licences and credits

- Weather data: [Open-Meteo.com](https://open-meteo.com), CC BY 4.0.
- Solar reference spectra: ASTM G173-03, via NREL and pvlib-python.
- Fonts: Cormorant Garamond and Inter, SIL Open Font License, bundled via Fontsource.
- Solar algorithm: NOAA Global Monitoring Laboratory, after J. Meeus, *Astronomical Algorithms*.
