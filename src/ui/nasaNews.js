// NASA Satellite & Space Technology News Viewer
// Curated educational feed of satellite telemetry, Earth observation, lunar exploration,
// and space tech archives from official NASA, ISRO, and ESA open resources.
// 100% family-safe, verified educational material for students and classroom discussions.

import { SATELLITE_STATS } from '../scene/earthSatellites.js';

// Curated live tech news and satellite data entries
const NEWS_ITEMS = [
  {
    id: 'dscovr-epic',
    category: 'earth',
    tag: 'EARTH OBSERVATION SATELLITE',
    title: 'DSCOVR: Deep Space Climate Observatory (EPIC Satellite Camera)',
    agency: 'NASA / NOAA',
    date: 'Daily Live Imagery',
    targetBody: 'earth',
    image: 'https://epic.gsfc.nasa.gov/galleries/2024/eclipse/thumb.jpg',
    fallbackColor: 'linear-gradient(135deg, #0b3d91, #1e3a8a)',
    description: 'Positioned at the Sun-Earth L1 Lagrange point 1.5 million kilometers away, the EPIC (Earth Polychromatic Imaging Camera) satellite takes 20 to 22 full-disk color photos of Earth every day. It tracks global ozone levels, aerosol clouds, dust plumes, vegetation canopy dynamics, and volcanic emissions across the sunlit hemisphere.',
    techSpecs: 'Sensor: 4-megapixel CCD with 10 spectral filters (317–780 nm) · Orbit: Sun-Earth L1 Lissajous orbit',
    sourceUrl: 'https://epic.gsfc.nasa.gov/',
  },
  {
    id: 'chandrayaan3-shivshakti',
    category: 'lunar',
    tag: 'LUNAR SOUTH POLE EXPLORATION',
    title: 'Chandrayaan-3: In-Situ Discoveries at Shiv Shakti Point (69.37° S)',
    agency: 'ISRO / NASA Deep Space Network',
    date: 'Lunar Surface Operation',
    targetBody: 'moon',
    targetLat: -69.373,
    targetLon: 32.319,
    image: 'https://www.isro.gov.in/media_isro/image/index/Chandrayaan3/ch3_ramp_small.jpg',
    fallbackColor: 'linear-gradient(135deg, #374151, #1f2937)',
    description: 'India\'s Chandrayaan-3 mission accomplished the first landing near the rugged lunar south polar region. The Pragyan rover rolled down Vikram\'s ramp and deployed its Laser-Induced Breakdown Spectroscope (LIBS), confirming the presence of sulfur, aluminum, calcium, iron, and titanium on the lunar regolith.',
    techSpecs: 'Payloads: ChaSTE thermal probe, LIBS laser spectrometer, RAMBHA Langmuir probe, ILSA seismometer',
    sourceUrl: 'https://www.isro.gov.in/Chandrayaan3.html',
  },
  {
    id: 'chaste-thermal',
    category: 'lunar',
    tag: 'LUNAR REGOLITH THERMAL PROFILE',
    title: 'ChaSTE Thermal Probe: Extraordinary Insulation of the Moon\'s Soil',
    agency: 'ISRO Physical Research Laboratory',
    date: 'Subsurface Measurements',
    targetBody: 'moon',
    targetLat: -69.373,
    targetLon: 32.319,
    image: 'https://www.isro.gov.in/media_isro/image/index/Chandrayaan3/chaste_curve.png',
    fallbackColor: 'linear-gradient(135deg, #1e293b, #0f172a)',
    description: 'The Chandra\'s Surface Thermophysical Experiment (ChaSTE) penetrated 10 cm into the lunar regolith at Shiv Shakti Point using 10 precise platinum resistance temperature sensors. It measured a 60 °C drop in temperature within just 8 cm depth, proving the vacuum-packed porous lunar regolith is one of the most effective natural thermal insulators in the solar system.',
    techSpecs: 'Depth: 100 mm penetration · Sensors: 10 RTD temperature probes with dual heating capability',
    sourceUrl: 'https://www.isro.gov.in/Chandrayaan3_Details.html',
  },
  {
    id: 'apollo-equipment-archive',
    category: 'lunar',
    tag: 'APOLLO LUNAR EXPERIMENT ARCHIVE',
    title: 'ALSEP & Laser Retroreflectors: Scientific Stations on the Moon',
    agency: 'NASA Lunar Data Project',
    date: 'Long-Term Lunar Surface Science',
    targetBody: 'moon',
    targetLat: 0.674,
    targetLon: 23.473,
    image: 'https://history.nasa.gov/alsj/a11/AS11-40-5952HR.jpg',
    fallbackColor: 'linear-gradient(135deg, #475569, #334155)',
    description: 'During the Apollo lunar landings, scientific hardware packages were permanently deployed on the Moon\'s surface. The Laser Ranging Retroreflector (LRRR) deployed at Mare Tranquillitatis consists of 100 fused-silica corner cubes. Ground-based lasers at McDonald Observatory still bounce photons off this reflector today, measuring the Earth-Moon distance down to millimeter precision.',
    techSpecs: 'Hardware: SNAP-27 Radioisotope Thermoelectric Generator (73W RTG), passive seismometer, ion detector, LRRR',
    sourceUrl: 'https://curator.jsc.nasa.gov/lunar/index.cfm',
  },
  {
    id: 'iss-earth-science',
    category: 'earth',
    tag: 'LOW EARTH ORBIT SATELLITE PLATFORM',
    title: 'International Space Station: Orbiting at 7.66 km/s at 415 km Altitude',
    agency: 'NASA / ESA / JAXA / CSA',
    date: 'Continuous Orbital Laboratory',
    targetBody: 'earth',
    image: 'https://www.nasa.gov/wp-content/uploads/2023/03/iss068e021487.jpg',
    fallbackColor: 'linear-gradient(135deg, #0284c7, #0369a1)',
    description: 'Operating in low Earth orbit at 51.6° inclination, the ISS circles Earth every 92 minutes. Beyond being a microgravity physics laboratory, it hosts advanced Earth-sensing instruments including ECOSTRESS (measuring plant water stress) and the Alpha Magnetic Spectrometer (AMS-02) hunting for cosmic dark matter.',
    techSpecs: 'Mass: 450,000 kg · Solar span: 73 m · Orbital speed: 27,600 km/h · Altitude: ~415 km',
    sourceUrl: 'https://www.nasa.gov/international-space-station/',
  },
  {
    id: 'landsat-swot',
    category: 'earth',
    tag: 'EARTH HYDROLOGY & OCEAN TOPOGRAPHY',
    title: 'SWOT Satellite: Revolutionizing Global Water & Ocean Mapping',
    agency: 'NASA / CNES (France)',
    date: 'Earth Satellite Radar Mission',
    targetBody: 'earth',
    image: 'https://swot.jpl.nasa.gov/system/resources/detail_files/148_PIA25425_web.jpg',
    fallbackColor: 'linear-gradient(135deg, #0d9488, #115e59)',
    description: 'The Surface Water and Ocean Topography (SWOT) satellite uses wide-swath Ka-band Radar Interferometry (KaRIn) to measure water elevations across 90% of Earth\'s surface. It surveys freshwater rivers wider than 100 meters, over two million lakes, and tracks ocean eddies that absorb atmospheric heat and greenhouse carbon.',
    techSpecs: 'Instrument: KaRIn dual-antenna radar interferometer · Resolution: Sub-centimeter sea surface height',
    sourceUrl: 'https://swot.jpl.nasa.gov/',
  },
  {
    id: 'jwst-deep-space',
    category: 'observatory',
    tag: 'SPACE OBSERVATORY AT SUN-EARTH L2',
    title: 'James Webb Space Telescope: Infrared Eyes on the Early Cosmos',
    agency: 'NASA / ESA / CSA',
    date: 'Cosmic Exploration',
    targetBody: 'sun',
    image: 'https://stsci-opo.org/STScI-01G7ETPF10P2Y3VEXHCVK8P1S4.png',
    fallbackColor: 'linear-gradient(135deg, #7c3aed, #4c1d95)',
    description: 'Operating at Sun-Earth Lagrange Point 2 (1.5 million km behind Earth\'s night side), Webb uses a 6.5-meter gold-coated beryllium mirror cooled to −233 °C (−388 °F) to observe the earliest galaxies formed 13.5 billion years ago, map exoplanet atmospheres, and reveal stellar nurseries obscured by cosmic dust.',
    techSpecs: 'Primary mirror: 6.5 m diameter · Instruments: NIRCam, NIRSpec, MIRI, FGS/NIRISS · Sunshield: 5 layers Kapton',
    sourceUrl: 'https://webbtelescope.org/',
  },
  {
    id: 'satellite-swarm-census',
    category: 'earth',
    tag: 'ORBITAL SATELLITE CENSUS',
    title: 'Global Satellite Swarm: Over 10,240 Active Satellites in 2026',
    agency: 'Space Surveillance Network / ITU',
    date: 'Live Orbital Constellations',
    targetBody: 'earth',
    image: 'https://images-assets.nasa.gov/image/PIA14447/PIA14447~small.jpg',
    fallbackColor: 'linear-gradient(135deg, #0369a1, #0f172a)',
    description: 'Humanity operates over 10,240 active satellites in orbit around Earth. Low Earth Orbit (LEO) houses over 8,820 satellites powering broadband connectivity and climate monitoring. Medium Earth Orbit (MEO) hosts 185 navigation satellites (GPS, Galileo, GLONASS, BeiDou). The Geostationary Clarke Belt (GEO) at 35,786 km hosts 585 telecommunication and weather satellites.',
    techSpecs: 'LEO: 8,820+ · MEO: 185 · GEO: 585 · HEO: 95 · Tracked debris objects (>10 cm): 36,500+',
    sourceUrl: 'https://www.orbitaldebris.jsc.nasa.gov/',
  },
];

/**
 * Setup and mount the NASA Satellite & Space Technology News UI.
 * @param {Object} options
 * @param {Function} options.flyTo Navigation callback (bodyId)
 * @param {Function} options.select Selection callback (bodyId)
 * @param {Function} options.toggleSatellites Callback to toggle Earth satellite layers
 * @param {Object} options.orbitCam Camera controller for targeting coordinates
 */
export function setupNasaNewsUI({ flyTo, select, toggleSatellites, orbitCam }) {
  // Inject CSS styles for modal and floating trigger
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    #nasa-news-btn {
      position: fixed;
      top: 14px;
      left: 170px;
      z-index: 100;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(56, 189, 248, 0.4);
      color: #e0f2fe;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 7px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      transition: all 0.2s ease;
    }
    #nasa-news-btn:hover {
      background: rgba(30, 58, 138, 0.85);
      border-color: #38bdf8;
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(56, 189, 248, 0.3);
    }
    #nasa-news-btn .badge-live {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22c55e;
      box-shadow: 0 0 8px #22c55e;
      animation: pulse-green 2s infinite;
    }
    @keyframes pulse-green {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.8); }
    }

    #nasa-news-overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(3, 7, 18, 0.78);
      backdrop-filter: blur(16px);
      display: flex;
      justify-content: center;
      align-items: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease;
    }
    #nasa-news-overlay.active {
      opacity: 1;
      pointer-events: auto;
    }

    .nasa-modal {
      width: 90%;
      max-width: 980px;
      max-height: 88vh;
      background: #0f172a;
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 24px 64px rgba(0,0,0,0.7), 0 0 32px rgba(56, 189, 248, 0.15);
      animation: modal-pop 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes modal-pop {
      from { transform: scale(0.94); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    .nasa-header {
      padding: 16px 24px;
      background: rgba(30, 41, 59, 0.6);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .nasa-header-title {
      font-size: 18px;
      font-weight: 600;
      color: #f8fafc;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .nasa-close-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 20px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 6px;
      transition: all 0.2s;
    }
    .nasa-close-btn:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.1);
    }

    .nasa-stats-bar {
      padding: 10px 24px;
      background: rgba(15, 23, 42, 0.9);
      border-bottom: 1px solid rgba(56, 189, 248, 0.2);
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
      font-size: 12px;
      color: #94a3b8;
    }
    .nasa-stat-item strong {
      color: #38bdf8;
      font-weight: 600;
    }

    .nasa-filter-bar {
      padding: 10px 24px;
      display: flex;
      gap: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .nasa-filter-btn {
      background: rgba(30, 41, 59, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #94a3b8;
      padding: 6px 14px;
      border-radius: 14px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .nasa-filter-btn.active, .nasa-filter-btn:hover {
      background: #0284c7;
      border-color: #38bdf8;
      color: #fff;
    }

    .nasa-cards-grid {
      padding: 20px 24px;
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
      gap: 18px;
    }
    @media (max-width: 640px) {
      .nasa-cards-grid { grid-template-columns: 1fr; padding: 14px; }
      #nasa-news-btn { left: 14px; top: 58px; font-size: 11px; padding: 4px 10px; }
    }

    .nasa-card {
      background: rgba(30, 41, 59, 0.45);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: transform 0.2s ease, border-color 0.2s ease;
    }
    .nasa-card:hover {
      transform: translateY(-2px);
      border-color: rgba(56, 189, 248, 0.4);
      background: rgba(30, 41, 59, 0.65);
    }
    .nasa-card-img-wrap {
      height: 170px;
      width: 100%;
      background: #1e293b;
      position: relative;
      overflow: hidden;
    }
    .nasa-card-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .nasa-card-tag {
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(3, 7, 18, 0.75);
      backdrop-filter: blur(6px);
      border: 1px solid rgba(56, 189, 248, 0.4);
      color: #38bdf8;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .nasa-card-body {
      padding: 16px;
      display: flex;
      flex-direction: column;
      flex-grow: 1;
    }
    .nasa-card-title {
      font-size: 15px;
      font-weight: 600;
      color: #f1f5f9;
      margin: 0 0 6px 0;
      line-height: 1.35;
    }
    .nasa-card-meta {
      font-size: 11px;
      color: #64748b;
      margin-bottom: 10px;
      display: flex;
      gap: 10px;
    }
    .nasa-card-meta span { color: #94a3b8; font-weight: 500; }
    .nasa-card-desc {
      font-size: 12.5px;
      line-height: 1.5;
      color: #cbd5e1;
      margin-bottom: 12px;
      flex-grow: 1;
    }
    .nasa-card-specs {
      background: rgba(15, 23, 42, 0.6);
      border-left: 3px solid #38bdf8;
      padding: 8px 12px;
      border-radius: 0 6px 6px 0;
      font-size: 11px;
      color: #94a3b8;
      margin-bottom: 14px;
    }
    .nasa-card-actions {
      display: flex;
      gap: 10px;
      margin-top: auto;
    }
    .nasa-action-fly {
      background: #0284c7;
      color: #fff;
      border: none;
      padding: 7px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s;
    }
    .nasa-action-fly:hover { background: #0369a1; }
    .nasa-action-link {
      background: rgba(255, 255, 255, 0.08);
      color: #94a3b8;
      text-decoration: none;
      padding: 7px 12px;
      border-radius: 8px;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: all 0.2s;
    }
    .nasa-action-link:hover {
      background: rgba(255, 255, 255, 0.15);
      color: #f8fafc;
    }
  `;
  document.head.appendChild(styleEl);

  // Floating trigger button
  const triggerBtn = document.createElement('button');
  triggerBtn.id = 'nasa-news-btn';
  triggerBtn.innerHTML = `
    <span class="badge-live"></span>
    <span>🛰️ NASA Tech & Satellites (N)</span>
  `;
  triggerBtn.title = 'View Live Satellites & NASA Space Technology News (Shortcut: N)';
  document.body.appendChild(triggerBtn);

  // Modal dialog overlay
  const overlay = document.createElement('div');
  overlay.id = 'nasa-news-overlay';
  overlay.innerHTML = `
    <div class="nasa-modal">
      <div class="nasa-header">
        <div class="nasa-header-title">
          <span>🛰️ NASA Space Tech & Earth Observation Satellites</span>
          <span style="font-size: 11px; background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.4); padding: 2px 8px; border-radius: 12px;">ACTIVE OBSERVATION</span>
        </div>
        <button class="nasa-close-btn" id="nasa-close-btn" title="Close (Esc)">✕</button>
      </div>

      <div class="nasa-stats-bar">
        <div class="nasa-stat-item">Active Satellites: <strong>${SATELLITE_STATS.totalActive.toLocaleString()}+</strong></div>
        <div class="nasa-stat-item">LEO Swarms: <strong>${SATELLITE_STATS.leo.toLocaleString()}+</strong></div>
        <div class="nasa-stat-item">MEO Nav: <strong>${SATELLITE_STATS.meo.toLocaleString()}</strong></div>
        <div class="nasa-stat-item">GEO Clarke Belt: <strong>${SATELLITE_STATS.geo.toLocaleString()}</strong></div>
        <div class="nasa-stat-item">Tracked Debris: <strong>${SATELLITE_STATS.trackedDebris.toLocaleString()}+</strong></div>
      </div>

      <div class="nasa-filter-bar">
        <button class="nasa-filter-btn active" data-filter="all">All Missions (${NEWS_ITEMS.length})</button>
        <button class="nasa-filter-btn" data-filter="earth">Earth Satellites</button>
        <button class="nasa-filter-btn" data-filter="lunar">Lunar Missions & Equipment</button>
        <button class="nasa-filter-btn" data-filter="observatory">Space Observatories</button>
      </div>

      <div class="nasa-cards-grid" id="nasa-cards-grid"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const cardsGrid = overlay.querySelector('#nasa-cards-grid');

  function renderCards(filter = 'all') {
    cardsGrid.innerHTML = '';
    const filtered = filter === 'all' ? NEWS_ITEMS : NEWS_ITEMS.filter((item) => item.category === filter);

    for (const item of filtered) {
      const card = document.createElement('div');
      card.className = 'nasa-card';
      card.innerHTML = `
        <div class="nasa-card-img-wrap" style="background: ${item.fallbackColor}">
          <img class="nasa-card-img" src="${item.image}" alt="${item.title}" loading="lazy" onerror="this.style.display='none'" />
          <span class="nasa-card-tag">${item.tag}</span>
        </div>
        <div class="nasa-card-body">
          <h3 class="nasa-card-title">${item.title}</h3>
          <div class="nasa-card-meta">
            <span>${item.agency}</span> · <span>${item.date}</span>
          </div>
          <p class="nasa-card-desc">${item.description}</p>
          <div class="nasa-card-specs">${item.techSpecs}</div>
          <div class="nasa-card-actions">
            <button class="nasa-action-fly" data-target="${item.targetBody}" data-id="${item.id}">
              🚀 View in 3D
            </button>
            <a class="nasa-action-link" href="${item.sourceUrl}" target="_blank" rel="noopener noreferrer">
              🔗 NASA Resource
            </a>
          </div>
        </div>
      `;

      card.querySelector('.nasa-action-fly').addEventListener('click', () => {
        closeModal();
        if (item.targetBody) {
          if (flyTo) flyTo(item.targetBody);
          if (select) select(item.targetBody);
          if (item.targetLat !== undefined && item.targetLon !== undefined && orbitCam) {
            const DEG = Math.PI / 180;
            orbitCam.lat = item.targetLat * DEG;
            orbitCam.lon = item.targetLon * DEG;
            orbitCam.dist = 1737.4 * 1.05;
            orbitCam.distTarget = 1737.4 * 1.05;
          }
          if (item.category === 'earth' && toggleSatellites) {
            toggleSatellites(true);
          }
        }
      });

      cardsGrid.appendChild(card);
    }
  }

  renderCards('all');

  // Filter tab clicks
  overlay.querySelectorAll('.nasa-filter-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      overlay.querySelectorAll('.nasa-filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderCards(btn.dataset.filter);
    });
  });

  function openModal() {
    overlay.classList.add('active');
  }

  function closeModal() {
    overlay.classList.remove('active');
  }

  function toggleModal() {
    if (overlay.classList.contains('active')) closeModal();
    else openModal();
  }

  triggerBtn.addEventListener('click', toggleModal);
  overlay.querySelector('#nasa-close-btn').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  // Keyboard shortcut: N toggles modal; Escape closes it
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'KeyN') {
      e.preventDefault();
      toggleModal();
    } else if (e.code === 'Escape' && overlay.classList.contains('active')) {
      e.preventDefault();
      closeModal();
    }
  });

  return { open: openModal, close: closeModal, toggle: toggleModal };
}

