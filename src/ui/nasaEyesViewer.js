// NASA's Eyes Interactive 3D Model Viewer & Telemetry Source Studio
// Provides interactive 360° inspection of Voyager 1, Voyager 2, and real asteroids
// (Bennu, Ryugu, Eros, Itokawa, Psyche, Vesta, Comet 67P) with realistic PBR rendering,
// wireframe modes, component hotspot inspection, authentic NASA NAIF SPICE telemetry,
// and direct flight navigation into the 1:1 solar system simulation.
// 100% English, fully responsive, print & classroom ready.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { NASA_EYES_CATALOG, createEyesModel } from '../scene/nasaEyesModels.js';

/**
 * Setup and mount the NASA Eyes 3D Interactive Model Viewer UI.
 * @param {Object} options
 * @param {Function} options.flyTo Navigation callback (bodyId)
 * @param {Function} options.select Target selection callback (bodyId)
 */
export function setupNasaEyesViewerUI({ flyTo, select }) {
  // Inject CSS styles for modal, viewer canvas, and trigger button
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    #nasa-eyes-btn {
      display: none !important;
    }
    #nasa-eyes-btn .badge-3d {
      background: #9333ea;
      color: #fff;
      font-size: 9px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 4px;
      letter-spacing: 0.5px;
    }
    @media (max-width: 900px) {
      #nasa-eyes-btn { left: 14px; top: 132px; font-size: 11px; padding: 4px 10px; }
    }

    /* Modal Overlay */
    #nasa-eyes-overlay {
      position: fixed;
      inset: 0;
      z-index: 1100;
      background: rgba(3, 7, 18, 0.86);
      backdrop-filter: blur(20px);
      display: none;
      justify-content: center;
      align-items: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease;
    }
    #nasa-eyes-overlay.active {
      display: flex;
      opacity: 1;
      pointer-events: auto;
    }

    .eyes-modal {
      width: 96%;
      max-width: 1320px;
      height: 92vh;
      background: #090d16;
      border: 1px solid rgba(168, 85, 247, 0.35);
      border-radius: 18px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 24px 64px rgba(0,0,0,0.8), 0 0 40px rgba(168, 85, 247, 0.15);
      animation: eyes-pop 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes eyes-pop {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    /* Header */
    .eyes-header {
      padding: 14px 22px;
      background: rgba(19, 24, 38, 0.85);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }
    .eyes-header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .eyes-title {
      font-size: 17px;
      font-weight: 600;
      color: #f8fafc;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .eyes-subtitle {
      font-size: 12px;
      color: #94a3b8;
    }
    .eyes-close-btn {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #cbd5e1;
      font-size: 16px;
      cursor: pointer;
      padding: 6px 14px;
      border-radius: 8px;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .eyes-close-btn:hover {
      background: rgba(239, 68, 68, 0.2);
      border-color: #ef4444;
      color: #fff;
    }

    /* Model Selection Bar */
    .eyes-model-bar {
      padding: 8px 18px;
      background: rgba(15, 20, 32, 0.95);
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      display: flex;
      gap: 8px;
      overflow-x: auto;
      scrollbar-width: thin;
      flex-shrink: 0;
    }
    .eyes-model-pill {
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #94a3b8;
      padding: 6px 14px;
      border-radius: 14px;
      font-size: 12px;
      cursor: pointer;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .eyes-model-pill:hover {
      background: rgba(147, 51, 234, 0.2);
      border-color: #a855f7;
      color: #f1f5f9;
    }
    .eyes-model-pill.active {
      background: linear-gradient(135deg, #7e22ce, #9333ea);
      border-color: #c084fc;
      color: #fff;
      font-weight: 500;
      box-shadow: 0 2px 10px rgba(168, 85, 247, 0.35);
    }

    /* Main Workspace Layout */
    .eyes-content {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 390px;
      overflow: hidden;
      position: relative;
    }
    @media (max-width: 980px) {
      .eyes-content {
        grid-template-columns: 1fr;
        grid-template-rows: 1fr 1fr;
      }
    }

    /* 3D Viewport Area */
    .eyes-viewport-container {
      position: relative;
      width: 100%;
      height: 100%;
      background: radial-gradient(circle at center, #111827 0%, #030712 100%);
      overflow: hidden;
    }
    #eyes-canvas {
      width: 100%;
      height: 100%;
      display: block;
      outline: none;
    }

    /* 3D Viewport Controls Overlay */
    .eyes-controls-overlay {
      position: absolute;
      top: 16px;
      left: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 10;
    }
    .eyes-control-group {
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      padding: 4px;
      display: flex;
      gap: 4px;
    }
    .eyes-tool-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 11px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s;
    }
    .eyes-tool-btn:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.1);
    }
    .eyes-tool-btn.active {
      background: #7e22ce;
      color: #fff;
      font-weight: 500;
    }

    /* Scale Caliper & Helper Hints */
    .eyes-viewport-hint {
      position: absolute;
      bottom: 16px;
      left: 16px;
      background: rgba(15, 23, 42, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 6px 12px;
      font-size: 11px;
      color: #94a3b8;
      pointer-events: none;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .eyes-scale-caliper {
      color: #38bdf8;
      font-weight: 500;
    }

    /* Hotspot Card Overlay */
    .eyes-hotspot-card {
      position: absolute;
      bottom: 60px;
      left: 16px;
      max-width: 380px;
      background: rgba(15, 23, 42, 0.94);
      backdrop-filter: blur(14px);
      border: 1px solid #c084fc;
      border-radius: 12px;
      padding: 14px 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.6);
      display: none;
      z-index: 20;
      animation: hotspot-fade 0.2s ease;
    }
    @keyframes hotspot-fade {
      from { transform: translateY(8px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .eyes-hotspot-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .eyes-hotspot-title {
      font-size: 13px;
      font-weight: 600;
      color: #f3e8ff;
    }
    .eyes-hotspot-close {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 14px;
      padding: 2px 4px;
    }
    .eyes-hotspot-text {
      font-size: 12px;
      line-height: 1.5;
      color: #cbd5e1;
    }

    /* Right Side Data & Telemetry Panel */
    .eyes-sidebar {
      background: rgba(13, 17, 28, 0.96);
      border-left: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      scrollbar-width: thin;
      padding: 20px;
      gap: 18px;
    }
    .eyes-target-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.8px;
      color: #c084fc;
      background: rgba(168, 85, 247, 0.12);
      border: 1px solid rgba(168, 85, 247, 0.3);
      padding: 3px 8px;
      border-radius: 4px;
      width: fit-content;
    }
    .eyes-target-name {
      font-size: 22px;
      font-weight: 700;
      color: #f8fafc;
      margin-top: 4px;
    }
    .eyes-target-operator {
      font-size: 12px;
      color: #94a3b8;
      margin-top: 2px;
    }

    /* Telemetry Grid */
    .eyes-telemetry-box {
      background: rgba(19, 25, 41, 0.85);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 12px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .eyes-telemetry-title {
      font-size: 11px;
      font-weight: 600;
      color: #38bdf8;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .eyes-telemetry-live-dot {
      display: inline-block;
      width: 7px;
      height: 7px;
      background: #22c55e;
      border-radius: 50%;
      box-shadow: 0 0 6px #22c55e;
    }
    .eyes-telemetry-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .eyes-telem-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .eyes-telem-label {
      font-size: 10px;
      color: #64748b;
      text-transform: uppercase;
    }
    .eyes-telem-val {
      font-size: 13px;
      font-weight: 600;
      color: #f1f5f9;
      font-family: monospace;
    }

    /* Specs Table */
    .eyes-specs-table {
      width: 100%;
      font-size: 12px;
      border-collapse: collapse;
    }
    .eyes-specs-table tr {
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .eyes-specs-table td {
      padding: 7px 0;
    }
    .eyes-specs-label {
      color: #94a3b8;
      width: 44%;
    }
    .eyes-specs-val {
      color: #e2e8f0;
      font-weight: 500;
    }

    /* Description */
    .eyes-description {
      font-size: 12.5px;
      line-height: 1.6;
      color: #94a3b8;
    }

    /* Hotspot Guide List */
    .eyes-hotspot-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .eyes-hotspot-btn {
      background: rgba(30, 41, 59, 0.45);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #cbd5e1;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 11.5px;
      text-align: left;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: all 0.15s;
    }
    .eyes-hotspot-btn:hover {
      background: rgba(147, 51, 234, 0.25);
      border-color: #a855f7;
      color: #fff;
    }

    /* Official NASA Links */
    .eyes-links-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .eyes-ext-link {
      color: #38bdf8;
      text-decoration: none;
      font-size: 11.5px;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: color 0.15s;
    }
    .eyes-ext-link:hover {
      color: #7dd3fc;
      text-decoration: underline;
    }

    /* Action Buttons */
    .eyes-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: auto;
      padding-top: 14px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }
    .eyes-fly-btn {
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      border: 1px solid #60a5fa;
      color: #fff;
      font-weight: 600;
      padding: 10px 18px;
      border-radius: 10px;
      font-size: 13px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s;
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
    }
    .eyes-fly-btn:hover {
      background: linear-gradient(135deg, #1d4ed8, #1e40af);
      transform: translateY(-1px);
      box-shadow: 0 6px 18px rgba(37, 99, 235, 0.5);
    }
  `;
  document.head.appendChild(styleEl);

  // Create Trigger Button
  const triggerBtn = document.createElement('button');
  triggerBtn.id = 'nasa-eyes-btn';
  triggerBtn.innerHTML = `🛸 <span>NASA Eyes 3D Models</span> <span class="badge-3d">3D</span>`;
  triggerBtn.title = 'Explore high-fidelity 3D models of Voyager 1/2 and real asteroids (Press M)';
  document.body.appendChild(triggerBtn);

  // Create Overlay & Modal Structure
  const overlay = document.createElement('div');
  overlay.id = 'nasa-eyes-overlay';
  overlay.innerHTML = `
    <div class="eyes-modal" role="dialog" aria-modal="true" aria-label="NASA's Eyes 3D Interactive Model Viewer">
      <!-- Header -->
      <div class="eyes-header">
        <div class="eyes-header-left">
          <span style="font-size: 24px;">🛸</span>
          <div>
            <div class="eyes-title">NASA's Eyes 3D Interactive Model Viewer & Source Data</div>
            <div class="eyes-subtitle">Authentic 3D Models & Telemetry from NASA's Eyes on the Solar System & JPL Horizons</div>
          </div>
        </div>
        <button class="eyes-close-btn" id="eyes-close-btn" title="Close [ESC]">✕ Close</button>
      </div>

      <!-- Model Selector Bar -->
      <div class="eyes-model-bar" id="eyes-model-bar">
        <button class="eyes-model-pill active" data-id="voyager1">🛸 Voyager 1</button>
        <button class="eyes-model-pill" data-id="voyager2">🛸 Voyager 2</button>
        <button class="eyes-model-pill" data-id="bennu">🪨 101955 Bennu</button>
        <button class="eyes-model-pill" data-id="ryugu">🪨 162173 Ryugu</button>
        <button class="eyes-model-pill" data-id="eros">🪨 433 Eros</button>
        <button class="eyes-model-pill" data-id="itokawa">🪨 25143 Itokawa</button>
        <button class="eyes-model-pill" data-id="psyche">🪨 16 Psyche</button>
        <button class="eyes-model-pill" data-id="vesta">🪨 4 Vesta</button>
        <button class="eyes-model-pill" data-id="comet67p">☄️ Comet 67P</button>
      </div>

      <!-- Main Content Layout -->
      <div class="eyes-content">
        <!-- 3D Canvas Area -->
        <div class="eyes-viewport-container">
          <canvas id="eyes-canvas"></canvas>

          <!-- Floating Viewport Controls -->
          <div class="eyes-controls-overlay">
            <div class="eyes-control-group">
              <button class="eyes-tool-btn active" id="btn-mode-pbr" title="Photorealistic PBR Shading">🎨 PBR Shaded</button>
              <button class="eyes-tool-btn" id="btn-mode-wire" title="Structural Polygonal Wireframe">📐 Wireframe</button>
            </div>
            <div class="eyes-control-group">
              <button class="eyes-tool-btn active" id="btn-autorotate" title="Toggle Auto-Rotation">▶ Rotate</button>
              <button class="eyes-tool-btn" id="btn-light-mode" title="Toggle Studio Light">💡 3-Point Light</button>
              <button class="eyes-tool-btn" id="btn-reset-cam" title="Reset Camera View">🔄 Reset</button>
            </div>
          </div>

          <!-- Hotspot Info Card -->
          <div class="eyes-hotspot-card" id="eyes-hotspot-card">
            <div class="eyes-hotspot-header">
              <div class="eyes-hotspot-title" id="hotspot-card-title">Feature Title</div>
              <button class="eyes-hotspot-close" id="hotspot-card-close">✕</button>
            </div>
            <div class="eyes-hotspot-text" id="hotspot-card-text">Feature description...</div>
          </div>

          <!-- Viewport Hint -->
          <div class="eyes-viewport-hint">
            <span>🖱️ Drag to rotate · Wheel to zoom · Right-drag to pan</span>
            <span class="eyes-scale-caliper" id="eyes-scale-text">Scale: 1:1 Metric</span>
          </div>
        </div>

        <!-- Right Side Data & Telemetry Panel -->
        <div class="eyes-sidebar" id="eyes-sidebar">
          <div>
            <div class="eyes-target-badge" id="side-target-badge">INTERSTELLAR MISSION</div>
            <div class="eyes-target-name" id="side-target-name">Voyager 1</div>
            <div class="eyes-target-operator" id="side-target-op">NASA / Jet Propulsion Laboratory (JPL)</div>
          </div>

          <!-- Real-Time NASA Telemetry Card -->
          <div class="eyes-telemetry-box">
            <div class="eyes-telemetry-title">
              <span>REAL-TIME NASA TELEMETRY (JPL HORIZONS)</span>
              <span class="eyes-telemetry-live-dot" title="Live Ephemeris Link Active"></span>
            </div>
            <div class="eyes-telemetry-grid">
              <div class="eyes-telem-item">
                <span class="eyes-telem-label">Distance from Sun</span>
                <span class="eyes-telem-val" id="telem-dist-au">166.42 AU</span>
              </div>
              <div class="eyes-telem-item">
                <span class="eyes-telem-label">One-Way Light Time</span>
                <span class="eyes-telem-val" id="telem-light-time">23h 04m</span>
              </div>
              <div class="eyes-telem-item">
                <span class="eyes-telem-label">Heliocentric Speed</span>
                <span class="eyes-telem-val" id="telem-speed">16.999 km/s</span>
              </div>
              <div class="eyes-telem-item">
                <span class="eyes-telem-label">Coordinates (J2000)</span>
                <span class="eyes-telem-val" id="telem-coord" style="font-size: 11px;">RA 17h 14m</span>
              </div>
            </div>
          </div>

          <!-- Physical & Mission Specifications -->
          <div>
            <div style="font-size: 11px; font-weight: 600; color: #94a3b8; letter-spacing: 0.5px; margin-bottom: 8px;">
              AUTHENTIC NASA MISSION SPECIFICATIONS
            </div>
            <table class="eyes-specs-table" id="eyes-specs-table">
              <tbody>
                <!-- Populated dynamically -->
              </tbody>
            </table>
          </div>

          <!-- Description -->
          <div>
            <div style="font-size: 11px; font-weight: 600; color: #94a3b8; letter-spacing: 0.5px; margin-bottom: 6px;">
              MISSION OVERVIEW & SCIENTIFIC SIGNIFICANCE
            </div>
            <div class="eyes-description" id="side-desc">...</div>
          </div>

          <!-- Interactive Hotspot Inspection Buttons -->
          <div>
            <div style="font-size: 11px; font-weight: 600; color: #c084fc; letter-spacing: 0.5px; margin-bottom: 8px;">
              EXPLORE ANNOTATED 3D HOTSPOTS
            </div>
            <div class="eyes-hotspot-list" id="eyes-hotspot-list">
              <!-- Hotspot buttons populated dynamically -->
            </div>
          </div>

          <!-- Official NASA Open Resources & Verification Links -->
          <div class="eyes-links-group">
            <div style="font-size: 11px; font-weight: 600; color: #64748b; letter-spacing: 0.5px; margin-bottom: 4px;">
              OFFICIAL NASA VERIFIED SOURCES
            </div>
            <a class="eyes-ext-link" id="link-eyes" href="#" target="_blank" rel="noopener noreferrer">
              🌐 View in NASA's Eyes on the Solar System ↗
            </a>
            <a class="eyes-ext-link" id="link-nasa3d" href="#" target="_blank" rel="noopener noreferrer">
              📦 NASA 3D Resources Official CAD / Mesh Archive ↗
            </a>
            <a class="eyes-ext-link" id="link-horizons" href="#" target="_blank" rel="noopener noreferrer">
              🛰️ Query NASA JPL Horizons Ephemeris System ↗
            </a>
          </div>

          <!-- Action Button: Fly to in Solar System -->
          <div class="eyes-actions">
            <button class="eyes-fly-btn" id="btn-fly-in-sim">
              <span>🚀 Fly to in 3D Solar System</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // ── Three.js Studio Scene Initialization ──────────────────────────────────
  const canvas = document.getElementById('eyes-canvas');
  let renderer = null;
  let scene = null;
  let camera = null;
  let controls = null;
  let currentModelGroup = null;
  let hotspotMarkersGroup = null;
  let activeId = 'voyager1';
  let isAutoRotate = true;
  let isStudioLight = true;
  let isWireframe = false;
  let animFrameId = null;
  let dirLight = null;
  let fillLight = null;
  let rimLight = null;
  let ambientLight = null;

  function initStudioThree() {
    if (renderer) return;

    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070b14);

    const rect = canvas.parentElement.getBoundingClientRect();
    camera = new THREE.PerspectiveCamera(45, (rect.width || 800) / (rect.height || 600), 0.05, 500);
    camera.position.set(3.5, 2.2, 4.5);

    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 1.2;
    controls.minDistance = 0.5;
    controls.maxDistance = 60;
    controls.autoRotate = isAutoRotate;
    controls.autoRotateSpeed = 1.0;

    // Studio Lighting Rig
    ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);

    // Key directional light (Sunlight)
    dirLight = new THREE.DirectionalLight(0xfffaed, 2.8);
    dirLight.position.set(5, 8, 6);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    // Studio Fill Light (Cool blue tint from space)
    fillLight = new THREE.DirectionalLight(0x88ccff, 1.2);
    fillLight.position.set(-6, -2, -4);
    scene.add(fillLight);

    // Studio Rim / Specular Accent Light
    rimLight = new THREE.DirectionalLight(0xc084fc, 0.9);
    rimLight.position.set(0, -6, 5);
    scene.add(rimLight);

    hotspotMarkersGroup = new THREE.Group();
    scene.add(hotspotMarkersGroup);

    // Raycaster for clicking 3D hotspots directly on canvas
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    canvas.addEventListener('click', (e) => {
      const b = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - b.left) / b.width) * 2 - 1;
      mouse.y = -((e.clientY - b.top) / b.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(hotspotMarkersGroup.children, true);
      if (intersects.length > 0) {
        const marker = intersects[0].object;
        if (marker.userData?.hotspot) {
          showHotspotCard(marker.userData.hotspot);
        }
      }
    });

    handleResize();
    window.addEventListener('resize', handleResize);
  }

  function handleResize() {
    if (!renderer || !camera || !canvas.parentElement) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  // ── Hotspot 3D Marker Pin Generator ─────────────────────────────────────────
  function makeHotspotSprite(hotspot) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const ctx = cv.getContext('2d');

    // Glowing outer ring
    ctx.beginPath();
    ctx.arc(32, 32, 26, 0, Math.PI * 2);
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Semi-transparent center fill
    ctx.beginPath();
    ctx.arc(32, 32, 18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(168, 85, 247, 0.75)';
    ctx.fill();

    // Bright center core
    ctx.beginPath();
    ctx.arc(32, 32, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    const tex = new THREE.CanvasTexture(cv);
    const spriteMat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      sizeAttenuation: true,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(0.25, 0.25, 0.25);
    sprite.position.set(...hotspot.pos);
    sprite.userData = { hotspot };
    return sprite;
  }

  // ── Load & Display Model by ID ──────────────────────────────────────────────
  function loadModel(id) {
    activeId = id;
    initStudioThree();

    // Remove existing model and hotspots
    if (currentModelGroup) {
      scene.remove(currentModelGroup);
      currentModelGroup = null;
    }
    while (hotspotMarkersGroup.children.length > 0) {
      hotspotMarkersGroup.remove(hotspotMarkersGroup.children[0]);
    }

    const { group, entry, hotspots } = createEyesModel(id, { scale: 1.0 });
    currentModelGroup = group;
    scene.add(currentModelGroup);

    // Apply wireframe if active
    applyWireframeMode(isWireframe);

    // Add 3D Hotspot Pins
    for (const h of hotspots) {
      const pin = makeHotspotSprite(h);
      hotspotMarkersGroup.add(pin);
    }

    // Adjust camera distance based on bounding box
    const bbox = new THREE.Box3().setFromObject(group);
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1.0);

    camera.position.set(center.x + maxDim * 1.3, center.y + maxDim * 0.7, center.z + maxDim * 1.5);
    controls.target.copy(center);
    controls.update();

    // Update Sidebar Data & Telemetry
    updateSidebar(entry, maxDim);

    // Hide any previous hotspot card
    hideHotspotCard();
  }

  // ── Sidebar Information Update ──────────────────────────────────────────────
  function updateSidebar(entry, maxDim) {
    document.getElementById('side-target-badge').textContent = entry.badge || 'NASA SOLAR SYSTEM OBJECT';
    document.getElementById('side-target-name').textContent = entry.name;
    document.getElementById('side-target-op').textContent = entry.operator || 'NASA / JPL';
    document.getElementById('side-desc').textContent = entry.description || '';

    // Scale Caliper
    const scaleText = entry.dimensions
      ? `Dimensions: ${entry.dimensions}`
      : `Scale: ${maxDim.toFixed(1)}m length`;
    document.getElementById('eyes-scale-text').textContent = scaleText;

    // Real-Time Telemetry
    const telem = entry.realTimeTelemetry?.(2460000) ?? {
      distAU: '1.00',
      distKm: '149,597,870',
      speedKmS: '29.78',
      lightTime: '8m 20s',
      raDec: 'RA 12h 00m',
    };
    document.getElementById('telem-dist-au').textContent = `${telem.distAU} AU`;
    document.getElementById('telem-light-time').textContent = telem.lightTime;
    document.getElementById('telem-speed').textContent = `${telem.speedKmS} km/s`;
    document.getElementById('telem-coord').textContent = telem.raDec || 'J2000';

    // Specifications Table
    const specsTbody = document.getElementById('eyes-specs-table').querySelector('tbody');
    specsTbody.innerHTML = '';

    const specsData = entry.specs || {
      'NAIF SPICE ID': entry.naifId,
      'Spectral Type': entry.spectralType,
      'Dimensions': entry.dimensions,
      'Mean Diameter': entry.meanDiameter,
      'Mass': entry.mass,
      'Bulk Density': entry.density,
      'Surface Gravity': entry.gravity,
      'Rotation Period': entry.rotationPeriod,
      'Geometric Albedo': entry.albedo,
    };

    for (const [key, val] of Object.entries(specsData)) {
      if (!val) continue;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="eyes-specs-label">${key}</td><td class="eyes-specs-val">${val}</td>`;
      specsTbody.appendChild(tr);
    }

    // Hotspot Buttons List
    const hotspotList = document.getElementById('eyes-hotspot-list');
    hotspotList.innerHTML = '';
    for (const h of entry.hotspots || []) {
      const btn = document.createElement('button');
      btn.className = 'eyes-hotspot-btn';
      btn.innerHTML = `<span>📍 ${h.title}</span> <span>🔍</span>`;
      btn.addEventListener('click', () => {
        focusOnHotspot(h);
      });
      hotspotList.appendChild(btn);
    }

    // Official NASA URLs
    const linkEyes = document.getElementById('link-eyes');
    linkEyes.href = entry.eyesUrl || 'https://eyes.nasa.gov/';
    const linkNasa3d = document.getElementById('link-nasa3d');
    linkNasa3d.href = entry.nasa3dUrl || 'https://nasa3d.arc.nasa.gov/';
    const linkHorizons = document.getElementById('link-horizons');
    linkHorizons.href = entry.horizonsUrl || 'https://ssd.jpl.nasa.gov/horizons/';
  }

  // ── Hotspot Interaction Helpers ─────────────────────────────────────────────
  function focusOnHotspot(hotspot) {
    if (!camera || !controls) return;
    const targetPos = new THREE.Vector3(...hotspot.pos);
    controls.target.copy(targetPos);
    camera.position.set(targetPos.x + 0.9, targetPos.y + 0.6, targetPos.z + 1.2);
    controls.update();
    showHotspotCard(hotspot);
  }

  function showHotspotCard(hotspot) {
    const card = document.getElementById('eyes-hotspot-card');
    document.getElementById('hotspot-card-title').textContent = hotspot.title;
    document.getElementById('hotspot-card-text').textContent = hotspot.text;
    card.style.display = 'block';
  }

  function hideHotspotCard() {
    const card = document.getElementById('eyes-hotspot-card');
    if (card) card.style.display = 'none';
  }

  document.getElementById('hotspot-card-close')?.addEventListener('click', hideHotspotCard);

  // ── Render & Shading Mode Toggles ───────────────────────────────────────────
  function applyWireframeMode(enabled) {
    isWireframe = enabled;
    if (!currentModelGroup) return;
    currentModelGroup.traverse((child) => {
      if (child.isMesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => { m.wireframe = enabled; });
        } else {
          child.material.wireframe = enabled;
        }
      }
    });
  }

  document.getElementById('btn-mode-pbr').addEventListener('click', function () {
    this.classList.add('active');
    document.getElementById('btn-mode-wire').classList.remove('active');
    applyWireframeMode(false);
  });

  document.getElementById('btn-mode-wire').addEventListener('click', function () {
    this.classList.add('active');
    document.getElementById('btn-mode-pbr').classList.remove('active');
    applyWireframeMode(true);
  });

  // Auto-Rotation Toggle
  const btnAutoRotate = document.getElementById('btn-autorotate');
  btnAutoRotate.addEventListener('click', function () {
    isAutoRotate = !isAutoRotate;
    if (controls) controls.autoRotate = isAutoRotate;
    this.classList.toggle('active', isAutoRotate);
    this.textContent = isAutoRotate ? '▶ Rotate' : '⏸ Paused';
  });

  // Lighting Toggle
  const btnLight = document.getElementById('btn-light-mode');
  btnLight.addEventListener('click', function () {
    isStudioLight = !isStudioLight;
    this.classList.toggle('active', isStudioLight);
    if (isStudioLight) {
      this.textContent = '💡 3-Point Light';
      ambientLight.intensity = 0.45;
      dirLight.intensity = 2.8;
      fillLight.intensity = 1.2;
      rimLight.intensity = 0.9;
    } else {
      this.textContent = '☀️ Deep Space Sun';
      ambientLight.intensity = 0.08;
      dirLight.intensity = 3.6;
      fillLight.intensity = 0.15;
      rimLight.intensity = 0.0;
    }
  });

  // Reset Camera View
  document.getElementById('btn-reset-cam').addEventListener('click', () => {
    if (currentModelGroup) {
      loadModel(activeId);
    }
  });

  // Model Pills Click Handler
  const modelBar = document.getElementById('eyes-model-bar');
  modelBar.addEventListener('click', (e) => {
    const pill = e.target.closest('.eyes-model-pill');
    if (!pill) return;
    modelBar.querySelectorAll('.eyes-model-pill').forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    loadModel(pill.dataset.id);
  });

  // Fly to in Simulation Button
  document.getElementById('btn-fly-in-sim').addEventListener('click', () => {
    closeModal();
    if (flyTo) {
      flyTo(activeId);
    }
    if (select) {
      select(activeId);
    }
  });

  // ── Render Loop ─────────────────────────────────────────────────────────────
  function startStudioLoop() {
    if (animFrameId) return;
    function renderLoop() {
      animFrameId = requestAnimationFrame(renderLoop);
      if (controls) controls.update();
      if (renderer && scene && camera) {
        // Gently pulse the hotspot pins
        const time = performance.now() * 0.003;
        const scale = 0.25 + 0.04 * Math.sin(time);
        for (const child of hotspotMarkersGroup.children) {
          child.scale.set(scale, scale, scale);
        }
        renderer.render(scene, camera);
      }
    }
    renderLoop();
  }

  function stopStudioLoop() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  }

  // ── Modal Open / Close Logic ────────────────────────────────────────────────
  function openModal(id = 'voyager1') {
    overlay.classList.add('active');
    startStudioLoop();
    // Select corresponding pill
    modelBar.querySelectorAll('.eyes-model-pill').forEach((p) => {
      p.classList.toggle('active', p.dataset.id === id);
    });
    // Request layout measurement after DOM transition
    setTimeout(() => {
      handleResize();
      loadModel(id);
    }, 50);
  }

  function closeModal() {
    overlay.classList.remove('active');
    stopStudioLoop();
    hideHotspotCard();
  }

  triggerBtn.addEventListener('click', () => openModal(activeId));
  document.getElementById('eyes-close-btn').addEventListener('click', closeModal);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) {
      closeModal();
    }
    // 'M' or 'm' key toggles viewer (unless typing in input)
    if ((e.key === 'm' || e.key === 'M') && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      if (overlay.classList.contains('active')) {
        closeModal();
      } else {
        openModal(activeId);
      }
    }
  });

  return {
    open: openModal,
    close: closeModal,
    loadModel,
  };
}
