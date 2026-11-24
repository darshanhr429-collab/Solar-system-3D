// Astrophysical database: real radii, GM, oblateness, atmospheres, surfaces, rings, and textures.
// Radius in km, GM in km^3/s^2 (gravity g = GM/r^2, km/s^2 -> x1000 for m/s^2).
//
// ── Radius Conventions (radiusKm and oblateness must pair) ─────────────────────────
// The renderer applies mesh.scale.y = 1 - oblateness for non-landable bodies:
//     equatorial radius = radiusKm, polar radius = radiusKm * (1 - oblateness)
// Therefore oblateness is standard flattening f = (a-b)/a, and radiusKm must be equatorial radius a.
// Corrected to standard equatorial radius (1 bar level), polar radii match observations:
//     Jupiter 71492 * (1 - 0.06487) = 66854 km;  Saturn 60268 * (1 - 0.09796) = 54364 km;
//     Uranus 25559 * (1 - 0.02293) = 24973 km;   Neptune 24764 * (1 - 0.01708) = 24341 km.
// Landable rocky bodies (Earth 6371, Mars 3389.5) retain volumetric mean radius and render as spheres:
// DEM tiles, walk collision, and elevation queries rely on sphere R.
// Oblateness for such bodies is retained in data only and omitted during rendering.

export const BODIES = {
  sun: {
    id: 'sun', nameZh: 'Sun', nameEn: 'Sun', type: 'star', parent: null,
    radiusKm: 695700, gm: 1.32712440018e11, oblateness: 0.00005,
    rotation: 'iau', landable: false,
    textures: { map: 'sun.jpg' },
    desc: 'A G2V main-sequence star holding 99.86% of the Solar System\'s mass. Surface ~5772 K; its core fuses hydrogen, releasing 3.8x10^26 watts every second.',
  },
  mercury: {
    id: 'mercury', nameZh: 'Mercury', nameEn: 'Mercury', type: 'rocky', parent: 'sun',
    radiusKm: 2439.7, gm: 2.2032e4, oblateness: 0,
    rotation: 'iau', landable: true,
    surface: { ampKm: 4, roughness: 0.55, craters: 1.0, palette: 'gray' },
    textures: { map: 'mercury.jpg' },
    desc: 'The innermost planet, locked in a 3:2 spin-orbit resonance. Airless, with a 600 deg C day-night swing and a heavily cratered surface.',
  },
  venus: {
    id: 'venus', nameZh: 'Venus', nameEn: 'Venus', type: 'rocky', parent: 'sun',
    radiusKm: 6051.8, gm: 3.24859e5, oblateness: 0,
    rotation: 'iau', landable: true,
    surface: { ampKm: 3, roughness: 0.45, craters: 0.2, palette: 'venus' },
    atmosphere: {
      // Visible 'surface' of Venus is the sulfuric acid cloud deck, albedo ~0.7
      groundAlbedo: 0.7,
      skyFraction: 0.65,   // Sulfuric acid cloud deck: diffuse is primary illumination
      rho0: 65.0,          // Surface atmospheric density kg/m^3 (~53x Earth)
      // Space view: multiplier tuned so cloud map remains visible with distinct terminator
      heightKm: 90, rayleighScaleKm: 15.9, mieScaleKm: 5,
      // Rayleigh orange bias: CO2 + H2SO4 clouds absorb blue light (Venera lander: amber-orange sky)
      rayleigh: [8e-6, 4.5e-6, 1.0e-6],
      // Spectral Mie (orange-weighted): sunlight through 90km CO2+sulfuric acid haze produces amber sky (Venera photography).
      mie: [4.5e-6, 2.6e-6, 0.9e-6],
      mieG: 0.65,  // Tuned: thick clouds scatter evenly, eliminating extreme solar peak
      multiplier: 1.5,
      haze: 0.90,  // Dense aerosol haze layer
      // Surface view: diffuse orange sky (Sun fully obscured), visibility ~5-20 km (preserves amber hue)
      interiorBoost: 5,
      interiorBoostM: 0.6,  // Low Mie forward peak: non-directional glow (Sun not visible on surface)
      fogDensityMult: 5,    // Surface visibility ~5-20 km (Venera measured data)
      // Surface illumination filtered through haze: 92 bar CO2 + sulfuric clouds filter light to deep amber (Venera 13/14)
      groundTint: [1.0, 0.50, 0.14], groundDim: 0.55,
    },
    textures: { map: 'venus_surface.jpg', clouds: 'venus_atmosphere.jpg', cloudsOpaque: true },
    desc: 'Earth\'s near-twin in size, but smothered by a CO2 atmosphere 92x Earth\'s pressure and sulfuric-acid clouds. Surface 465 deg C; it spins backwards, and a day lasts longer than its year.',
  },
  earth: {
    id: 'earth', nameZh: 'Earth', nameEn: 'Earth', type: 'rocky', parent: 'sun',
    radiusKm: 6371.0, gm: 3.986004418e5, oblateness: 0.0033528,
    rotation: 'iau', landable: true,
    surface: { ampKm: 2.5, roughness: 0.5, craters: 0, palette: 'earth', ocean: true },
    atmosphere: {
      groundAlbedo: 0.12,
      ozone: 1,
      msDesat: 1.0,        // Pure scattering dominant (Rayleigh + weak aerosol) -> higher orders tend to white
      skyFraction: 0.20,   // Clear sky diffuse / total irradiance fraction
      heightKm: 60, rayleighScaleKm: 8.5, mieScaleKm: 1.2,
      // Multiplier 0.72: space view reduces disk in-scatter; surface sky brightness restored via interiorBoost to 1.0.
      // Mie anchored to measured aerosol optical depth (continental clear AOD(550nm) ~ 0.10, scale height 1.2km -> beta = 0.083 km^-1).
      rayleigh: [5.802e-6, 13.558e-6, 33.1e-6],
      mie: [7.7e-5, 8.3e-5, 9.3e-5], mieG: 0.72, multiplier: 0.66,
      interiorBoost: 1.52, // Compensates multiplier reduction for surface/low-altitude sky brightness
    },
    // Cloud layer uses earth_clouds.jpg composite map.
    //
    // Composite cloud map provides realistic storm vortex features and high aesthetic balance.
    // Composite cloud map provides realistic storm vortex features and high aesthetic balance.
    // Composite cloud map provides realistic storm vortex features and high aesthetic balance.
    // High-resolution composite clouds retain natural color fidelity.\n    // Composite cloud map provides realistic storm vortex features and high aesthetic balance.
    // Composite cloud map provides realistic storm vortex features and high aesthetic balance.
    // Composite cloud map provides realistic storm vortex features and high aesthetic balance.
    textures: { map: 'earth_day.jpg', night: 'earth_night.jpg', clouds: 'earth_clouds.jpg' },
    desc: 'The only world known to harbor life. 71% of its surface is liquid water, with a nitrogen-oxygen atmosphere and a large moon that steadies its axis. Your home.',
  },
  mars: {
    id: 'mars', nameZh: 'Mars', nameEn: 'Mars', type: 'rocky', parent: 'sun',
    radiusKm: 3389.5, gm: 4.282837e4, oblateness: 0.00589,
    rotation: 'iau', landable: true,
    surface: { ampKm: 8, roughness: 0.6, craters: 0.6, palette: 'mars' },
    atmosphere: {
      groundAlbedo: 0.2,
      ozone: 0.12,
      msDesat: 0.75,       // Dust has moderate absorption (single scattering albedo ~0.9)
      skyFraction: 0.45,   // Dust atmosphere: diffuse fraction higher than Earth (~50% during dust storms)
      rho0: 0.020,         // Surface atmospheric density kg/m^3 (~1.6% of Earth)
      // Daytime: Rayleigh red>blue (simulates dust-dominated butterscotch hue) + Mie forward scattering.
      // Sunset: Fe2O3 dust (~1.5 um) forward scatters blue light more strongly than red,
      // creating signature Martian blue/cyan sunset glow (Curiosity Sol-956, Perseverance Sol-257).
      heightKm: 80, rayleighScaleKm: 11.1, mieScaleKm: 9,
      // Rayleigh scattering at physical scale (thin CO2 atmosphere)
      rayleigh: [5.0e-7, 3.0e-7, 1.2e-7],
      // betaM [R,G,B]: anchored to measured dust optical depth (clear period visible tau ~ 0.4, scale height ~9 km).
      // Spectral scattering coefficient: Fe2O3 dust absorbs blue more than red, scattering butterscotch light.
      mie: [4.4e-5, 3.6e-5, 2.8e-5],
      // mieG [R,G,B]: physical range (measured Fe2O3 g ~ 0.55-0.75); sharper blue peak produces blue sunset glow
      mieG: [0.60, 0.65, 0.72],
      multiplier: 0.75,  // Calibrated with tau: sky-to-ground brightness ratio aligned with physical references
      haze: 0.35,   // Near-surface dust layer (scale height ~2 km): warm horizon band and depth
      // Split interiorBoost: active only when camera is inside atmosphere, space view unaffected.
      // uBoost (Rayleigh) = 8 -> bright daytime amber sky; uBoostM (Mie) = 1.5 -> moderate forward glow, Sun disk remains crisp.
      interiorBoost: 8,
      interiorBoostM: 1.5,
    },
    textures: { map: 'mars.jpg' },
    desc: 'The Red Planet. Home to the tallest volcano (Olympus Mons, 21.9 km) and longest canyon (Valles Marineris, 4000 km) in the Solar System. Thin CO2 air; dust storms can engulf the globe.',
  },
  jupiter: {
    id: 'jupiter', nameZh: 'Jupiter', nameEn: 'Jupiter', type: 'gas', parent: 'sun',
    // Equatorial radius (1 bar level), not volumetric mean - see radius conventions above
    radiusKm: 71492, gm: 1.26686534e8, oblateness: 0.06487,
    rotation: 'iau', landable: false,
    atmosphere: {
      heightKm: 350, rayleighScaleKm: 27, mieScaleKm: 27,
      rayleigh: [4e-7, 3.5e-7, 2.5e-7], mie: 3e-7, mieG: 0.7, multiplier: 0.8,
    },
    // Jupiter faint rings: Halo (1.40-1.71 R_J), Main (1.72-1.81 R_J), Gossamer (to 3.11 R_J).
    // Composed of micron-sized dust (tau ~1e-6); forward-scattering dominates, diffuse is very low.
    rings: { innerKm: 100000, outerKm: 222000, texture: null, opacity: 0.18, diffuse: 0.004,
      tint: [0.62, 0.55, 0.48],
      narrow: [
        [111000, 22000, 0.006],   // Halo (vertically thick diffuse halo)
        [126000, 6400, 0.014],    // Main (thin and dense, brightest Jovian ring band)
        [155000, 52000, 0.005],   // Amalthea Gossamer
        [202000, 40000, 0.003],   // Thebe Gossamer
      ] },
    textures: { map: 'jupiter.jpg' },
    desc: 'The largest planet - 2.5x the mass of all the others combined. The Great Red Spot is an anticyclone raging for centuries, ringed by a strong magnetic field and lethal radiation belts.',
  },
  saturn: {
    id: 'saturn', nameZh: 'Saturn', nameEn: 'Saturn', type: 'gas', parent: 'sun',
    radiusKm: 60268, gm: 3.7931187e7, oblateness: 0.09796,
    rotation: 'iau', landable: false,
    atmosphere: {
      heightKm: 300, rayleighScaleKm: 40, mieScaleKm: 40,
      rayleigh: [3.5e-7, 3.0e-7, 2.0e-7], mie: 2.5e-7, mieG: 0.7, multiplier: 0.8,
    },
    // Ring tint: neutral bright grey-white matching water ice composition (Cassini photography)
    rings: { innerKm: 74500, outerKm: 140220, texture: 'saturn_ring.png', tint: [1.18, 1.15, 1.06] },
    textures: { map: 'saturn.jpg' },
    desc: 'A gas giant with a magnificent icy ring system, and a density lower than water. The rings average just ~20 m thick yet span tens of thousands of km.',
  },
  uranus: {
    id: 'uranus', nameZh: 'Uranus', nameEn: 'Uranus', type: 'ice', parent: 'sun',
    radiusKm: 25559, gm: 5.793939e6, oblateness: 0.02293,
    rotation: 'iau', landable: false,
    atmosphere: {
      heightKm: 250, rayleighScaleKm: 28, mieScaleKm: 28,
      rayleigh: [2.0e-7, 3.2e-7, 3.6e-7], mie: 1.5e-7, mieG: 0.65, multiplier: 0.9,
    },
    rings: { innerKm: 37000, outerKm: 51140, texture: null, opacity: 0.55, tint: [0.45, 0.45, 0.48],
      // Measured narrow ring structures (center radius km, width km, relative optical depth): rings 6, 5, 4, alpha, beta, eta, gamma, delta, epsilon
      narrow: [
        [41837, 2, 0.35], [42234, 3, 0.4], [42570, 2, 0.35],  // 6, 5, 4
        [44718, 7, 0.7], [45661, 9, 0.65],                     // α, β
        [47176, 2, 0.3], [47627, 4, 0.6], [48300, 4, 0.55],    // η, γ, δ
        [51149, 45, 1.0],                                      // epsilon (main ring, widest and brightest)
      ] },
    textures: { map: 'uranus.jpg' },
    desc: 'An ice giant tipped on its side (98 deg axial tilt). Methane absorbs red light, giving its cyan hue; its atmosphere is the coldest in the Solar System (-224 deg C).',
  },
  neptune: {
    id: 'neptune', nameZh: 'Neptune', nameEn: 'Neptune', type: 'ice', parent: 'sun',
    radiusKm: 24764, gm: 6.836529e6, oblateness: 0.01708,
    rotation: 'iau', landable: false,
    atmosphere: {
      heightKm: 250, rayleighScaleKm: 25, mieScaleKm: 25,
      rayleigh: [1.8e-7, 2.8e-7, 4.0e-7], mie: 1.5e-7, mieG: 0.65, multiplier: 0.9,
    },
    // Neptune ring system: Galle (N42), Le Verrier (N53), Lassell (N55), Arago (N63), Adams (N63). Very dark (tau ~1e-4).
    rings: { innerKm: 41900, outerKm: 62980, texture: null, opacity: 0.3, diffuse: 0.004,
      tint: [0.50, 0.52, 0.60],
      narrow: [
        [41900, 2000, 0.010],     // Galle (N42)
        [53200, 113, 0.012],      // Le Verrier (N53)
        [55400, 4400, 0.006],     // Lassell (N55) wide sheet
        [57600, 100, 0.009],      // Arago (N63)
        [62930, 50, 0.016],       // Adams (N63)
      ] },
    textures: { map: 'neptune.jpg' },
    desc: 'The most distant planet, discovered through mathematics. It has the fastest winds in the Solar System (2100 km/h); its deep blue comes from methane and an unknown absorber.',
  },
  pluto: {
    id: 'pluto', nameZh: 'Pluto', nameEn: 'Pluto', type: 'dwarf', parent: 'sun',
    radiusKm: 1188.3, gm: 8.71e2, oblateness: 0,
    rotation: 'iau', landable: true,
    surface: { ampKm: 3, roughness: 0.5, craters: 0.4, palette: 'pluto' },
    textures: { map: 'pluto.jpg' },
    desc: 'A Kuiper Belt dwarf planet, mutually tidally locked with Charon. New Horizons flew by in 2015 and revealed the nitrogen-ice heart, Sputnik Planitia.',
  },
};

// Major moon physical data (orbital elements generated in moonsData.generated.js via Horizons fit)
export const MOON_PHYS = {
  moon:      { nameZh: 'Moon', nameEn: 'Moon', parent: 'earth', radiusKm: 1737.4, gm: 4.9048695e3,
               landable: true, surface: { ampKm: 5, roughness: 0.55, craters: 1.2, palette: 'gray' },
               textures: { map: 'moon.jpg' },
               desc: 'Earth\'s only natural satellite, tidally locked to always show the same face. The only world beyond Earth humans have walked on.' },
  phobos:    { nameZh: 'Phobos', nameEn: 'Phobos', parent: 'mars', radiusKm: 11.27, gm: 7.087e-4,
               landable: true, shape: { dims: [27.0, 18.4, 22.0] }, // Triaxial ellipsoid fallback; shape model preferred
               shapeModel: 'phobos',   // PDS Thomas radius grid (2 deg x 2 deg), see tools/fetch-shapes.mjs
               // Smooth cratered terrain scaled to body radius (amp ~ 0.4% R) to prevent artificial spikes.
               // Smooth cratered terrain scaled to body radius (amp ~ 0.4% R) to prevent artificial spikes.
               surface: { ampKm: 0.05, roughness: 0.45, craters: 0.7, palette: 'gray' },
               textures: { map: 'phobos.jpg' },
               desc: 'Mars\'s larger moon, potato-shaped (27x22x18 km) on a very low orbit (9376 km), spiraling inward by 1.8 m per century.' },
  deimos:    { nameZh: 'Deimos', nameEn: 'Deimos', parent: 'mars', radiusKm: 6.2, gm: 9.6e-5,
               landable: true, shape: { dims: [15.0, 11.0, 12.2] }, // Triaxial ellipsoid fallback; shape model preferred
               shapeModel: 'deimos',
               // Noise amplitude scaled proportionally to radius to avoid spike artifacts on small moons.
               surface: { ampKm: 0.03, roughness: 0.45, craters: 0.7, palette: 'gray' },
               textures: { map: 'deimos.jpg' },
               desc: 'Mars\'s smaller, more distant moon - irregular, blanketed in fine dust.' },
  io:        { nameZh: 'Io', nameEn: 'Io', parent: 'jupiter', radiusKm: 1821.6, gm: 5.916e3,
               landable: true, surface: { ampKm: 4, roughness: 0.5, craters: 0.1, palette: 'io' },
               textures: { map: 'io.jpg' },
               desc: 'The most volcanically active body in the Solar System; Jupiter\'s tidal heating coats it in sulfur volcanoes, giving it a pizza-like yellow-orange hue.' },
  europa:    { nameZh: 'Europa', nameEn: 'Europa', parent: 'jupiter', radiusKm: 1560.8, gm: 3.203e3,
               landable: true, surface: { ampKm: 0.8, roughness: 0.35, craters: 0.05, palette: 'ice' },
               textures: { map: 'europa.png' },
               desc: 'Beneath its ice shell hides an ocean holding more liquid water than all of Earth\'s - a prime target in the search for extraterrestrial life.' },
  ganymede:  { nameZh: 'Ganymede', nameEn: 'Ganymede', parent: 'jupiter', radiusKm: 2634.1, gm: 9.887e3,
               landable: true, surface: { ampKm: 2, roughness: 0.45, craters: 0.7, palette: 'gray' },
               textures: { map: 'ganymede.jpg' },
               desc: 'The largest moon in the Solar System, bigger than Mercury, and the only moon with its own magnetic field.' },
  callisto:  { nameZh: 'Callisto', nameEn: 'Callisto', parent: 'jupiter', radiusKm: 2410.3, gm: 7.179e3,
               landable: true, surface: { ampKm: 2.5, roughness: 0.5, craters: 1.3, palette: 'callisto' },
               textures: { map: 'callisto.jpg' },
               desc: 'The most heavily cratered body in the Solar System; its ancient surface, layered with impact scars, is 4 billion years old.' },
  mimas:     { nameZh: 'Mimas', nameEn: 'Mimas', parent: 'saturn', radiusKm: 198.2, gm: 2.504,
               landable: true,
               // Smooth cratered surface matching Mimas terrain characteristics (amp ~ 0.4% R).
               // Smooth cratered surface matching Mimas terrain characteristics (amp ~ 0.4% R).
               surface: { ampKm: 0.8, roughness: 0.5, craters: 0.8, palette: 'iceBright' },
               textures: { map: 'mimas.jpg' },
               desc: 'Its enormous Herschel crater makes it look strikingly like the \"Death Star\".' },
  enceladus: { nameZh: 'Enceladus', nameEn: 'Enceladus', parent: 'saturn', radiusKm: 252.1, gm: 7.211,
               landable: true, surface: { ampKm: 1, roughness: 0.35, craters: 0.3, palette: 'iceBright' },
               textures: { map: 'enceladus.jpg' },
               desc: 'South-polar \'tiger stripe\' fractures jet ice plumes that feed Saturn\'s E ring; its subsurface ocean holds organic molecules. With an albedo near 1, it is the whitest body in the Solar System.' },
  tethys:    { nameZh: 'Tethys', nameEn: 'Tethys', parent: 'saturn', radiusKm: 531.1, gm: 41.21,
               landable: true, surface: { ampKm: 2, roughness: 0.5, craters: 1.0, palette: 'iceMid' },
               textures: { map: 'tethys.jpg' },
               desc: 'Made almost entirely of water ice, with a density of just 0.98 g/cm3.' },
  dione:     { nameZh: 'Dione', nameEn: 'Dione', parent: 'saturn', radiusKm: 561.4, gm: 73.116,
               landable: true, surface: { ampKm: 2, roughness: 0.5, craters: 0.9, palette: 'iceBright' },
               textures: { map: 'dione.jpg' },
               desc: 'An icy moon crisscrossed by bright ice cliffs across its trailing hemisphere.' },
  rhea:      { nameZh: 'Rhea', nameEn: 'Rhea', parent: 'saturn', radiusKm: 763.8, gm: 153.94,
               landable: true, surface: { ampKm: 2, roughness: 0.5, craters: 1.1, palette: 'iceBright' },
               textures: { map: 'rhea.jpg' },
               desc: 'Saturn\'s second-largest moon - an ancient, heavily cratered iceball.' },
  titan:     { nameZh: 'Titan', nameEn: 'Titan', parent: 'saturn', radiusKm: 2574.7, gm: 8.978e3,
               landable: true, surface: { ampKm: 1.5, roughness: 0.4, craters: 0.1, palette: 'titan' },
               textures: { map: 'titan.jpg' },
               atmosphere: { groundAlbedo: 0.10, skyFraction: 0.55, heightKm: 200, rayleighScaleKm: 20, mieScaleKm: 50,
                             // Space view multiplier tuned to preserve saturated orange disc without bleaching.
                             // Space view multiplier tuned to preserve saturated orange disc without bleaching.
                             // Spectral Mie: tholin haze absorbs blue light strongly, giving rich orange internal scatter.
                             // Spectral Mie: tholin haze absorbs blue light strongly, giving rich orange internal scatter.
                             // Optical depth anchored to Cassini/Huygens measurements (tau ~ 3-5, haze scale height ~50 km).
                             // Optical depth anchored to Cassini/Huygens measurements (tau ~ 3-5, haze scale height ~50 km).
                             // Optical depth anchored to Cassini/Huygens measurements (tau ~ 3-5, haze scale height ~50 km).
                             // Optical depth anchored to Cassini/Huygens measurements (tau ~ 3-5, haze scale height ~50 km).
                             // Optical depth anchored to Cassini/Huygens measurements (tau ~ 3-5, haze scale height ~50 km).
                             // Optical depth anchored to Cassini/Huygens measurements (tau ~ 3-5, haze scale height ~50 km).
                             rayleigh: [8e-7, 5e-7, 2e-7], mie: [7.4e-5, 5.6e-5, 3.4e-5], mieG: 0.7, multiplier: 1.0,
                             interiorBoost: 1.9,
                             // Surface illuminated by diffuse orange ambient light filtered through tholin haze.
                             // Surface illuminated by diffuse orange ambient light filtered through tholin haze.
                             groundTint: [1.0, 0.60, 0.28], groundDim: 0.9,
                             // Near-surface haze boundary layer observed below 20 km (scale height ~0.22x main deck).
                             // Near-surface haze boundary layer observed below 20 km (scale height ~0.22x main deck).
                             msDesat: 0.0, // Tholin strongly absorbs blue: higher orders remain orange; desaturation disabled
                             haze: 0.30 }, // Hydrocarbon tholin haze, dense orange boundary layer fog
               desc: 'The only moon with a thick atmosphere (1.5x Earth\'s pressure), with lakes and rivers of liquid methane beneath a global orange haze.' },
  iapetus:   { nameZh: 'Iapetus', nameEn: 'Iapetus', parent: 'saturn', radiusKm: 734.5, gm: 120.51,
               landable: true, surface: { ampKm: 4, roughness: 0.55, craters: 1.0, palette: 'iapetus' },
               textures: { map: 'iapetus.jpg' },
               desc: 'The yin-yang moon: its leading hemisphere is coal-black, its trailing hemisphere snow-white, with a mysterious ridge running along its equator.' },
  miranda:   { nameZh: 'Miranda', nameEn: 'Miranda', parent: 'uranus', radiusKm: 235.8, gm: 4.4,
               landable: true,
               // Verona Rupes cliff region; noise amplitude tuned to ~0.4% R to prevent artificial spikes.
               // Verona Rupes cliff region; noise amplitude tuned to ~0.4% R to prevent artificial spikes.
               surface: { ampKm: 0.9, roughness: 0.5, craters: 0.6, palette: 'iceMid' },
               textures: { map: 'miranda.jpg' },
               desc: 'The most geologically chaotic moon, home to Verona Rupes - the tallest cliff in the Solar System (20 km).' },
  ariel:     { nameZh: 'Ariel', nameEn: 'Ariel', parent: 'uranus', radiusKm: 578.9, gm: 86.4,
               landable: true, surface: { ampKm: 2, roughness: 0.5, craters: 0.7, palette: 'iceDim' },
               textures: { map: 'ariel.jpg' },
               desc: 'Uranus\'s brightest moon, with young canyons and plains.' },
  umbriel:   { nameZh: 'Umbriel', nameEn: 'Umbriel', parent: 'uranus', radiusKm: 584.7, gm: 81.5,
               landable: true, surface: { ampKm: 2, roughness: 0.5, craters: 1.0, palette: 'dark' },
               textures: { map: 'umbriel.jpg' },
               desc: 'Uranus\'s darkest large moon - ancient and enigmatic.' },
  titania:   { nameZh: 'Titania', nameEn: 'Titania', parent: 'uranus', radiusKm: 788.4, gm: 228.2,
               landable: true, surface: { ampKm: 2, roughness: 0.5, craters: 0.8, palette: 'gray' },
               textures: { map: 'titania.jpg' },
               desc: 'Uranus\'s largest moon, scored by huge rift canyons.' },
  oberon:    { nameZh: 'Oberon', nameEn: 'Oberon', parent: 'uranus', radiusKm: 761.4, gm: 192.4,
               landable: true, surface: { ampKm: 2.5, roughness: 0.5, craters: 1.0, palette: 'gray' },
               textures: { map: 'oberon.jpg' },
               desc: 'Uranus\'s outermost large moon, with mysterious dark material on its crater floors.' },
  triton:    { nameZh: 'Triton', nameEn: 'Triton', parent: 'neptune', radiusKm: 1353.4, gm: 1.428e3,
               landable: true, surface: { ampKm: 1.5, roughness: 0.4, craters: 0.2, palette: 'triton' },
               textures: { map: 'triton.jpg' },
               desc: 'The only large moon in a retrograde orbit - a captured Kuiper Belt object. At -235 deg C, its nitrogen geysers erupt 8 km high.' },
  charon:    { nameZh: 'Charon', nameEn: 'Charon', parent: 'pluto', radiusKm: 606.0, gm: 105.88,
               landable: true, surface: { ampKm: 3, roughness: 0.5, craters: 0.7, palette: 'gray' },
               textures: { map: 'charon.jpg' },
               desc: 'The largest moon relative to its primary (half Pluto\'s radius); mutually tidally locked with Pluto, with a dark-red \'Mordor\' cap at its north pole.' },

  // ── Extended Batch ──────────────────────────────────────────────────────────
  // Radius is mean volumetric radius; GM converted from mass (GM = 6.674e-20 * M[kg]).
  // Noise amplitude scaled proportionally to radius to avoid spike artifacts on small moons.
  amalthea:  { nameZh: 'Amalthea', nameEn: 'Amalthea', parent: 'jupiter', radiusKm: 83.5, gm: 0.1388,
               landable: true, surface: { ampKm: 1.5, roughness: 0.6, craters: 0.6, palette: 'jupInner' },
               desc: 'The reddest moon of the inner Jovian system, highly irregular in shape (270x168x150 km).' },
  thebe:     { nameZh: 'Thebe', nameEn: 'Thebe', parent: 'jupiter', radiusKm: 49.3, gm: 0.0287,
               landable: true, surface: { ampKm: 1.2, roughness: 0.6, craters: 0.7, palette: 'jupInner' } },
  metis:     { nameZh: 'Metis', nameEn: 'Metis', parent: 'jupiter', radiusKm: 21.5, gm: 0.0024,
               landable: true, surface: { ampKm: 0.8, roughness: 0.6, craters: 0.8, palette: 'jupInner' } },
  adrastea:  { nameZh: 'Adrastea', nameEn: 'Adrastea', parent: 'jupiter', radiusKm: 8.2, gm: 0.000496,
               landable: true, surface: { ampKm: 0.5, roughness: 0.6, craters: 0.8, palette: 'jupInner' } },

  hyperion:  { nameZh: 'Hyperion', nameEn: 'Hyperion', parent: 'saturn', radiusKm: 135.0, gm: 0.375,
               landable: true, shapeModel: 'hyperion',
               surface: { ampKm: 6, roughness: 0.8, craters: 1.1, palette: 'hyperion' },
               desc: 'Largest highly irregular body in the Solar System (410x260x220 km) with chaotic rotation and sponge-like craters.' },
  phoebe:    { nameZh: 'Phoebe', nameEn: 'Phoebe', parent: 'saturn', radiusKm: 106.5, gm: 0.553,
               landable: true, surface: { ampKm: 4, roughness: 0.7, craters: 1.0, palette: 'phoebe' },
               desc: 'Retrograde moon likely captured from the Kuiper Belt; source of Saturn\'s vast Phoebe ring.' },
  janus:     { nameZh: 'Janus', nameEn: 'Janus', parent: 'saturn', radiusKm: 89.5, gm: 0.127,
               landable: true, shapeModel: 'janus',
               surface: { ampKm: 2.5, roughness: 0.6, craters: 0.9, palette: 'satIce' } },
  epimetheus:{ nameZh: 'Epimetheus', nameEn: 'Epimetheus', parent: 'saturn', radiusKm: 58.1, gm: 0.0352,
               landable: true, shapeModel: 'epimetheus',
               surface: { ampKm: 2, roughness: 0.6, craters: 0.9, palette: 'satIce' },
               desc: 'Shares virtually the same orbit as Janus, swapping orbital positions every four years.' },
  prometheus: { nameZh: 'Prometheus', nameEn: 'Prometheus', parent: 'saturn', radiusKm: 43.1, gm: 0.01065,
               landable: true, surface: { ampKm: 1.8, roughness: 0.7, craters: 0.8, palette: 'satIce' } },
  pandora:   { nameZh: 'Pandora', nameEn: 'Pandora', parent: 'saturn', radiusKm: 40.7, gm: 0.00915,
               landable: true, surface: { ampKm: 1.8, roughness: 0.7, craters: 0.8, palette: 'satIce' } },
  pan:       { nameZh: 'Pan', nameEn: 'Pan', parent: 'saturn', radiusKm: 14.1, gm: 0.00033,
               landable: true, surface: { ampKm: 0.8, roughness: 0.6, craters: 0.5, palette: 'satIce' },
               desc: 'Shepherd moon orbiting inside Encke gap in Saturn\'s A ring, shaped like a ravioli dumpling.' },

  puck:      { nameZh: 'Puck', nameEn: 'Puck', parent: 'uranus', radiusKm: 81.0, gm: 0.1934,
               landable: true, surface: { ampKm: 2.5, roughness: 0.6, craters: 0.9, palette: 'puck' } },
  portia:    { nameZh: 'Portia', nameEn: 'Portia', parent: 'uranus', radiusKm: 67.6, gm: 0.1121,
               landable: true, surface: { ampKm: 2, roughness: 0.6, craters: 0.8, palette: 'uranDark' } },
  juliet:    { nameZh: 'Juliet', nameEn: 'Juliet', parent: 'uranus', radiusKm: 53.0, gm: 0.0374,
               landable: true, surface: { ampKm: 1.8, roughness: 0.6, craters: 0.8, palette: 'uranDark' } },
  ophelia:   { nameZh: 'Ophelia', nameEn: 'Ophelia', parent: 'uranus', radiusKm: 21.4, gm: 0.01201,
               landable: true, surface: { ampKm: 1, roughness: 0.6, craters: 0.7, palette: 'uranDark' } },
  cordelia:  { nameZh: 'Cordelia', nameEn: 'Cordelia', parent: 'uranus', radiusKm: 20.1, gm: 0.0083,
               landable: true, surface: { ampKm: 1, roughness: 0.6, craters: 0.7, palette: 'uranDark' } },
  bianca:    { nameZh: 'Bianca', nameEn: 'Bianca', parent: 'uranus', radiusKm: 27.0, gm: 0.00614,
               landable: true, surface: { ampKm: 1.2, roughness: 0.6, craters: 0.7, palette: 'uranDark' } },
  cressida:  { nameZh: 'Cressida', nameEn: 'Cressida', parent: 'uranus', radiusKm: 41.0, gm: 0.0227,
               landable: true, surface: { ampKm: 1.5, roughness: 0.6, craters: 0.8, palette: 'uranDark' } },
  desdemona: { nameZh: 'Desdemona', nameEn: 'Desdemona', parent: 'uranus', radiusKm: 32.0, gm: 0.01201,
               landable: true, surface: { ampKm: 1.4, roughness: 0.6, craters: 0.7, palette: 'uranDark' } },
  rosalind:  { nameZh: 'Rosalind', nameEn: 'Rosalind', parent: 'uranus', radiusKm: 36.0, gm: 0.01669,
               landable: true, surface: { ampKm: 1.4, roughness: 0.6, craters: 0.7, palette: 'uranDark' } },
  belinda:   { nameZh: 'Belinda', nameEn: 'Belinda', parent: 'uranus', radiusKm: 45.0, gm: 0.0240,
               landable: true, surface: { ampKm: 1.6, roughness: 0.6, craters: 0.8, palette: 'uranDark' } },

  nereid:    { nameZh: 'Nereid', nameEn: 'Nereid', parent: 'neptune', radiusKm: 170.0, gm: 2.069,
               landable: true, surface: { ampKm: 4, roughness: 0.7, craters: 0.8, palette: 'nereid' },
               desc: 'Most eccentric large moon orbit in the Solar System (e ~ 0.75), likely captured from the Kuiper Belt.' },
  proteus:   { nameZh: 'Proteus', nameEn: 'Proteus', parent: 'neptune', radiusKm: 210.0, gm: 2.937,
               landable: true, surface: { ampKm: 5, roughness: 0.7, craters: 1.0, palette: 'proteus' },
               desc: 'Heavily cratered, irregular body near the relaxation limit, dark as soot (albedo 0.096).' },
  larissa:   { nameZh: 'Larissa', nameEn: 'Larissa', parent: 'neptune', radiusKm: 97.0, gm: 0.2803,
               landable: true, surface: { ampKm: 3, roughness: 0.7, craters: 0.9, palette: 'nepInner' } },
  galatea:   { nameZh: 'Galatea', nameEn: 'Galatea', parent: 'neptune', radiusKm: 88.0, gm: 0.1415,
               landable: true, surface: { ampKm: 3, roughness: 0.7, craters: 0.9, palette: 'nepInner' } },
  despina:   { nameZh: 'Despina', nameEn: 'Despina', parent: 'neptune', radiusKm: 75.0, gm: 0.1402,
               landable: true, surface: { ampKm: 2.5, roughness: 0.7, craters: 0.8, palette: 'nepInner' } },
  thalassa:  { nameZh: 'Thalassa', nameEn: 'Thalassa', parent: 'neptune', radiusKm: 41.0, gm: 0.0232,
               landable: true, surface: { ampKm: 1.5, roughness: 0.6, craters: 0.7, palette: 'nepInner' } },
  naiad:     { nameZh: 'Naiad', nameEn: 'Naiad', parent: 'neptune', radiusKm: 33.0, gm: 0.0130,
               landable: true, surface: { ampKm: 1.2, roughness: 0.6, craters: 0.7, palette: 'nepInner' } },

  nix:       { nameZh: 'Nix', nameEn: 'Nix', parent: 'pluto', radiusKm: 19.5, gm: 0.0030,
               landable: true, surface: { ampKm: 1, roughness: 0.6, craters: 0.7, palette: 'gray' },
               desc: 'Irregular moon of Pluto photographed by New Horizons in 2015, in chaotic non-synchronous rotation.' },
  hydra:     { nameZh: 'Hydra', nameEn: 'Hydra', parent: 'pluto', radiusKm: 20.5, gm: 0.0032,
               landable: true, surface: { ampKm: 1, roughness: 0.6, craters: 0.7, palette: 'gray' } },
  kerberos:  { nameZh: 'Kerberos', nameEn: 'Kerberos', parent: 'pluto', radiusKm: 9.5, gm: 0.0011,
               landable: true, surface: { ampKm: 0.6, roughness: 0.6, craters: 0.7, palette: 'gray' } },
  styx:      { nameZh: 'Styx', nameEn: 'Styx', parent: 'pluto', radiusKm: 8.0, gm: 0.00067,
               landable: true, surface: { ampKm: 0.5, roughness: 0.6, craters: 0.7, palette: 'gray' } },
};

/** Surface gravity acceleration (m/s^2) */
/**
 * Hapke regolith photometric parameters for airless bodies (Hapke 1981 / 1986 simplified model).
 *   w      Single scattering albedo (0-1)
 *   B0, h  Opposition surge amplitude and angular half-width (radians)
 *   g      Henyey-Greenstein asymmetry parameter (negative = backscattering)
 * Reproduces the dramatic surge in brightness at opposition (e.g. full Moon ~40% brighter than linear extrapolation).
 */
export const HAPKE_PARAMS = {
  // Silicate regolith: dark, strong backscattering, marked opposition surge
  moon:       { w: 0.23, B0: 1.6, h: 0.06, g: -0.35 },
  mercury:    { w: 0.14, B0: 1.5, h: 0.06, g: -0.35 },
  phobos:     { w: 0.07, B0: 1.3, h: 0.06, g: -0.30 },
  deimos:     { w: 0.08, B0: 1.3, h: 0.06, g: -0.30 },
  // Sulfur / silicate mixture
  io:         { w: 0.55, B0: 1.1, h: 0.07, g: -0.30 },
  // Icy Galilean moons: higher albedo, weaker opposition surge
  europa:     { w: 0.8, B0: 0.8, h: 0.05, g: -0.25 },
  ganymede:   { w: 0.45, B0: 0.8, h: 0.05, g: -0.25 },
  callisto:   { w: 0.22, B0: 1.0, h: 0.06, g: -0.28 },
  // Saturnian icy moons: highly reflective water ice matching measured geometric albedos (Enceladus ~0.99).
  mimas:      { w: 0.99, B0: 0.7, h: 0.05, g: -0.22 },
  enceladus:  { w: 0.98, B0: 0.5, h: 0.04, g: -0.20 },
  tethys:     { w: 0.95, B0: 0.6, h: 0.05, g: -0.22 },
  dione:      { w: 0.99, B0: 0.7, h: 0.05, g: -0.24 },
  rhea:       { w: 0.98, B0: 0.7, h: 0.05, g: -0.24 },
  // Two-tone surface: compromise parameter; dark hemisphere contrast provided by albedo texture map
  iapetus:    { w: 0.45, B0: 0.9, h: 0.05, g: -0.28 },
  // Uranian moons: moderate albedo ice-rock mixtures
  miranda:    { w: 0.40, B0: 0.9, h: 0.05, g: -0.26 },
  ariel:      { w: 0.42, B0: 0.9, h: 0.05, g: -0.26 },
  umbriel:    { w: 0.22, B0: 1.0, h: 0.06, g: -0.28 },
  titania:    { w: 0.30, B0: 0.9, h: 0.05, g: -0.27 },
  oberon:     { w: 0.25, B0: 1.0, h: 0.06, g: -0.28 },
  // Triton & Plutinos: nitrogen / methane ice, high albedo
  triton:     { w: 0.9, B0: 0.8, h: 0.05, g: -0.25 },
  pluto:      { w: 0.45, B0: 0.9, h: 0.05, g: -0.27 },
  charon:     { w: 0.35, B0: 0.9, h: 0.05, g: -0.27 },
};

export function surfaceGravity(body) {
  return (body.gm / (body.radiusKm * body.radiusKm)) * 1000;
}

/** Planetary rotation period (hours, sidereal day) */
export function rotationPeriodHours(bodyId) {
  const p = { sun: 609.12, mercury: 1407.5, venus: -5832.5, earth: 23.934, mars: 24.623,
              jupiter: 9.925, saturn: 10.656, uranus: -17.24, neptune: 16.11, pluto: -153.29 };
  return p[bodyId] ?? null;
}
