# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

# Solar Wanderer — Repository Operations Guide

Project name: **Solar Wanderer** (named on 2026-06-11, repository github.com/hyqzz/Solar-Wanderer). In the code, `heliosphere` refers only to the physical structure of the heliosphere, not an old project name.

This is a browser-based 1:1 real-time solar system exploration application based on real NASA JPL ephemerides, extending from the solar surface to the Oort cloud at 100,000 AU.

- Live Demo: https://sw.icodestar.net
- GitHub Pages (auto-deployed from main branch): https://hyqzz.github.io/Solar-Wanderer/
- Demo Video: https://youtu.be/3rwShi6oF0o

## Common Commands

```bash
npm install          # Install dependencies (three + vite + puppeteer)
npm run dev          # Vite development server → http://localhost:5173
npm run build        # Production build → dist/ (pure static deployment)
npm run preview      # Preview production build (run build first)
npm test             # Offline unit and ephemeris accuracy test suite (Node native test runner, 300+ tests)
node --test tests/ephemeris.test.mjs   # Run single test file
node --test tests/*.test.mjs           # Run all test files
npm run verify       # Online live verification against NASA JPL Horizons (requires internet)
npm run fit-moons    # Refit moon orbits to current epoch (7-epoch least squares + empirical rates)
npm run fetch-ephemeris # Refresh sampled JPL ephemerides (10-year window, sharded by year)
npm run verify-release  # Validate sampled ephemerides against off-grid JPL references
npm run fit-tnos     # Refresh 28 TNO current epoch orbital elements from SBDB
npm run fetch-small-bodies # Refresh 5412 real asteroids/comets (SBDB)
npm run fetch-dem    # Regenerate real DEM tiles (LOLA/MOLA/ETOPO1 → public/dem/)
npm run fetch-vsop87 # Refresh VSOP87D planetary series
npm run make-previews # Regenerate 512px preview textures (progressive loading L1 tier)
npm run fetch-textures # Re-download texture assets
```

If the build fails, run `npm test` first; `npm run verify` failure is usually due to network connectivity or JPL API accessibility.

## Build and Deployment

- Vite is configured with `base: './'`, producing pure static files that can be directly deployed to any CDN or static server.
- Multi-entry build: `index.html` and `en/index.html` output to `dist/` and `dist/en/`.
- GitHub Pages automatic deployment is handled by `.github/workflows/deploy.yml`, triggered on pushes to `main`:
  - `npm ci` → `npm test` → `npm run build` → `actions/deploy-pages@v4`

## Runtime Verification & Diagnostic Tools

Scripts in `tools/` fall into three categories, most requiring the local dev server running:

- **Offline generation / fitting / verification**
  - `node tools/verify-ephemeris.mjs` — Live cross-check against JPL Horizons (`npm run verify` entrypoint)
  - `npm run make-fixtures` — Regenerate `tests/fixtures.json` (requires internet; run fit-moons first)
  - `node tools/fit-moons.mjs` — Refit 21 moon orbits using Horizons state vectors
  - `npm run fetch-ephemeris` — Refresh 10-year window of sampled JPL ephemerides
  - `node tools/fetch-textures.mjs` — Download texture assets
- **Regression / Smoke (requires dev server)**
  - `node tools/repro-r8.mjs` — Center-screen zoom 3-scenario assertions
  - `node tools/repro-r9.mjs` — Camera / terrain / ocean / inertial mode assertions
  - `node tools/repro-r10.mjs` — Focus / water / V continuity assertions
  - `node tools/repro-issue*.mjs` — Specific issue regression verification
  - `node tools/repro-mobile-takeoff.mjs` — Mobile takeoff drag/zoom sensitivity regression
  - `node tools/repro-fixbatch.mjs` — Batch bug fix regression
  - `node tools/smoke-i18n.mjs` — Multilingual UI smoke test
  - `node tools/smoke-mobile.mjs` — Mobile touch UI smoke test
- **Active Probes / Screenshots (requires dev server)**
  - `node tools/probe-r7.mjs` — Auto landing / takeoff / gas giant atmospheric entry
  - `node tools/probe-r8-shot.mjs` — Screenshot probe
  - `node tools/probe-maxdist.mjs` — 400 AU distant label visibility
  - `node tools/audit-visuals.mjs` — Visual inspection audit
  - `node tools/probe-atlas.mjs` — Full disk atlas (17 bodies + rings + Earth night side)
  - `node tools/probe-surface.mjs` — Surface walk atlas (7 bodies horizon + sky, daylight star fading)
  - `node tools/probe-starfade.mjs` — Daylight star fading diagnosis
  - `node tools/capture-demo.mjs` / `capture-mobile.mjs` — Generate demo screenshots

## Tech Stack

- Three.js 0.165 + Vite 5 + Native ESM, no TypeScript.
- WebGL2, logarithmic depth buffer.
- Ephemeris layer consists of pure functions, independently testable in Node.

## High-Level Architecture

| Layer | Directory | Core Responsibilities |
|---|---|---|
| Ephemeris Layer | `src/astro/` | Planets, Moon, satellites, small bodies, TNO orbits, rotation, time conversion, physical constants. Pure functions, testable in Node. |
| Engine Layer | `src/engine/` | Camera (Google Earth style orbit + walk/flight), ship/walking physics, inputs, floating origin, quality scaling. |
| Scene Layer | `src/scene/` | Sun, planet materials, atmospheric scattering, rings, starfield, comets, TNOs, asteroid belt, Kuiper belt, Oort cloud, terrain. |
| UI Layer | `src/ui/` | HUD, label projection, search/directory, educational cards, internationalization. |

Key Files:

- `src/astro/time.js` — UTC → TT → JD conversion, input time baseline for all ephemerides.
- `src/astro/planets.js` / `moon.js` / `moons.js` / `tno.js` — Orbital elements and position calculations.
- `src/astro/bodies.js` — Astrophysical / rotational parameters and IAU rotation models.
- `src/engine/orbitCamera.js` — Exploration mode camera: body-fixed `lat/lon/dist`, focus management, smooth transitions, auto land/takeoff.
- `src/engine/ship.js` — 6DOF flight + surface walking + underwater buoyancy.
- `src/engine/world.js` / `floating.js` — Floating origin scene graph and far-distance registration.
- `src/engine/quality.js` — GPU adaptive tiers (high/lite) and runtime throttling.
- `src/scene/builder.js` — Celestial mesh assembly entrypoint.
- `src/scene/terrain.js` — Multi-scale terrain and LOD origin-relative coordinate precision handling.
- `src/scene/atmosphere.js` — Raymarching atmosphere (Nishita style) and gas giant atmospheric dive.
- `src/main.js` — Application initialization and main render loop.

## Coordinate System Conventions

- **Computation Coordinate System**: Heliocentric Ecliptic J2000, units in km.
- **→ Three.js World**: `(x, y, z)_ecl → (x, z, -y)_three`, ecliptic north corresponds to +Y.
- **Body-Fixed → World**: Identical mapping; prime meridian points to local +X, north pole to +Y.
- Sun point light intensity = `π × (1/dAU²)^0.55` (StandardMaterial, pure white; factor π offsets diffuse 1/π); scaled by `1/d²` in custom shaders.

## Scale and Precision

- True 1:1 km scale; floating origin + logarithmic depth buffer spans from 0.5 m to 1.5×10¹³ km (100,000 AU).
- `camera.far = 1e15 km` (~106 light-years), 21 real bright stars registered at real 3D coordinates producing parallax.
- Precision baselines (vs JPL Horizons): planets ≤0.074°, Moon ≈0.12°, satellites +10 days ≤0.22°.
- Terrain and noise utilize origin-relative coordinates to eliminate fp32 quantization jitter at planetary scale.

## Interaction Modes

1. **Explore Mode (OrbitCamera)**: Default; GE-style drag / wheel zoom, focus locking, smooth fly-to transition, automatic surface landing.
2. **Flight Mode (Ship)**: Press `F`; 6DOF free flight, velocity 1 m/s → 2 AU/s.
3. **Walk Mode (Ship)**: Surface / underwater; WASD movement, mouse look, diving / resurfacing.
4. **Inertial Observation**: Press `V` to toggle body-fixed vs inertial anchoring, allowing observation of satellite orbits.

## Testing and Verification

- Unit tests in `tests/*.test.mjs`:
  - `tests/ephemeris.test.mjs` — Planetary, lunar, satellite, TNO position accuracy
  - `tests/kepler.test.mjs` — Keplerian orbit calculations
  - `tests/physics.test.mjs` — Physical constants and kinematics
  - `tests/rotation.test.mjs` — IAU rotation models
  - `tests/time.test.mjs` — UTC / TT / JD conversion
- Offline benchmark fixtures in `tests/fixtures.json`.
- Run `npm test` to verify all test suites pass.

## Known Limitations

1. Satellite orbits use osculating elements from a 7-epoch least-squares fit + empirical secular rates (`tools/fit-moons.mjs`). At the fitting epoch, error is <0.01°, degrading to 0.1–2° at ±180 days. **Sampled JPL ephemeris covers 2025–2035 (sharded by year); within this window, interpolation yields accuracy <0.001°**; analytical models serve as fallback outside the window.
2. Eclipse shadow cones are geometric approximations.
3. Terrain: Moon, Mars, Earth use real DEMs (LOLA / MOLA / ETOPO1 quadtree tiles in `public/dem/`); remaining bodies use procedural noise combined with real albedo maps.
4. Jupiter's Great Red Spot and cloud belts are animated with latitude wind shear and drift, approximating physical movement.

## Code Style

- Native ESM, no bundler magic in source code.
- Functions preferred over classes.
- Comments should explain "why" rather than repeating literal code actions.
- Ensure `npm test` passes prior to committing.
