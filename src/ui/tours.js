// Educational Tour System: Guides users through key Solar System landmarks along scripted paths.
// Paired with narrated text and speech synthesis (TTS), transforming exploration into an immersive learning journey.
//
// Design principles:
// - Each checkpoint = one GE-style flyTo animation + dwell narration; users can next/prev/skip at any time.
// - Narrations are multilingual data objects suited for rich narrative flow.
// - dist: camera distance factor relative to body radius; null for small probes/boundary points.
// - action: informs integration layer of intent (flyTo/land/lookAt/zoomOut); TourSystem handles flyTo.

import { LANG } from './i18n.js';

// ── Tour UI Localized Strings ──
const UI = {
  'tour.start':      { zh: 'Start tour', en: 'Start tour', es: 'Iniciar gira', ja: 'Start tour', fr: 'Démarrer la visite', de: 'Tour starten', ru: 'Начать тур' },
  'tour.next':       { zh: 'Next', en: 'Next', es: 'Siguiente', ja: 'Next', fr: 'Suivant', de: 'Weiter', ru: 'Далее' },
  'tour.prev':       { zh: 'Prev', en: 'Prev', es: 'Anterior', ja: 'Prev', fr: 'Précédent', de: 'Zurück', ru: 'Назад' },
  'tour.skip':       { zh: 'Skip tour', en: 'Skip tour', es: 'Saltar', ja: 'Skip tour', fr: 'Passer', de: 'Überspringen', ru: 'Пропустить' },
  'tour.done':       { zh: 'Tour complete', en: 'Tour complete', es: 'Gira completada', ja: 'Tour complete', fr: 'Visite terminée', de: 'Tour abgeschlossen', ru: 'Тур завершён' },
  'tour.checkpoint': { zh: 'Stop {n}/{t}', en: 'Stop {n}/{t}', es: 'Parada {n}/{t}', ja: 'Stop {n}/{t}', fr: 'Arrêt {n}/{t}', de: 'Station {n}/{t}', ru: 'Остановка {n}/{t}' },
};

function tt(key, vars) {
  const e = UI[key];
  let s = e ? (e.en ?? e[LANG] ?? key) : key;
  if (vars) for (const k in vars) s = s.replaceAll('{' + k + '}', vars[k]);
  return s;
}

// ═══════════════════════════════════════════════════════════════════════
// Tour Packages
// ═══════════════════════════════════════════════════════════════════════

/**
 * 1. The Grand Planetary Tour: Sun to Pluto
 * Covers every major planet from the solar furnace to the Kuiper Belt.
 */
const GRAND_TOUR = {
  id: 'grand-tour',
  title: {
    en: "The Grand Planetary Tour: Sun to Pluto",
  },
  description: {
    en: "A complete tour across every major planet in the Solar System. Students observe visual terrain and discuss planetary science questions.",
  },
  checkpoints: [
    {
      bodyId: 'sun',
      dist: 3.5,
      action: 'flyTo',
      duration: 15,
      narration: {
        en: "Stop 1: The Sun. The beating heart of our Solar System, holding 99.86% of all mass. Visual observation: Notice the glowing convection cells and solar flare prominences arching into space. Student Question: Why does the Sun produce so much heat and light, and what keeps it from collapsing under its own gravity?",
      },
    },
    {
      bodyId: 'mercury',
      dist: 2.5,
      action: 'flyTo',
      duration: 14,
      narration: {
        en: "Stop 2: Mercury. The smallest planet and closest to the Sun. With virtually no atmosphere, its surface swings from 430\u00b0C in daylight to -180\u00b0C at night. Visual observation: Look at the heavily cratered surface resembling our Moon. Student Question: Why did Mercury lose its atmosphere while Earth kept its own?",
      },
    },
    {
      bodyId: 'venus',
      dist: 2.8,
      action: 'flyTo',
      duration: 14,
      narration: {
        en: "Stop 3: Venus. Earth's twin in size, but an unforgiving volcanic furnace. A runaway greenhouse effect in its dense carbon dioxide atmosphere locks surface temperatures at 465\u00b0C\u2014hot enough to melt lead! Visual observation: Observe the thick pale-yellow clouds of sulfuric acid. Student Question: What can Venus teach us about greenhouse gases on Earth?",
      },
    },
    {
      bodyId: 'earth',
      dist: 2.8,
      action: 'flyTo',
      duration: 15,
      narration: {
        en: "Stop 4: Earth. Our home world, and the only known planet with liquid surface water, plate tectonics, and thriving life. Visual observation: See blue oceans, continental landmasses, swirling white cloud systems, and atmospheric glow. Student Question: What special combination of distance from the Sun, atmosphere, and water allows Earth to sustain life?",
      },
    },
    {
      bodyId: 'moon',
      dist: 2.4,
      action: 'flyTo',
      duration: 14,
      narration: {
        en: "Stop 5: Earth's Moon. Formed 4.5 billion years ago from a collision between the young proto-Earth and a Mars-sized world named Theia. Visual observation: Compare the dark basaltic plains (maria) with the ancient rugged bright highlands. Student Question: Why is the Moon tidally locked, always showing the same side to Earth?",
      },
    },
    {
      bodyId: 'mars',
      dist: 2.6,
      action: 'flyTo',
      duration: 14,
      narration: {
        en: "Stop 6: Mars. The Red Planet, colored by iron-oxide rust on its surface. It hosts Olympus Mons, the tallest volcano in the Solar System, and Valles Marineris canyon. Visual observation: Look for the white polar ice caps and canyon chasms. Student Question: What evidence shows that liquid water once flowed on ancient Mars, and where did that water go?",
      },
    },
    {
      bodyId: 'jupiter',
      dist: 3.2,
      action: 'flyTo',
      duration: 15,
      narration: {
        en: "Stop 7: Jupiter. The giant king of planets, with more mass than all other planets combined. Made mostly of hydrogen and helium gas. Visual observation: Watch the alternating dark belts and bright zones, and the iconic Great Red Spot storm. Student Question: Why doesn't Jupiter have a solid rock surface like Earth or Mars?",
      },
    },
    {
      bodyId: 'saturn',
      dist: 3.5,
      action: 'flyTo',
      duration: 15,
      narration: {
        en: "Stop 8: Saturn. Renowned for its dazzling ring system spanning over 280,000 kilometers wide, yet only about 10 to 100 meters thick, made of billions of water-ice particles. Visual observation: Examine the delicate ring gaps and subtle golden cloud bands. Student Question: How did Saturn's rings form, and will they remain forever?",
      },
    },
    {
      bodyId: 'uranus',
      dist: 2.8,
      action: 'flyTo',
      duration: 14,
      narration: {
        en: "Stop 9: Uranus. An ice giant world with a cyan atmosphere colored by methane gas. Uniquely, it rotates tilted on its side at 98 degrees, rolling along its orbit! Visual observation: Notice the calm cyan-aquamarine disk and faint rings. Student Question: What kind of cataclysmic event could have knocked Uranus onto its side?",
      },
    },
    {
      bodyId: 'neptune',
      dist: 2.8,
      action: 'flyTo',
      duration: 14,
      narration: {
        en: "Stop 10: Neptune. The most distant major planet in our solar system. Despite receiving very little solar heat, it features the fastest supersonic winds in the solar system, exceeding 2,100 km/h! Visual observation: The vivid cobalt blue atmosphere and white high-altitude clouds. Student Question: What internal heat source drives supersonic winds so far from the Sun?",
      },
    },
    {
      bodyId: 'pluto',
      dist: 2.5,
      action: 'flyTo',
      duration: 15,
      narration: {
        en: "Stop 11: Pluto. The famous dwarf planet in the Kuiper Belt. In 2015, the New Horizons probe revealed a geologically active world with mountains of water ice and nitrogen glaciers. Visual observation: Look for the bright heart-shaped nitrogen glacier Tombaugh Regio. Student Question: Why did astronomers reclassify Pluto as a dwarf planet in 2006, and what makes a world a planet?",
      },
    },
  ],
};

/**
 * 2. Cosmic Radii: Planetary Size Comparison (Boat & Scaled Model Analogy)
 * Requested by educators to build an intuitive mental model:
 * If the Sun were a 100-meter cruise ship, what sizes are the planets?
 */
const RADII_SCALE_TOUR = {
  id: 'radii-scale',
  title: {
    en: "Cosmic Radii: Planetary Size Comparison (Boat Analogy)",
  },
  description: {
    en: "Understand planetary sizes using an intuitive boat analogy: If the Sun is a 100-meter cruise ship, how big are the planets, the Moon, and dwarf planets?",
  },
  checkpoints: [
    {
      bodyId: 'sun',
      dist: 3.5,
      action: 'flyTo',
      duration: 14,
      narration: {
        en: "Scale Step 1: The Sun (Radius 696,000 km). In our boat scale model, imagine the Sun as a massive 100-meter cruise ship! Over 1.3 million Earths could fit inside this ship. Student Question: How does the Sun's massive size produce enough gravity to hold all the planets in orbit billions of kilometers away?",
      },
    },
    {
      bodyId: 'jupiter',
      dist: 3.2,
      action: 'flyTo',
      duration: 14,
      narration: {
        en: "Scale Step 2: Jupiter (Radius ~70,000 km, ~1/10th Sun's radius). On our 100-meter Sun ship scale, Jupiter is a 10-meter lifeboat parked on the top deck! It is 11 times wider than Earth. Student Question: Why is Jupiter so much larger than all the terrestrial planets combined?",
      },
    },
    {
      bodyId: 'saturn',
      dist: 3.5,
      action: 'flyTo',
      duration: 14,
      narration: {
        en: "Scale Step 3: Saturn (Radius ~58,000 km, ~8.4% Sun's radius). On our boat scale, Saturn is an 8.5-meter speedboat. Its stunning rings would stretch out like thin paper sheets 20 meters wide! Student Question: Saturn is almost as wide as Jupiter, but only 1/3 of its mass. What does that teach us about its density?",
      },
    },
    {
      bodyId: 'uranus',
      dist: 2.8,
      action: 'flyTo',
      duration: 13,
      narration: {
        en: "Scale Step 4: Uranus (Radius ~25,000 km, ~3.6% Sun's radius). On our boat scale, Uranus is a 3.6-meter dinghy boat. It is roughly 4 times the radius of Earth. Student Question: Why are Uranus and Neptune classified as 'ice giants' rather than 'gas giants' like Jupiter?",
      },
    },
    {
      bodyId: 'neptune',
      dist: 2.8,
      action: 'flyTo',
      duration: 13,
      narration: {
        en: "Scale Step 5: Neptune (Radius ~24,600 km, ~3.5% Sun's radius). On our boat scale, Neptune is a 3.5-meter dinghy boat, practically a twin in size to Uranus, but slightly denser and heavier. Student Question: How can two planets with identical sizes have such different internal heat and atmospheric colors?",
      },
    },
    {
      bodyId: 'earth',
      dist: 2.8,
      action: 'flyTo',
      duration: 14,
      narration: {
        en: "Scale Step 6: Earth (Radius ~6,371 km, ~0.9% Sun's radius). On our 100-meter Sun ship scale, our whole planet Earth is a tiny 90-centimeter toy model boat floating in the water beside the ship! Student Question: If Earth is only a 90 cm toy boat next to a 100-meter cruise ship, how thin must Earth's breathable atmosphere be on this scale?",
      },
    },
    {
      bodyId: 'venus',
      dist: 2.8,
      action: 'flyTo',
      duration: 13,
      narration: {
        en: "Scale Step 7: Venus (Radius ~6,052 km, ~0.87% Sun's radius). On our boat scale, Venus is an 87-centimeter toy model boat, almost an exact twin to Earth's 90-centimeter toy! Student Question: Since Earth and Venus are nearly identical in size, why are their surface temperatures and atmospheres so completely different?",
      },
    },
    {
      bodyId: 'mars',
      dist: 2.6,
      action: 'flyTo',
      duration: 13,
      narration: {
        en: "Scale Step 8: Mars (Radius ~3,390 km, ~0.49% Sun's radius). On our boat scale, Mars is a 48-centimeter miniature toy boat\u2014just over half the diameter of Earth. Student Question: Why did Mars's smaller size cause its internal core to cool faster than Earth's, shutting down its magnetic dynamo?",
      },
    },
    {
      bodyId: 'mercury',
      dist: 2.5,
      action: 'flyTo',
      duration: 13,
      narration: {
        en: "Scale Step 9: Mercury (Radius ~2,440 km, ~0.35% Sun's radius). On our boat scale, Mercury is a 35-centimeter toy boat, barely larger than Earth's Moon. Student Question: Why does Mercury have such a huge metallic iron core taking up most of its interior volume?",
      },
    },
    {
      bodyId: 'moon',
      dist: 2.4,
      action: 'flyTo',
      duration: 13,
      narration: {
        en: "Scale Step 10: The Moon (Radius ~1,737 km, ~0.25% Sun's radius). On our boat scale, the Moon is a 25-centimeter small floating buoy bobbing beside our 90-centimeter Earth toy boat! Student Question: Why is the Moon unusually large compared to its host planet, when compared to moons of other planets?",
      },
    },
    {
      bodyId: 'pluto',
      dist: 2.5,
      action: 'flyTo',
      duration: 14,
      narration: {
        en: "Scale Step 11: Pluto (Radius ~1,188 km, ~0.17% Sun's radius). On our boat scale, Pluto is a 17-centimeter miniature floating model, smaller than our Moon buoy! Student Question: Now that you have seen the scale from the 100-meter Sun ship down to a 17-centimeter model, what surprised you most about the sizes in our solar system?",
      },
    },
  ],
};

/**
 * 3. Rocky Worlds of the Inner Solar System
 */
const ROCKY_WORLDS_TOUR = {
  id: 'rocky-worlds',
  title: {
    en: "Rocky Worlds of the Inner Solar System",
  },
  description: {
    en: "Explore the terrestrial planets\u2014Mercury, Venus, Earth, Moon, and Mars\u2014comparing crusts, volcanic features, and atmospheric evolution.",
  },
  checkpoints: [
    {
      bodyId: 'mercury',
      dist: 2.5,
      action: 'flyTo',
      duration: 14,
      narration: {
        en: "Rocky Worlds Stop 1: Mercury. A world of rock and iron. Intense bombardment in the early solar system left craters that remain unweathered for billions of years because there is no rain or wind. Student Question: How do scientists use crater counts to determine the age of planetary surfaces?",
      },
    },
    {
      bodyId: 'venus',
      dist: 2.8,
      action: 'flyTo',
      duration: 14,
      narration: {
        en: "Rocky Worlds Stop 2: Venus. Thousands of ancient volcanoes dot Venus's surface under an atmospheric pressure 92 times greater than Earth's\u2014equivalent to being 900 meters underwater! Student Question: If humans sent a rover to Venus, what engineering challenges must it overcome to survive the extreme heat and pressure?",
      },
    },
    {
      bodyId: 'earth',
      dist: 2.8,
      action: 'flyTo',
      duration: 14,
      narration: {
        en: "Rocky Worlds Stop 3: Earth. Active plate tectonics continuously recycle Earth's crust into the mantle, creating mountain chains, volcanic arcs, and ocean trenches. Student Question: How does plate tectonics help regulate the global carbon cycle and stabilize Earth's climate over millions of years?",
      },
    },
    {
      bodyId: 'moon',
      dist: 2.4,
      action: 'flyTo',
      duration: 14,
      narration: {
        en: "Rocky Worlds Stop 4: The Moon. Ancient magma oceans cooled to create the bright anorthosite highlands, while giant asteroid impacts later filled with dark basaltic lava. Student Question: What can Apollo rock samples brought back from the Moon tell us about the early history of the Earth-Moon system?",
      },
    },
    {
      bodyId: 'mars',
      dist: 2.6,
      action: 'flyTo',
      duration: 14,
      narration: {
        en: "Rocky Worlds Stop 5: Mars. Home to ancient dried river deltas and lakes, like Jezero Crater explored by NASA's Perseverance rover. Student Question: If life ever began on Mars billions of years ago, where would modern rovers be most likely to find fossilized biosignatures?",
      },
    },
  ],
};

/**
 * 4. Journey of the Giants & Outer Moons
 */
const GIANTS_TOUR = {
  id: 'giants',
  title: {
    en: "Journey of the Giants & Outer Moons",
  },
  description: {
    en: "The Great Red Spot, subsurface oceans, volcanic worlds, rings, and methane lakes \u2014 the most spectacular stops in the outer Solar System.",
  },
  checkpoints: [
    {
      bodyId: 'jupiter',
      dist: 3.2,
      action: 'flyTo',
      duration: 15,
      narration: {
        en: "Stop 1: Jupiter and the Great Red Spot. A colossal anticyclone storm larger than planet Earth that has raged for over 300 years! Ammonia clouds swirl in turbulent jet streams. Student Question: What keeps giant storms on Jupiter spinning for centuries without dissipating like storms on Earth?",
      },
    },
    {
      bodyId: 'europa',
      dist: 2.5,
      action: 'flyTo',
      duration: 15,
      narration: {
        en: "Stop 2: Europa. Beneath a smooth outer shell of water ice, Europa harbors a global saltwater ocean containing more liquid water than all Earth's oceans combined! Student Question: Why is Europa considered one of the top targets in the search for extraterrestrial life in our solar system?",
      },
    },
    {
      bodyId: 'io',
      dist: 2.5,
      action: 'flyTo',
      duration: 15,
      narration: {
        en: "Stop 3: Io. The most volcanically active body in the Solar System, erupting sulfur and silicate lava hundreds of kilometers into space. Jupiter's immense tidal pull flexes Io's rocky mantle. Student Question: How does gravitational tidal friction generate so much internal heat inside a small moon?",
      },
    },
    {
      bodyId: 'saturn',
      dist: 3.5,
      action: 'flyTo',
      duration: 15,
      narration: {
        en: "Stop 4: Saturn and its Ring Marvel. Saturn's rings reflect sunlight with brilliant intensity because they are 99% pure water ice particles, ranging from dust grains to boulder sizes. Student Question: Why don't the ring particles pull together under gravity to form a single new moon?",
      },
    },
    {
      bodyId: 'titan',
      dist: 2.6,
      action: 'flyTo',
      duration: 15,
      narration: {
        en: "Stop 5: Titan. Saturn's largest moon, with a dense nitrogen-rich atmosphere and an alien weather system where clouds rain liquid methane into cold lakes and rivers! Student Question: How does Titan's methane hydrological cycle parallel the water cycle on Earth?",
      },
    },
    {
      bodyId: 'neptune',
      dist: 2.8,
      action: 'flyTo',
      duration: 14,
      narration: {
        en: "Stop 6: Neptune. An icy giant battered by fierce supersonic winds, marked by dramatic dark vortex storms and glowing cirrus clouds of frozen methane crystals. Student Question: What instruments will future deep-space probes need to probe beneath Neptune's thick clouds?",
      },
    },
  ],
};

/**
 * 5. How Big Is Our Backyard? Cosmic Distance Scale
 */
const BACKYARD_TOUR = {
  id: 'backyard',
  title: {
    en: "How Big Is Our Backyard? Cosmic Distance Scale",
  },
  description: {
    en: "From Earth's surface to the Oort Cloud at 100,000 AU, experience the true vastness of our Solar System step by step.",
  },
  checkpoints: [
    {
      bodyId: 'earth',
      dist: 2.8,
      action: 'flyTo',
      duration: 12,
      narration: {
        en: "Step 1: Earth (0 AU). Our starting point. Light travels 300,000 km per second, circling Earth 7.5 times in just one second.",
      },
    },
    {
      bodyId: 'moon',
      dist: 2.5,
      action: 'flyTo',
      duration: 12,
      narration: {
        en: "Step 2: The Moon (384,400 km away). Moonlight takes 1.3 seconds to reach Earth. All other seven planets could fit side-by-side in the space between Earth and the Moon!",
      },
    },
    {
      bodyId: 'mars',
      dist: 2.6,
      action: 'flyTo',
      duration: 12,
      narration: {
        en: "Step 3: Mars (~1.5 AU, 225 million km). Radio signals take anywhere from 4 to 24 minutes one way. Real-time joystick control from Earth is impossible; Mars rovers must navigate autonomously.",
      },
    },
    {
      bodyId: 'jupiter',
      dist: 3.2,
      action: 'flyTo',
      duration: 13,
      narration: {
        en: "Step 4: Jupiter (5.2 AU, 780 million km). Sunlight takes 43 minutes to arrive here, and sunlight is 27 times dimmer than on Earth. Probes rely on giant solar wings or nuclear generators.",
      },
    },
    {
      bodyId: 'neptune',
      dist: 2.8,
      action: 'flyTo',
      duration: 13,
      narration: {
        en: "Step 5: Neptune (30 AU, 4.5 billion km). Sunlight takes over 4 hours to reach Neptune. Looking back, the Sun appears as a blindingly bright pinpoint star.",
      },
    },
    {
      bodyId: 'voyager1',
      dist: null,
      action: 'flyTo',
      duration: 14,
      narration: {
        en: "Step 6: Voyager 1 (~164 AU). Launched in 1977, traveling over 60,000 km/h for nearly half a century, it is humanity's furthest ambassador in interstellar space. Radio signals take over 22 hours to arrive!",
      },
    },
    {
      bodyId: 'heliopause',
      dist: null,
      action: 'flyTo',
      duration: 14,
      narration: {
        en: "Step 7: The Heliopause (~120-150 AU). The boundary where the solar wind meets the interstellar plasma medium. The Sun's magnetic bubble shields our planetary system from high-energy galactic cosmic rays.",
      },
    },
    {
      bodyId: 'oortcloud',
      dist: null,
      action: 'flyTo',
      duration: 15,
      narration: {
        en: "Step 8: The Oort Cloud (~2,000 to 100,000 AU, nearly 1.5 light-years). A vast spherical shell holding trillions of icy planetesimals, the source of long-period comets. This marks the true gravitational frontier of our Solar System.",
      },
    },
  ],
};

/**
 * 6. Standing on the Moon, Looking at Earth
 */
const EARTH_MOON_TOUR = {
  id: 'earth-moon',
  title: {
    en: "Standing on the Moon, Looking at Earth",
  },
  description: {
    en: "Fly to the Moon, touch down on the lunar surface, and turn around to gaze upon our home world suspended in the dark cosmos.",
  },
  checkpoints: [
    {
      bodyId: 'earth',
      dist: 2.8,
      action: 'flyTo',
      duration: 12,
      narration: {
        en: "Step 1: Starting at Earth. All human history, art, and memory took place on this vibrant blue oasis. Now let us embark toward our celestial companion.",
      },
    },
    {
      bodyId: 'moon',
      dist: 2.4,
      action: 'flyTo',
      duration: 12,
      narration: {
        en: "Step 2: Approaching the Moon. The Moon has no atmosphere, no clouds, and no weather. Every crater formed by asteroid impacts over four billion years remains preserved.",
      },
    },
    {
      bodyId: 'moon',
      dist: 1.05,
      action: 'land',
      duration: 15,
      narration: {
        en: "Step 3: Touching down on the lunar regolith. Look around at the fine gray dust, pulverised by eons of micrometeorite impacts. Gravity here is only one-sixth of Earth's.",
      },
    },
    {
      bodyId: 'earth',
      dist: 2.8,
      action: 'lookAt',
      duration: 16,
      narration: {
        en: "Step 4: Looking back at Earth. Suspended against the pitch-black void of space, Earth shines four times wider and over forty times brighter than the Moon appears from Earth. A fragile, interconnected world that we all share.",
      },
    },
  ],
};


// ═══════════════════════════════════════════════════════════════════════
// Tour 7: Apollo Lunar Expeditions & Equipment Recreated
// ═══════════════════════════════════════════════════════════════════════
const APOLLO_EQUIPMENT_TOUR = {
  id: 'apollo-equipment',
  title: {
    en: "Apollo Lunar Expeditions & Equipment Recreated",
  },
  description: {
    en: "Explore the Moon landing sites and discover the scientific equipment packages left behind: the Descent Stage, ALSEP nuclear stations, Lunar Roving Vehicle, and Laser Retroreflectors.",
  },
  checkpoints: [
    {
      bodyId: 'moon',
      distFactor: 2.5,
      action: 'flyTo',
      duration: 14,
      narration: {
        en: "Step 1: Welcome to the Moon. In this recreated lunar environment, six scientific landing missions touched down between 1969 and 1972. Beyond flags and footprints, their primary legacy was a vast network of scientific stations and instruments permanently deployed on the lunar regolith.",
      },
    },
    {
      bodyId: 'moon',
      lat: 0.674,
      lon: 23.473,
      distKm: 1742,
      tilt: 35,
      action: 'flyTo',
      duration: 16,
      narration: {
        en: "Step 2: Mare Tranquillitatis — Apollo 11. Here sits the 4.3-meter-tall Lunar Module Descent Stage and the Early Apollo Scientific Experiments Package (EASEP). The 100-corner-cube Laser Ranging Retroreflector (LRRR) deployed here is still actively targeted by Earth observatories today, measuring the lunar orbit down to millimeter precision.",
      },
    },
    {
      bodyId: 'moon',
      lat: -3.012,
      lon: -23.422,
      distKm: 1742,
      tilt: 35,
      action: 'flyTo',
      duration: 16,
      narration: {
        en: "Step 3: Oceanus Procellarum — Apollo 12. Deployed here was the first full Apollo Lunar Surface Experiments Package (ALSEP), powered by a 73-watt SNAP-27 Radioisotope Thermoelectric Generator (RTG). Its passive seismometers operated until 1977, recording over 12,000 deep moonquakes that revealed the Moon's mantle and small metallic core.",
      },
    },
    {
      bodyId: 'moon',
      lat: 26.132,
      lon: 3.634,
      distKm: 1742,
      tilt: 40,
      action: 'flyTo',
      duration: 16,
      narration: {
        en: "Step 4: Hadley-Apennine — Apollo 15. The first mission with the Lunar Roving Vehicle (LRV). Traveling 27.9 kilometers along the brink of the 300-meter-deep Hadley Rille gorge, its scientific sampling recovered the famous 'Genesis Rock' — a 4.1-billion-year-old sample of the Moon's primordial anorthosite crust.",
      },
    },
    {
      bodyId: 'moon',
      lat: 20.191,
      lon: 30.772,
      distKm: 1742,
      tilt: 35,
      action: 'flyTo',
      duration: 16,
      narration: {
        en: "Step 5: Taurus-Littrow Valley — Apollo 17. The most intensive geological expedition in lunar exploration history. Deployed the Lunar Atmospheric Composition Experiment and Heat Flow probes, and discovered orange pyroclastic volcanic soil beads formed in explosive fire fountains over 3.5 billion years ago.",
      },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════
// Tour 8: Chandrayaan-3: Moon South Pole & Dark Craters Expedition
// ═══════════════════════════════════════════════════════════════════════
const CHANDRAYAAN3_TOUR = {
  id: 'chandrayaan-3',
  title: {
    en: "Chandrayaan-3: Moon South Pole & Dark Craters Expedition",
  },
  description: {
    en: "Journey to Shiv Shakti Point (69.37° S) near the Moon's south pole. Inspect the Vikram lander, Pragyan rover, ChaSTE thermal probe, and permanently shadowed water-ice craters.",
  },
  checkpoints: [
    {
      bodyId: 'moon',
      lat: -65.0,
      lon: 30.0,
      distFactor: 2.2,
      action: 'flyTo',
      duration: 14,
      narration: {
        en: "Step 1: Approaching the Lunar South Pole. Unlike equatorial regions, the south pole is characterized by rugged rim walls, long grazing solar shadows, and deep craters whose floors have never seen sunlight in over two billion years.",
      },
    },
    {
      bodyId: 'moon',
      lat: -69.373,
      lon: 32.319,
      distKm: 1741,
      tilt: 35,
      action: 'flyTo',
      duration: 16,
      narration: {
        en: "Step 2: Shiv Shakti Point — India's historic Chandrayaan-3 landing site. On August 23, 2023, the Vikram lander executed an autonomous hazard detection touchdown here, making India the first nation to soft-land near the rugged lunar south pole.",
      },
    },
    {
      bodyId: 'moon',
      lat: -69.373,
      lon: 32.319,
      distKm: 1739,
      tilt: 45,
      action: 'flyTo',
      duration: 16,
      narration: {
        en: "Step 3: The Pragyan Rover. Rolling down Vikram's ramp on its 6-wheel rocker-bogie mobility chassis, Pragyan deployed the LIBS (Laser-Induced Breakdown Spectroscope). Pulsing high-energy laser flashes into the lunar regolith, it unambiguously confirmed sulfur, aluminum, calcium, iron, and titanium.",
      },
    },
    {
      bodyId: 'moon',
      lat: -75.0,
      lon: 0.0,
      distFactor: 1.25,
      tilt: 30,
      action: 'flyTo',
      duration: 16,
      narration: {
        en: "Step 4: ChaSTE Thermal Gradient & Dark Craters. Vikram's ChaSTE thermal probe penetrated 10 cm into the lunar soil, measuring a steep 60 °C drop in temperature within just 8 cm. Nearby in permanently shadowed craters like Shackleton, temperatures drop to −246 °C (27 K), acting as cosmic freezers preserving vast deposits of water ice.",
      },
    },
    {
      bodyId: 'earth',
      distFactor: 3.0,
      action: 'flyTo',
      duration: 14,
      narration: {
        en: "Step 5: Gaze Back to Earth. From the high latitudes of the lunar south pole, our blue home planet hovers permanently near the rugged horizon, inspiring future long-duration human outposts and international scientific stations.",
      },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════
// Tour 9: Earth's Orbital Highway: 10,000+ Active Satellites
// ═══════════════════════════════════════════════════════════════════════
const EARTH_SATELLITES_TOUR = {
  id: 'earth-satellites',
  title: {
    en: "Earth's Orbital Highway: 10,000+ Active Satellites",
  },
  description: {
    en: "Witness humanity's planetary orbit network: over 10,240 active satellites across Low Earth Orbit broadband swarms, navigation constellations, and the Geostationary Clarke Belt.",
  },
  checkpoints: [
    {
      bodyId: 'earth',
      distFactor: 4.5,
      action: 'flyTo',
      duration: 15,
      narration: {
        en: "Step 1: Welcome to the Orbital Highway. Over 10,240 active artificial satellites orbit Earth in 2026. This dynamic orbital infrastructure forms the technological nervous system of modern civilization, enabling instant communication, weather prediction, and scientific discovery.",
      },
    },
    {
      bodyId: 'earth',
      distFactor: 1.6,
      action: 'flyTo',
      duration: 15,
      narration: {
        en: "Step 2: Low Earth Orbit (LEO, 160–2,000 km). Over 8,820 satellites operate here, traveling at 7.6 km/s (27,500 km/h) to complete an orbit every 90 minutes. Dense constellation shells like Starlink and OneWeb provide global low-latency internet connectivity to the remotest corners of Earth.",
      },
    },
    {
      bodyId: 'earth',
      distFactor: 1.15,
      action: 'flyTo',
      duration: 16,
      narration: {
        en: "Step 3: International Space Station (ISS, 415 km). The largest human-made structure in space, spanning 109 meters with 73-meter solar arrays. It circles Earth 15.5 times per day at 51.6° inclination, conducting cutting-edge microgravity research and continuous Earth observation.",
      },
    },
    {
      bodyId: 'earth',
      distFactor: 5.5,
      action: 'flyTo',
      duration: 15,
      narration: {
        en: "Step 4: Medium Earth Orbit (MEO, 20,200 km). Home to the world's satellite navigation constellations — 31 GPS, 24 Galileo, 24 GLONASS, and BeiDou satellites. Arranged across 6 orbital planes inclined at 55°, their atomic clocks ensure at least 4 satellites are visible from anywhere on Earth at all times.",
      },
    },
    {
      bodyId: 'earth',
      distFactor: 8.5,
      action: 'flyTo',
      duration: 15,
      narration: {
        en: "Step 5: The Geostationary Ring (35,786 km). At this exact altitude above the equator, a satellite's orbital speed precisely synchronizes with Earth's 23h 56m rotation. To ground observers, these 585 satellites appear fixed in the sky, relaying television broadcasts, defense communications, and hemisphere-wide meteorological scans.",
      },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════
// Tour 10: Moons of the Solar System: Ocean Worlds & Volcanic Wonders
// ═══════════════════════════════════════════════════════════════════════
const MOONS_EXPEDITION_TOUR = {
  id: 'moons-expedition',
  title: {
    en: "Moons of the Solar System: Ocean Worlds & Volcanic Wonders",
  },
  description: {
    en: "Journey across the extraordinary natural satellites of the outer solar system: from Io's sulfur volcanoes and Europa's hidden ocean to Titan's methane rain and Enceladus's ice geysers.",
  },
  checkpoints: [
    {
      bodyId: 'moon',
      distFactor: 2.2,
      action: 'flyTo',
      duration: 13,
      narration: {
        en: "Step 1: The Moon. Earth's companion is the fifth largest moon in the Solar System. Tidally locked to Earth, its gravitational pull creates ocean tides and stabilizes Earth's 23.4° axial tilt, providing the climate stability essential for life.",
      },
    },
    {
      bodyId: 'io',
      distFactor: 2.5,
      action: 'flyTo',
      duration: 14,
      narration: {
        en: "Step 2: Io — The Volcanic Dynamo. Caught in a gravitational tug-of-war between Jupiter and sister moons Europa and Ganymede, tidal friction melts Io's interior. Over 400 active volcanoes erupt sulfurous plumes hundreds of kilometers into space, continually resurfacing the world in brilliant yellow, orange, and black.",
      },
    },
    {
      bodyId: 'europa',
      distFactor: 2.2,
      action: 'flyTo',
      duration: 15,
      narration: {
        en: "Step 3: Europa — The Subsurface Ocean World. Beneath a fractured shell of water ice lies a global liquid ocean containing more water than all of Earth's oceans combined. Hydrothermal vents on its rocky ocean floor make Europa one of our prime candidates in the search for extraterrestrial life.",
      },
    },
    {
      bodyId: 'ganymede',
      distFactor: 2.4,
      action: 'flyTo',
      duration: 14,
      narration: {
        en: "Step 4: Ganymede — The Titan Moon. Bigger than Mercury and Pluto, Ganymede is the largest moon in the solar system. It is the only known moon with its own intrinsic magnetic field, generated by a liquid iron-rich core, creating glowing auroral belts in its thin oxygen atmosphere.",
      },
    },
    {
      bodyId: 'titan',
      distFactor: 2.4,
      action: 'flyTo',
      duration: 15,
      narration: {
        en: "Step 5: Titan — Atmosphere and Methane Seas. Saturn's giant moon is enveloped by a nitrogen atmosphere denser than Earth's (1.5 bar). Beneath an orange photochemical smog haze lie river channels, cloud formations, and lakes of liquid methane and ethane like Kraken Mare.",
      },
    },
    {
      bodyId: 'enceladus',
      distFactor: 2.2,
      action: 'flyTo',
      duration: 15,
      narration: {
        en: "Step 6: Enceladus — Cryovolcanic Plumes. South-polar fractures known as 'tiger stripes' blast supersonic geysers of water vapor, ice crystals, and organic molecules directly into space, actively feeding Saturn's expansive E ring.",
      },
    },
    {
      bodyId: 'triton',
      distFactor: 2.2,
      action: 'flyTo',
      duration: 15,
      narration: {
        en: "Step 7: Triton — The Captured Kuiper Belt Moon. Orbiting Neptune in a retrograde direction (backwards), Triton is a captured dwarf planet. At −235 °C, nitrogen ice geysers erupt 8 kilometers high, carrying dark carbonaceous dust across its cantaloupe-textured terrain.",
      },
    },
  ],
};

export const TOURS = {
  [GRAND_TOUR.id]: GRAND_TOUR,
  [RADII_SCALE_TOUR.id]: RADII_SCALE_TOUR,
  [ROCKY_WORLDS_TOUR.id]: ROCKY_WORLDS_TOUR,
  [GIANTS_TOUR.id]: GIANTS_TOUR,
  [BACKYARD_TOUR.id]: BACKYARD_TOUR,
  [EARTH_MOON_TOUR.id]: EARTH_MOON_TOUR,
  [APOLLO_EQUIPMENT_TOUR.id]: APOLLO_EQUIPMENT_TOUR,
  [CHANDRAYAAN3_TOUR.id]: CHANDRAYAAN3_TOUR,
  [EARTH_SATELLITES_TOUR.id]: EARTH_SATELLITES_TOUR,
  [MOONS_EXPEDITION_TOUR.id]: MOONS_EXPEDITION_TOUR,
};

// ═══════════════════════════════════════════════════════════════════════
// TourSystem
// ═══════════════════════════════════════════════════════════════════════

/**
 * Tour player: drives flyTo sequences across checkpoints and displays narration.
 */
export class TourSystem {
  constructor({ flyTo, select, getMode, setMode, hud, orbitCam, orbitEnv }) {
    this.flyTo = flyTo;
    this.select = select;
    this.getMode = getMode;
    this.setMode = setMode;
    this.hud = hud;
    this.orbitCam = orbitCam;
    this.orbitEnv = orbitEnv;
    this._activeTourId = null;
    this._checkpointIndex = -1;
    this._timer = null;
    // Narration callback for TTS / speech synthesis
    this.onNarration = null;
  }

  /**
   * Start a tour. Switches to orbit mode (flyTo relies on orbit camera).
   * @param {string} tourId
   * @returns {boolean} Whether start succeeded
   */
  start(tourId) {
    const tour = TOURS[tourId];
    if (!tour) return false;
    // Ensure we are in orbit exploration mode
    if (this.getMode && this.getMode() !== 'orbit' && this.setMode) {
      this.setMode('orbit');
    }
    this._activeTourId = tourId;
    this._checkpointIndex = -1;
    this.next();
    return true;
  }

  /** Advance to next checkpoint. Automatically ends at the end of the tour. */
  next() {
    if (!this._activeTourId) return false;
    const tour = TOURS[this._activeTourId];
    this._checkpointIndex++;
    if (this._checkpointIndex >= tour.checkpoints.length) {
      this._finish();
      return false;
    }
    this._gotoCheckpoint(tour.checkpoints[this._checkpointIndex]);
    return true;
  }

  /** Return to previous checkpoint. */
  prev() {
    if (!this._activeTourId) return false;
    this._checkpointIndex = Math.max(0, this._checkpointIndex - 1);
    const tour = TOURS[this._activeTourId];
    this._gotoCheckpoint(tour.checkpoints[this._checkpointIndex]);
    return true;
  }

  /** Skip tour (stops playback, cleans up state). */
  skip() {
    this._activeTourId = null;
    this._checkpointIndex = -1;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this.hud) this.hud.tip(null);
  }

  /**
   * Current checkpoint information.
   * @returns {{id:string, title:string, narration:string, checkpoint:Object}|null}
   */
  get current() {
    if (!this._activeTourId) return null;
    const tour = TOURS[this._activeTourId];
    const cp = tour.checkpoints[this._checkpointIndex];
    if (!cp) return null;
    return {
      id: cp.bodyId,
      title: tour.title.en ?? tour.title[LANG] ?? tour.title.zh ?? '',
      narration: cp.narration.en ?? cp.narration[LANG] ?? cp.narration.zh ?? '',
      checkpoint: cp,
    };
  }

  /** Available tours list (metadata only) */
  get tours() {
    return Object.values(TOURS).map((t) => ({
      id: t.id,
      title: t.title.en ?? t.title[LANG] ?? t.title.zh ?? '',
      description: t.description.en ?? t.description[LANG] ?? t.description.zh ?? '',
      checkpointCount: t.checkpoints.length,
    }));
  }

  /** Whether a tour is currently running */
  get isActive() {
    return this._activeTourId !== null;
  }

  /** Current checkpoint index (0-based), -1 if not playing */
  get checkpointIndex() {
    return this._checkpointIndex;
  }

  // ── Internal ──────────────────────────────────────────────────────────

  _gotoCheckpoint(cp) {
    // Execute flight animation: flyTo target body
    this.flyTo(cp.bodyId);
    this.select(cp.bodyId);

    // Apply fine coordinates if specified (e.g. Apollo / Chandrayaan-3 landing coordinates)
    if (this.orbitCam) {
      const DEG = Math.PI / 180;
      if (cp.lat != null) this.orbitCam.lat = cp.lat * DEG;
      if (cp.lon != null) this.orbitCam.lon = cp.lon * DEG;
      if (cp.distKm != null) {
        this.orbitCam.dist = cp.distKm;
        this.orbitCam.distTarget = cp.distKm;
      } else if (cp.distFactor != null && this.orbitEnv) {
        const b = this.orbitEnv.get(cp.bodyId);
        if (b?.radiusKm) {
          const d = b.radiusKm * cp.distFactor;
          this.orbitCam.dist = d;
          this.orbitCam.distTarget = d;
        }
      }
      if (cp.heading != null) this.orbitCam.heading = cp.heading * DEG;
      if (cp.tilt != null) this.orbitCam.tilt = cp.tilt * DEG;
    }

    // Display narration via HUD tip
    const text = cp.narration.en ?? cp.narration[LANG] ?? cp.narration.zh ?? '';
    if (this.hud) {
      const progress = tt('tour.checkpoint', {
        n: this._checkpointIndex + 1,
        t: TOURS[this._activeTourId].checkpoints.length,
      });
      this.hud.tip(`${progress}  ${text}`);
    }

    // Notify narration callback (e.g. for TTS speech synthesis)
    if (this.onNarration) this.onNarration(text, cp);

    // Auto advance timer
    if (this._timer) clearTimeout(this._timer);
    if (cp.duration > 0) {
      this._timer = setTimeout(() => this.next(), cp.duration * 1000);
    }
  }

  _finish() {
    const wasActive = this._activeTourId;
    this._activeTourId = null;
    this._checkpointIndex = -1;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this.hud) this.hud.tip(tt('tour.done'));
  }
}
