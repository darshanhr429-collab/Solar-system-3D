// Issue #51: SEO Celestial Body Landing Pages Generator
// Generates static HTML pages for each celestial body at build time from src/astro/bodies.js.
// Includes OpenGraph/Twitter cards, descriptions, schema.org structured data.
// Links to app and preselects target body via location hash: #<bodyId>,<lat>,<lon>,<dist>.
//
// Usage:
//   node tools/generate-body-pages.mjs              # Generate into public/bodies/
//   node tools/generate-body-pages.mjs --out=dist/bodies  # Specify output directory
//   node tools/generate-body-pages.mjs --base=https://sw.icodestar.net  # Specify site URL

import { BODIES, MOON_PHYS, surfaceGravity, rotationPeriodHours } from '../src/astro/bodies.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- Parse command line arguments ----
const args = process.argv.slice(2);
const getArg = (key) => {
  const found = args.find((a) => a.startsWith(`--${key}=`));
  return found ? found.slice(key.length + 3) : null;
};

const SITE_BASE = getArg('base') || 'https://sw.icodestar.net';
const OUT_DIR = resolve(__dirname, '..', getArg('out') || 'public/bodies');

// ---- Celestial body type labels ----
const TYPE_LABEL = {
  star:   { en: 'Star' },
  rocky:  { en: 'Rocky Planet' },
  gas:    { en: 'Gas Giant' },
  ice:    { en: 'Ice Giant' },
  dwarf:  { en: 'Dwarf Planet' },
  moon:   { en: 'Moon' },
};

// ---- Parent body name mapping ----
const PARENT_NAME = {
  sun: { en: 'Sun' },
  earth: { en: 'Earth' },
  mars: { en: 'Mars' },
  jupiter: { en: 'Jupiter' },
  saturn: { en: 'Saturn' },
  uranus: { en: 'Uranus' },
  neptune: { en: 'Neptune' },
  pluto: { en: 'Pluto' },
};

// ---- Collect all celestial bodies (planets + moons) ----
function collectBodies() {
  const list = [];
  for (const b of Object.values(BODIES)) {
    list.push({ ...b, category: 'planet' });
  }
  for (const [id, m] of Object.entries(MOON_PHYS)) {
    list.push({ ...m, id, category: 'moon' });
  }
  return list;
}

// ---- Generate app link with pre-selected body (location hash) ----
function appLink(body) {
  const dist = Math.round(body.radiusKm * 3);
  return `${SITE_BASE}/#${body.id},0,0,${dist}`;
}

// ---- HTML Escape ----
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---- Generate English description ----
function generateEnglishDesc(body, typeLabel, parent, gravity, rotHours) {
  const parts = [];
  parts.push(`${body.nameEn} is a ${typeLabel.en.toLowerCase()}`);
  if (parent) parts.push(`orbiting ${parent.en}`);
  parts.push(`with a radius of ${body.radiusKm.toLocaleString()} km`);
  parts.push(`and surface gravity of ${gravity} m/s².`);
  if (rotHours != null) {
    parts.push(`Its rotation period is ${Math.abs(rotHours).toFixed(1)} hours${rotHours < 0 ? ' (retrograde)' : ''}.`);
  }
  parts.push(body.landable
    ? `You can land on and walk on ${body.nameEn} in Solar Wanderer.`
    : `${body.nameEn} is a gas/ice giant — you can fly through its atmosphere but cannot land.`);
  parts.push(`Explore ${body.nameEn} in real-time 1:1 scale at Solar Wanderer.`);
  return parts.join(' ');
}

// ---- Generate single body page ----
function generateBodyPage(body) {
  const typeLabel = TYPE_LABEL[body.type] || TYPE_LABEL.moon;
  const parent = body.parent ? PARENT_NAME[body.parent] : null;
  const gravity = surfaceGravity(body).toFixed(2);
  const rotHours = rotationPeriodHours(body.id);
  const pageUrl = `${SITE_BASE}/bodies/${body.id}.html`;
  const appUrl = appLink(body);
  const previewImg = `${SITE_BASE}/preview.png`;

  const titleEn = `${body.nameEn} — 1:1 Real Solar System Explorer | Solar Wanderer`;
  const enDesc = generateEnglishDesc(body, typeLabel, parent, gravity, rotHours);

  // schema.org structured data
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Thing',
    name: body.nameEn,
    description: enDesc,
    url: pageUrl,
    image: previewImg,
    mainEntityOfPage: pageUrl,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'type', value: typeLabel.en },
      { '@type': 'PropertyValue', name: 'radiusKm', value: body.radiusKm },
      { '@type': 'PropertyValue', name: 'surfaceGravity', value: `${gravity} m/s²` },
      ...(parent ? [{ '@type': 'PropertyValue', name: 'parentBody', value: parent.en }] : []),
      ...(rotHours != null ? [{ '@type': 'PropertyValue', name: 'rotationPeriodHours', value: rotHours }] : []),
      { '@type': 'PropertyValue', name: 'landable', value: body.landable ? 'Yes' : 'No' },
    ],
    isPartOf: {
      '@type': 'WebApplication',
      name: 'Solar Wanderer',
      url: SITE_BASE,
    },
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(titleEn)}</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='7' fill='%23ffcc55'/><circle cx='26' cy='16' r='2' fill='%234a90d9'/></svg>" />

  <!-- Primary Meta Tags -->
  <meta name="title" content="${esc(titleEn)}" />
  <meta name="description" content="${esc(enDesc)}" />
  <meta name="keywords" content="${esc(body.nameEn)}, ${esc(typeLabel.en)}, solar system, ${esc(body.nameEn)} facts, ${esc(body.nameEn)} exploration, Solar Wanderer, NASA, JPL, astronomy" />
  <meta name="robots" content="index, follow" />
  <meta name="theme-color" content="#05070f" />
  <link rel="canonical" href="${esc(pageUrl)}" />

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${esc(pageUrl)}" />
  <meta property="og:title" content="${esc(titleEn)}" />
  <meta property="og:description" content="${esc(enDesc)}" />
  <meta property="og:image" content="${esc(previewImg)}" />
  <meta property="og:image:width" content="1280" />
  <meta property="og:image:height" content="720" />
  <meta property="og:site_name" content="Solar Wanderer" />
  <meta property="og:locale" content="en_US" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="${esc(pageUrl)}" />
  <meta name="twitter:title" content="${esc(titleEn)}" />
  <meta name="twitter:description" content="${esc(enDesc)}" />
  <meta name="twitter:image" content="${esc(previewImg)}" />

  <!-- Structured Data: schema.org -->
  <script type="application/ld+json">
  ${JSON.stringify(schema, null, 2)}
  </script>
  <script type="application/ld+json">
  ${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Solar Wanderer', item: `${SITE_BASE}/` },
      { '@type': 'ListItem', position: 2, name: 'Bodies Directory', item: `${SITE_BASE}/bodies/` },
      { '@type': 'ListItem', position: 3, name: body.nameEn, item: pageUrl },
    ],
  }, null, 2)}
  </script>

  <style>
    :root {
      --bg: #05070f;
      --bg-card: #0c1020;
      --text: #e8ecf5;
      --text-dim: #8b93a8;
      --accent: #4a9eff;
      --accent-warm: #ffcc55;
      --border: #1e2540;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.7;
      min-height: 100vh;
      padding: 2rem 1rem 4rem;
    }
    .container { max-width: 820px; margin: 0 auto; }
    .back-link { color: var(--accent); text-decoration: none; font-size: 0.9rem; display: inline-block; margin-bottom: 1.5rem; }
    .back-link:hover { text-decoration: underline; }
    .header { margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--border); }
    .header .type-badge {
      display: inline-block; background: rgba(74,158,255,0.12); color: var(--accent);
      padding: 0.2rem 0.8rem; border-radius: 999px; font-size: 0.8rem; font-weight: 600;
      margin-bottom: 0.75rem;
    }
    .header h1 { font-size: 2rem; margin-bottom: 0.25rem; }
    .header .desc { color: var(--text); font-size: 1.05rem; margin-top: 0.75rem; }
    .cta {
      display: inline-block; background: var(--accent); color: #fff;
      padding: 0.8rem 1.8rem; border-radius: 8px; text-decoration: none;
      font-weight: 600; font-size: 1.05rem; margin: 1.5rem 0;
      transition: background 0.2s;
    }
    .cta:hover { background: #3a8eef; }
    .cta .arrow { margin-left: 0.5rem; }
    .card {
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 12px; padding: 1.5rem 1.75rem; margin-bottom: 1.25rem;
    }
    .card h2 { font-size: 1.15rem; color: var(--accent); margin-bottom: 0.75rem; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; }
    .stat { background: rgba(255,255,255,0.03); padding: 0.75rem 1rem; border-radius: 8px; }
    .stat .label { color: var(--text-dim); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat .value { color: var(--text); font-size: 1.1rem; font-weight: 600; margin-top: 0.2rem; }
    .footer { text-align: center; margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border); color: var(--text-dim); font-size: 0.85rem; }
    .footer a { color: var(--text-dim); }
    .related { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
    .related a {
      display: inline-block; background: rgba(255,255,255,0.05); color: var(--accent);
      padding: 0.3rem 0.8rem; border-radius: 6px; text-decoration: none; font-size: 0.85rem;
    }
    .related a:hover { background: rgba(74,158,255,0.15); }
    @media (max-width: 600px) {
      body { padding: 1rem 0.75rem 3rem; }
      .header h1 { font-size: 1.5rem; }
      .stats { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <a href="../" class="back-link">← Back to Solar Wanderer</a>

    <div class="header">
      <span class="type-badge">${esc(typeLabel.en)}${parent ? ` · Moon of ${esc(parent.en)}` : ''}</span>
      <h1>${esc(body.nameEn)}</h1>
      <p class="desc">${esc(body.desc)}</p>
    </div>

    <a href="${esc(appUrl)}" class="cta">
      🚀 Explore ${esc(body.nameEn)} in Solar Wanderer <span class="arrow">→</span>
    </a>

    <div class="card">
      <h2>📊 Physical Data</h2>
      <div class="stats">
        <div class="stat">
          <div class="label">Radius</div>
          <div class="value">${body.radiusKm.toLocaleString()} km</div>
        </div>
        <div class="stat">
          <div class="label">Surface Gravity</div>
          <div class="value">${gravity} m/s²</div>
        </div>
        ${rotHours != null ? `<div class="stat">
          <div class="label">Rotation Period</div>
          <div class="value">${Math.abs(rotHours).toFixed(1)} h${rotHours < 0 ? ' (retrograde)' : ''}</div>
        </div>` : ''}
        <div class="stat">
          <div class="label">Type</div>
          <div class="value">${esc(typeLabel.en)}</div>
        </div>
        ${parent ? `<div class="stat">
          <div class="label">Orbits</div>
          <div class="value">${esc(parent.en)}</div>
        </div>` : ''}
        <div class="stat">
          <div class="label">Landable</div>
          <div class="value">${body.landable ? '✅ Yes' : '❌ No'}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>🛰️ About ${esc(body.nameEn)}</h2>
      <p>${esc(body.desc)}</p>
      <p style="margin-top:0.75rem; color: var(--text-dim);">${esc(enDesc)}</p>
    </div>

    <div class="card">
      <h2>🎮 How to Explore</h2>
      <p>Click the button above to open Solar Wanderer — the app will automatically fly to ${esc(body.nameEn)}.</p>
      <ul style="margin-top:0.75rem; padding-left: 1.5rem; color: var(--text-dim); font-size: 0.9rem;">
        <li>Scroll to land on surface (landable bodies only)</li>
        <li>Press G to enter walking mode</li>
        <li>Press F for free flight mode</li>
        <li>Press [ / ] to adjust time speed</li>
      </ul>
    </div>

    <div class="card">
      <h2>🔗 Related Bodies</h2>
      <div class="related" id="related"></div>
    </div>

    <div class="footer">
      <p>Solar Wanderer — <a href="${esc(SITE_BASE)}">${esc(SITE_BASE.replace('https://',''))}</a></p>
      <p style="margin-top:0.5rem">Based on NASA JPL Ephemeris · Open Source · <a href="https://github.com/hyqzz/Solar-Wanderer" target="_blank" rel="noopener">GitHub</a></p>
    </div>
  </div>

  <script>
    (function() {
      var related = document.getElementById('related');
      var links = ${JSON.stringify(getRelatedLinks(body))};
      links.forEach(function(l) {
        var a = document.createElement('a');
        a.href = l.url;
        a.textContent = l.name;
        related.appendChild(a);
      });
    })();
  </script>
</body>
</html>`;
}

// ---- Get related body links ----
function getRelatedLinks(body) {
  const all = collectBodies();
  const links = [];
  if (body.parent) {
    for (const b of all) {
      if (b.id !== body.id && b.parent === body.parent) {
        links.push({ url: `./${b.id}.html`, name: b.nameEn });
      }
    }
  }
  if (body.parent && BODIES[body.parent]) {
    const p = BODIES[body.parent];
    links.unshift({ url: `./${p.id}.html`, name: p.nameEn });
  }
  if (body.category === 'planet' && body.id !== 'sun') {
    links.unshift({ url: './sun.html', name: 'Sun' });
  }
  const sameType = all.filter((b) => b.id !== body.id && b.type === body.type && !links.find((l) => l.url.includes(`/${b.id}.html`)));
  for (const b of sameType.slice(0, 5)) {
    links.push({ url: `./${b.id}.html`, name: b.nameEn });
  }
  return links.slice(0, 10);
}

// ---- Generate index page ----
function generateIndexPage(bodies) {
  const pageUrl = `${SITE_BASE}/bodies/`;
  const planets = bodies.filter((b) => b.category === 'planet');
  const moons = bodies.filter((b) => b.category === 'moon');

  const bodyCard = (b) => {
    const typeLabel = TYPE_LABEL[b.type] || TYPE_LABEL.moon;
    return `<a href="./${b.id}.html" class="body-card">
      <span class="body-name">${esc(b.nameEn)}</span>
      <span class="body-type">${esc(typeLabel.en)}</span>
    </a>`;
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Solar System Bodies Directory — 1:1 Real Solar System Explorer | Solar Wanderer</title>
  <meta name="description" content="Explore every celestial body in the Solar System: the Sun, eight planets, dwarf planets, and moons. Based on NASA JPL ephemeris at 1:1 real scale." />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${esc(pageUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${esc(pageUrl)}" />
  <meta property="og:title" content="Solar System Bodies Directory — Solar Wanderer" />
  <meta property="og:description" content="Explore every celestial body in the Solar System: the Sun, eight planets, dwarf planets, and moons." />
  <meta property="og:image" content="${SITE_BASE}/preview.png" />
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='7' fill='%23ffcc55'/><circle cx='26' cy='16' r='2' fill='%234a90d9'/></svg>" />
  <style>
    :root { --bg:#05070f; --bg-card:#0c1020; --text:#e8ecf5; --text-dim:#8b93a8; --accent:#4a9eff; --border:#1e2540; }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; line-height:1.7; padding:2rem 1rem 4rem; }
    .container { max-width:960px; margin:0 auto; }
    .back-link { color:var(--accent); text-decoration:none; font-size:0.9rem; display:inline-block; margin-bottom:1.5rem; }
    h1 { font-size:1.8rem; margin-bottom:0.5rem; }
    .subtitle { color:var(--text-dim); margin-bottom:2rem; }
    h2 { font-size:1.2rem; color:var(--accent); margin:2rem 0 1rem; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:0.75rem; }
    .body-card { display:flex; flex-direction:column; gap:0.15rem; background:var(--bg-card); border:1px solid var(--border); border-radius:10px; padding:1rem; text-decoration:none; transition:border-color 0.2s; }
    .body-card:hover { border-color:var(--accent); }
    .body-name { color:var(--text); font-size:1.05rem; font-weight:600; }
    .body-type { color:var(--accent); font-size:0.75rem; margin-top:0.25rem; }
    .footer { text-align:center; margin-top:2rem; padding-top:1.5rem; border-top:1px solid var(--border); color:var(--text-dim); font-size:0.85rem; }
    .footer a { color:var(--text-dim); }
    @media (max-width:600px) { .grid { grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); } }
  </style>
</head>
<body>
  <div class="container">
    <a href="../" class="back-link">← Back to Solar Wanderer</a>
    <h1>🪐 Solar System Bodies Directory</h1>
    <p class="subtitle">Directory of ${bodies.length} celestial bodies · Based on NASA JPL ephemeris</p>

    <h2>☀️ Stars &amp; Planets</h2>
    <div class="grid">
      ${planets.map(bodyCard).join('\n      ')}
    </div>

    <h2>🌙 Moons</h2>
    <div class="grid">
      ${moons.map(bodyCard).join('\n      ')}
    </div>

    <div class="footer">
      <p>Solar Wanderer — <a href="${esc(SITE_BASE)}">${esc(SITE_BASE.replace('https://',''))}</a></p>
      <p style="margin-top:0.5rem">Based on NASA JPL Ephemeris · Open Source · <a href="https://github.com/hyqzz/Solar-Wanderer" target="_blank" rel="noopener">GitHub</a></p>
    </div>
  </div>
</body>
</html>`;
}

// ---- Generate complete sitemap.xml ----
function generateSitemap(bodies) {
  const today = new Date().toISOString().slice(0, 10);
  const entry = (loc, { changefreq = 'monthly', priority = '0.8' } = {}) => {
    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
  };

  const urls = [
    entry(`${SITE_BASE}/`, { changefreq: 'weekly', priority: '1.0' }),
    entry(`${SITE_BASE}/en/`, { changefreq: 'weekly', priority: '0.9' }),
    entry(`${SITE_BASE}/bodies/`, { changefreq: 'monthly', priority: '0.9' }),
    ...bodies.map((b) => entry(`${SITE_BASE}/bodies/${b.id}.html`)),
    entry(`${SITE_BASE}/privacy-policy.html`, { changefreq: 'yearly', priority: '0.3' }),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}

// ---- Main ----
function main() {
  const bodies = collectBodies();
  console.log(`[generate-body-pages] Collected ${bodies.length} bodies`);

  if (bodies.length < 30) {
    console.error(`[generate-body-pages] Error: body count ${bodies.length} is less than required 30`);
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  let count = 0;
  for (const body of bodies) {
    const html = generateBodyPage(body);
    const outPath = resolve(OUT_DIR, `${body.id}.html`);
    writeFileSync(outPath, html, 'utf8');
    count++;
  }
  console.log(`  ✅ Generated ${count} body pages`);

  const indexHtml = generateIndexPage(bodies);
  writeFileSync(resolve(OUT_DIR, 'index.html'), indexHtml, 'utf8');
  console.log(`  ✅ index.html — Bodies directory`);

  const sitemapXml = generateSitemap(bodies);
  writeFileSync(resolve(OUT_DIR, '..', 'sitemap.xml'), sitemapXml, 'utf8');
  console.log(`  ✅ sitemap.xml — Site map (${bodies.length + 4} URLs)`);

  console.log(`\n[generate-body-pages] Completed: ${count} body pages + 1 index + sitemap.xml`);
}

main();
