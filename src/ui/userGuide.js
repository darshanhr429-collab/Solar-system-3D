// User Guide & Interactive Technical Flight Manual (PDF / Document Viewer)
// Provides a first-access welcome guide explaining controls, keywords, tours,
// and an authentic stylized technical document / PDF viewer for classroom curricula.
// 100% English, fully responsive, print-ready.

export function setupUserGuideUI({ flyTo, select, toggleSatellites, openNasaNews }) {
  // Inject scoped styles for both Quick Guide and Stylized Technical PDF Viewer
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    #guide-trigger-btn {
      position: fixed;
      top: 14px;
      left: 395px;
      z-index: 100;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(147, 197, 253, 0.4);
      color: #eff6ff;
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
    #guide-trigger-btn:hover {
      background: rgba(30, 64, 175, 0.85);
      border-color: #93c5fd;
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(147, 197, 253, 0.3);
    }
    @media (max-width: 768px) {
      #guide-trigger-btn { left: 14px; top: 96px; font-size: 11px; padding: 4px 10px; }
    }

    /* Modal Overlay */
    .sw-overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(3, 7, 18, 0.82);
      backdrop-filter: blur(16px);
      display: flex;
      justify-content: center;
      align-items: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease;
    }
    .sw-overlay.active {
      opacity: 1;
      pointer-events: auto;
    }

    /* Quick Guide Modal */
    .guide-modal {
      width: 90%;
      max-width: 860px;
      max-height: 88vh;
      background: #0f172a;
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 24px 64px rgba(0,0,0,0.8), 0 0 32px rgba(56, 189, 248, 0.15);
      animation: modal-pop 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .guide-header {
      padding: 18px 24px;
      background: rgba(30, 41, 59, 0.7);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .guide-header h2 {
      margin: 0;
      font-size: 19px;
      font-weight: 600;
      color: #f8fafc;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .guide-close-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 20px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 6px;
      transition: all 0.2s;
    }
    .guide-close-btn:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.1);
    }

    .guide-content {
      padding: 22px 26px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 20px;
      color: #cbd5e1;
      font-size: 13.5px;
      line-height: 1.6;
    }

    .guide-section {
      background: rgba(30, 41, 59, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 16px 20px;
    }
    .guide-section h3 {
      margin: 0 0 10px 0;
      font-size: 15px;
      color: #38bdf8;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .controls-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 12px;
      margin-top: 8px;
    }
    .control-card {
      background: rgba(15, 23, 42, 0.6);
      border-left: 3px solid #38bdf8;
      padding: 10px 14px;
      border-radius: 0 8px 8px 0;
    }
    .control-card strong {
      color: #f1f5f9;
      display: block;
      margin-bottom: 4px;
    }

    .keyword-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }
    .keyword-pill {
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.35);
      color: #7dd3fc;
      padding: 4px 10px;
      border-radius: 14px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .keyword-pill:hover {
      background: #0284c7;
      color: #fff;
      transform: translateY(-1px);
    }

    .guide-actions {
      padding: 16px 24px;
      background: rgba(15, 23, 42, 0.85);
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .btn-pdf {
      background: linear-gradient(135deg, #1e3a8a, #0369a1);
      color: #f0f9ff;
      border: 1px solid rgba(125, 211, 252, 0.5);
      padding: 9px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 14px rgba(3, 105, 161, 0.3);
      transition: all 0.2s;
    }
    .btn-pdf:hover {
      background: linear-gradient(135deg, #1d4ed8, #0284c7);
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(3, 105, 161, 0.45);
    }
    .btn-gotit {
      background: #0284c7;
      color: #fff;
      border: none;
      padding: 9px 22px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn-gotit:hover {
      background: #0369a1;
    }

    /* ── Stylized PDF Flight Manual Modal ── */
    .pdf-modal {
      width: 95%;
      max-width: 920px;
      height: 92vh;
      background: #f8fafc;
      color: #0f172a;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 24px 70px rgba(0,0,0,0.85);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .pdf-toolbar {
      background: #1e293b;
      color: #f8fafc;
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #0284c7;
    }
    .pdf-toolbar-title {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .pdf-toolbar-btns {
      display: flex;
      gap: 10px;
    }
    .pdf-tool-btn {
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #f8fafc;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s;
    }
    .pdf-tool-btn:hover {
      background: rgba(255, 255, 255, 0.25);
    }
    .pdf-paper {
      flex-grow: 1;
      overflow-y: auto;
      padding: 40px 50px;
      background: #ffffff;
      line-height: 1.6;
    }
    @media (max-width: 640px) {
      .pdf-paper { padding: 20px 16px; }
    }
    .pdf-doc-header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 16px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .pdf-doc-id {
      font-family: monospace;
      font-size: 12px;
      color: #64748b;
    }
    .pdf-doc-title {
      font-size: 24px;
      font-weight: 800;
      color: #0f172a;
      margin: 4px 0 0 0;
      letter-spacing: -0.5px;
    }
    .pdf-doc-subtitle {
      font-size: 13px;
      color: #475569;
      margin: 4px 0 0 0;
    }
    .pdf-seal {
      border: 2px solid #0284c7;
      color: #0284c7;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    .pdf-paper h2 {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 6px;
      margin: 28px 0 12px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .pdf-paper p {
      font-size: 13.5px;
      color: #334155;
      margin: 0 0 12px 0;
    }
    .pdf-table {
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0 20px 0;
      font-size: 12.5px;
    }
    .pdf-table th, .pdf-table td {
      border: 1px solid #cbd5e1;
      padding: 8px 12px;
      text-align: left;
    }
    .pdf-table th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 600;
    }
    .pdf-callout {
      background: #f0fdf4;
      border-left: 4px solid #16a34a;
      padding: 12px 16px;
      border-radius: 0 6px 6px 0;
      margin: 16px 0;
      font-size: 13px;
      color: #166534;
    }

    /* Print styles */
    @media print {
      body * { visibility: hidden; }
      #pdf-manual-modal, #pdf-manual-modal * { visibility: visible; }
      #pdf-manual-modal {
        position: absolute;
        left: 0; top: 0; width: 100%; height: auto;
        box-shadow: none; border: none;
      }
      .pdf-toolbar { display: none !important; }
      .pdf-paper { padding: 0; }
    }
  `;
  document.head.appendChild(styleEl);

  // 1. Floating Header Trigger Button
  const triggerBtn = document.createElement('button');
  triggerBtn.id = 'guide-trigger-btn';
  triggerBtn.innerHTML = `
    <span>📖 User Guide & Manual (H)</span>
  `;
  triggerBtn.title = 'Open Quick Start Exploration Guide & PDF Flight Manual';
  document.body.appendChild(triggerBtn);

  // 2. Quick Guide Modal Overlay
  const guideOverlay = document.createElement('div');
  guideOverlay.className = 'sw-overlay';
  guideOverlay.id = 'quick-guide-overlay';
  guideOverlay.innerHTML = `
    <div class="guide-modal">
      <div class="guide-header">
        <h2>
          <span>🚀 Welcome to Solar Wanderer</span>
          <span style="font-size: 11px; background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); padding: 2px 8px; border-radius: 12px;">STUDENT & CLASSROOM GUIDE</span>
        </h2>
        <button class="guide-close-btn" id="guide-close-btn" title="Close (Esc)">✕</button>
      </div>

      <div class="guide-content">
        <div class="guide-section">
          <h3>🎮 How to Navigate & Explore</h3>
          <p>Solar Wanderer is a true <strong>1:1 scale, real-time solar system explorer</strong> powered by official NASA JPL ephemerides, spanning from the solar surface out to the Oort Cloud at 100,000 AU.</p>
          <div class="controls-grid">
            <div class="control-card">
              <strong>🌐 Orbit / Explore Mode (Default)</strong>
              Left-click drag to rotate around focus. Scroll wheel zooms seamlessly from surface level to cosmic scales. Click any body to select; double-click or press <code>T</code> to fly directly to it.
            </div>
            <div class="control-card">
              <strong>🚀 Free Flight Mode (Press F)</strong>
              Piloted 6DOF spacecraft flight. Use <code>W/A/S/D</code> to maneuver, <code>Q/E</code> to roll, and number keys <code>1-9</code> to throttle speed (from 1 m/s up to 2 AU/s).
            </div>
            <div class="control-card">
              <strong>🚶 Surface Walk Mode (Press G)</strong>
              Touch down and walk across real terrain on the Moon, Mars, Earth, or Europa. Experience true surface gravity and local horizons.
            </div>
          </div>
        </div>

        <div class="guide-section">
          <h3>🔍 Keywords to Search</h3>
          <p>Type any keyword into the <strong>Search Box (top-left)</strong> or click a pill below to immediately highlight and fly to that mission or world:</p>
          <div class="keyword-pills">
            <span class="keyword-pill" data-id="chandrayaan3">🇮🇳 Chandrayaan-3</span>
            <span class="keyword-pill" data-id="chandrayaan3">Shiv Shakti Point</span>
            <span class="keyword-pill" data-id="apollo11">🌕 Apollo 11 (Mare Tranquillitatis)</span>
            <span class="keyword-pill" data-id="apollo15">Hadley Rille (Apollo 15)</span>
            <span class="keyword-pill" data-id="satellites">🛰️ Earth Satellites (10,000+)</span>
            <span class="keyword-pill" data-id="iss">International Space Station (ISS)</span>
            <span class="keyword-pill" data-id="hubble">Hubble Space Telescope</span>
            <span class="keyword-pill" data-id="moon">The Moon</span>
            <span class="keyword-pill" data-id="mars">Mars</span>
            <span class="keyword-pill" data-id="europa">Europa (Ocean World)</span>
            <span class="keyword-pill" data-id="titan">Titan (Methane Lakes)</span>
            <span class="keyword-pill" data-id="enceladus">Enceladus (Ice Geysers)</span>
            <span class="keyword-pill" data-id="asteroidbelt">Asteroid Belt</span>
            <span class="keyword-pill" data-id="kuiperbelt">Kuiper Belt</span>
            <span class="keyword-pill" data-id="oortcloud">Oort Cloud</span>
          </div>
        </div>

        <div class="guide-section">
          <h3>🎬 Structured Educational Package Tours</h3>
          <p>Open the left menu drawer and expand <strong>🎬 Tours</strong> to take guided, narrated journeys designed for classroom discussion:</p>
          <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #94a3b8;">
            <li><strong style="color:#e2e8f0;">Chandrayaan-3 Expedition:</strong> Explore Vikram lander, Pragyan rover, ChaSTE thermal probe, and permanently shadowed water-ice craters at the lunar south pole.</li>
            <li><strong style="color:#e2e8f0;">Apollo Lunar Equipment:</strong> Inspect the Lunar Module Descent Stage, ALSEP nuclear power station, and Laser Ranging Retroreflector.</li>
            <li><strong style="color:#e2e8f0;">Earth\'s Orbital Highway:</strong> Discover the 10,240+ active satellites circling Earth across LEO, MEO navigation, and the Geostationary Clarke Belt.</li>
            <li><strong style="color:#e2e8f0;">Moons of the Solar System:</strong> Compare Io\'s sulfur volcanoes, Europa\'s ocean, Ganymede\'s magnetosphere, and Titan\'s methane rain.</li>
          </ul>
        </div>
      </div>

      <div class="guide-actions">
        <button class="btn-pdf" id="open-pdf-manual-btn">
          <span>📄 Open Flight Manual & Reference Guide (PDF / Document View)</span>
        </button>
        <button class="btn-gotit" id="guide-gotit-btn">
          <span>Got it — Start Exploring 🚀</span>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(guideOverlay);

  // 3. Stylized PDF Technical Manual Overlay
  const pdfOverlay = document.createElement('div');
  pdfOverlay.className = 'sw-overlay';
  pdfOverlay.id = 'pdf-manual-overlay';
  pdfOverlay.innerHTML = `
    <div class="pdf-modal" id="pdf-manual-modal">
      <div class="pdf-toolbar">
        <div class="pdf-toolbar-title">
          <span>📄 SOLAR SYSTEM EXPLORATION MANUAL & TECHNICAL REFERENCE</span>
        </div>
        <div class="pdf-toolbar-btns">
          <button class="pdf-tool-btn" id="pdf-print-btn" title="Print document or Save as PDF">
            <span>🖨️ Print / Save as PDF</span>
          </button>
          <button class="pdf-tool-btn" id="pdf-download-btn" title="Download Markdown text">
            <span>📥 Download Text</span>
          </button>
          <button class="pdf-tool-btn" id="pdf-close-btn" title="Close document">
            <span>✕ Close</span>
          </button>
        </div>
      </div>

      <div class="pdf-paper" id="pdf-paper-content">
        <div class="pdf-doc-header">
          <div>
            <div class="pdf-doc-id">DOCUMENT NO. NASA-ISRO-EDU-2026-V2 · REV B · PUBLIC DISTRIBUTION</div>
            <h1 class="pdf-doc-title">Solar System Exploration Manual & Student Guide</h1>
            <div class="pdf-doc-subtitle">Astrodynamics, Orbital Telemetry, Lunar Surface Equipment & Satellite Census</div>
          </div>
          <div class="pdf-seal">OFFICIAL ATLAS</div>
        </div>

        <h2>1. Astrodynamical Framework & Coordinate Systems</h2>
        <p>Solar Wanderer operates on true <strong>1:1 metric scale</strong> using high-precision ephemerides from NASA JPL Horizons. Planetary positions are computed in the Heliocentric Ecliptic J2000 frame, mapping to Three.js world coordinates with the floating origin technique to eliminate floating-point quantization jitter across distances from 0.5 meters to 1.5×10¹³ km (100,000 AU).</p>

        <h2>2. Planetary & Natural Satellite Reference Telemetry</h2>
        <table class="pdf-table">
          <thead>
            <tr>
              <th>Celestial Body</th>
              <th>Mean Radius</th>
              <th>Surface Gravity</th>
              <th>Orbital Semimajor Axis</th>
              <th>Orbital Period</th>
              <th>Key Scientific Feature</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Sun</strong></td>
              <td>696,340 km</td>
              <td>274.0 m/s²</td>
              <td>—</td>
              <td>~230 Myr (Galactic)</td>
              <td>G2V star holding 99.86% solar system mass</td>
            </tr>
            <tr>
              <td><strong>Earth</strong></td>
              <td>6,371 km</td>
              <td>9.81 m/s²</td>
              <td>1.000 AU (1.496×10⁸ km)</td>
              <td>365.25 days</td>
              <td>Habitable world with liquid ocean & nitrogen-oxygen atmosphere</td>
            </tr>
            <tr>
              <td><strong>Moon</strong></td>
              <td>1,737.4 km</td>
              <td>1.62 m/s²</td>
              <td>384,400 km</td>
              <td>27.32 days</td>
              <td>Tidally locked; sites of Apollo and Chandrayaan-3 missions</td>
            </tr>
            <tr>
              <td><strong>Mars</strong></td>
              <td>3,389.5 km</td>
              <td>3.71 m/s²</td>
              <td>1.524 AU</td>
              <td>686.98 days</td>
              <td>Olympus Mons (21.9 km volcano), Valles Marineris canyon</td>
            </tr>
            <tr>
              <td><strong>Jupiter</strong></td>
              <td>69,911 km</td>
              <td>24.79 m/s²</td>
              <td>5.204 AU</td>
              <td>11.86 years</td>
              <td>Largest planet; Great Red Spot anticyclone & 95 moons</td>
            </tr>
            <tr>
              <td><strong>Europa</strong></td>
              <td>1,560.8 km</td>
              <td>1.32 m/s²</td>
              <td>670,900 km</td>
              <td>3.55 days</td>
              <td>Subsurface global water ocean under cracked ice shell</td>
            </tr>
            <tr>
              <td><strong>Titan</strong></td>
              <td>2,574.7 km</td>
              <td>1.35 m/s²</td>
              <td>1,221,870 km</td>
              <td>15.95 days</td>
              <td>Dense nitrogen air (1.5 bar), liquid methane lakes & rivers</td>
            </tr>
          </tbody>
        </table>

        <h2>3. Lunar Expeditions & Recreated Scientific Equipment</h2>
        <p><strong>Apollo Lunar Surface Experiments Package (ALSEP):</strong> Permanently deployed scientific stations powered by 73-watt SNAP-27 Radioisotope Thermoelectric Generators (RTGs). Instruments include passive seismometers, cold cathode ion gauges, and the 100-corner-cube Laser Ranging Retroreflector (LRRR) in Mare Tranquillitatis, continually pinged by Earth lasers for precision orbital measurement.</p>
        <p><strong>Chandrayaan-3 at Shiv Shakti Point (69.37° S, 32.32° E):</strong> India\'s historic soft landing near the lunar south pole on August 23, 2023. Key instruments deployed:</p>
        <ul>
          <li><strong>ChaSTE (Chandra\'s Surface Thermophysical Experiment):</strong> Thermal probe penetrating 10 cm into the regolith, recording a 60 °C temperature drop just 8 cm below the surface.</li>
          <li><strong>LIBS (Laser-Induced Breakdown Spectroscope):</strong> Pragyan rover laser firing into the regolith, confirming sulfur, aluminum, calcium, iron, and titanium.</li>
          <li><strong>Permanently Shadowed Craters (PSRs):</strong> South polar crater floors act as cold traps at −246 °C (27 K), holding substantial water-ice deposits.</li>
        </ul>

        <h2>4. Earth Artificial Satellites Swarm Census (10,240+ Active)</h2>
        <div class="pdf-callout">
          <strong>Active Satellite Constellation Breakdown (2026):</strong><br/>
          • <strong>Low Earth Orbit (LEO, 160–2,000 km):</strong> 8,820+ satellites (broadband swarms, Earth observation, ISS at 415 km). Speed: ~7.6 km/s.<br/>
          • <strong>Medium Earth Orbit (MEO, 2,000–35,786 km):</strong> 185 navigation satellites (GPS, Galileo, GLONASS, BeiDou at 20,200 km, 55° inclination).<br/>
          • <strong>Geostationary Orbit (GEO, 35,786 km):</strong> 585 satellites orbiting at Earth\'s rotational speed along the equatorial Clarke Belt.<br/>
          • <strong>High Elliptical Orbit (HEO):</strong> 95 satellites.<br/>
          • <strong>Tracked Orbital Debris (>10 cm):</strong> 36,500+ objects monitored by Space Surveillance Networks.
        </div>

        <h2>5. Classroom Inquiry & Student Discussion Questions</h2>
        <ol>
          <li>Why does the Laser Ranging Retroreflector (LRRR) left on the Moon by Apollo 11 still work without any electricity or battery power after more than 50 years?</li>
          <li>How does the extreme temperature gradient measured by Chandrayaan-3\'s ChaSTE probe (60 °C drop in 8 cm) demonstrate that lunar regolith is a near-perfect thermal insulator?</li>
          <li>Why do geostationary satellites need to be placed at the exact altitude of 35,786 kilometers, and why can they only be placed directly above Earth\'s equator?</li>
          <li>Compare the atmospheric pressure of Titan (1.5 bar) to Mars (0.006 bar). Why is Titan able to maintain a thicker atmosphere despite having lower surface gravity?</li>
          <li>What are the primary hazards posed by the 36,500+ tracked orbital debris fragments to active satellite constellations, and what mitigation measures are used?</li>
        </ol>
      </div>
    </div>
  `;
  document.body.appendChild(pdfOverlay);

  // Helper functions
  function openGuide() {
    guideOverlay.classList.add('active');
  }
  function closeGuide() {
    guideOverlay.classList.remove('active');
  }
  function openPdf() {
    closeGuide();
    pdfOverlay.classList.add('active');
  }
  function closePdf() {
    pdfOverlay.classList.remove('active');
  }

  // Event listeners
  triggerBtn.addEventListener('click', openGuide);
  guideOverlay.querySelector('#guide-close-btn').addEventListener('click', closeGuide);
  guideOverlay.querySelector('#guide-gotit-btn').addEventListener('click', () => {
    localStorage.setItem('sw_guide_dismissed', '1');
    closeGuide();
  });
  guideOverlay.querySelector('#open-pdf-manual-btn').addEventListener('click', openPdf);

  pdfOverlay.querySelector('#pdf-close-btn').addEventListener('click', closePdf);
  pdfOverlay.querySelector('#pdf-print-btn').addEventListener('click', () => {
    window.print();
  });
  pdfOverlay.querySelector('#pdf-download-btn').addEventListener('click', () => {
    const text = document.getElementById('pdf-paper-content').innerText;
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Solar_Wanderer_Flight_Manual.md';
    a.click();
    URL.revokeObjectURL(url);
  });

  // Keyword pills inside guide
  guideOverlay.querySelectorAll('.keyword-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      const id = pill.dataset.id;
      if (id && flyTo) {
        closeGuide();
        flyTo(id);
        if (select) select(id);
      }
    });
  });

  // Overlay click backdrop close
  guideOverlay.addEventListener('click', (e) => {
    if (e.target === guideOverlay) closeGuide();
  });
  pdfOverlay.addEventListener('click', (e) => {
    if (e.target === pdfOverlay) closePdf();
  });

  // Global keydown: H toggles guide; Esc closes
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'KeyH') {
      e.preventDefault();
      if (guideOverlay.classList.contains('active') || pdfOverlay.classList.contains('active')) {
        closeGuide();
        closePdf();
      } else {
        openGuide();
      }
    } else if (e.code === 'Escape') {
      if (pdfOverlay.classList.contains('active')) closePdf();
      else if (guideOverlay.classList.contains('active')) closeGuide();
    }
  });

  // Check first access: if first time visiting, show the guide automatically after splash screen
  const hasVisited = localStorage.getItem('sw_guide_dismissed');
  if (!hasVisited) {
    // Show shortly after startup
    setTimeout(() => {
      const startEl = document.getElementById('start');
      if (!startEl || startEl.style.display === 'none') {
        openGuide();
      } else {
        // Wait until start button clicked
        const observer = new MutationObserver(() => {
          if (startEl.style.display === 'none') {
            observer.disconnect();
            openGuide();
          }
        });
        observer.observe(startEl, { attributes: true, attributeFilter: ['style'] });
      }
    }, 1800);
  }

  return { openGuide, closeGuide, openPdf, closePdf };
}

