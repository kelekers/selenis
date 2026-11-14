// Browser QA for the 3D Sun/Earth display in the local terrain view, for every site of the dataset:
//   - "Besar" (default): big Sun/Earth (USDZ models, sized exactly) on the data directions beyond
//     the tile, Earth line only,
//     sizes true or uniformly enlarged, Earth lit by the scene Sun light, labels = panorama flags,
//     "Lihat Bumi / Lihat Matahari" camera shortcuts;
//   - "Kecil": small icons at the end of the marker lines, tracks, horizon ring = mask;
//   - sky compass (both modes), layer switches, legend, collapse; phone layout (390×844).
// Needs a running app (npm run dev or npm run preview) and Chrome or Edge; no npm dependency (CDP).
// Not part of `npm test` (needs a browser and a server).
// Usage: node scripts/qa/sky-sync.mjs [appUrl=http://127.0.0.1:5173/] [screenshotDir]
//   CHROME_PATH=... overrides the browser. Exit code 1 when a check fails.
//   SKY_EPHEMERIS_FILE=candidate.json serves that file as /data/ephemeris_vectors.json (and uses
//   it for the expected values) — e.g. to test new Earth-orientation fields before publishing.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.SELENIS_ROOT ?? path.resolve(here, '../..');
const appUrl = new URL(process.argv[2] ?? 'http://127.0.0.1:5173/');
appUrl.searchParams.set('debug', '1');
const outDir = process.argv[3] ?? path.join(os.tmpdir(), 'selenis-sky-qa');
await mkdir(outDir, { recursive: true });

const imp = (p) => import(pathToFileURL(path.join(root, p)).href);
const { evaluateLineOfSight, normalizeAzimuth, azElToUnitVector } = await imp('src/utils/shadowMath.js');
const { northOffsetForSite, vectorInGrid } = await imp('src/utils/sceneFrame.js');
const sky = await imp('src/utils/skyPlacement.js');
const { visibilityLabel } = await imp('src/utils/hudModel.js');
const { skyLineStyle } = await imp('src/utils/markerLayout.js');
const orient = await imp('src/utils/earthOrientation.js');
const readJson = async (p) => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const manifest = await readJson('public/data/manifest.json');
if (manifest.status !== 'ready') {
  console.log('SKIP  dataset is not "ready" (scaffold) — nothing to compare');
  process.exit(0);
}
const tel = await readJson('public/data/site_telemetry.json');
const ephOverride = process.env.SKY_EPHEMERIS_FILE ? await readFile(process.env.SKY_EPHEMERIS_FILE, 'utf8') : null;
const eph = ephOverride ? JSON.parse(ephOverride) : await readJson('public/data/ephemeris_vectors.json');
const W = tel.terrain_metadata.area_width_km;
const D = tel.terrain_metadata.area_height_km;

// ---------- browser (CDP) ----------
const browserPath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => p && existsSync(p));
if (!browserPath) throw new Error('Chrome/Edge not found; set CHROME_PATH');
const port = 9400 + Math.floor(Math.random() * 400);
const browser = spawn(browserPath, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(outDir, 'profile')}`,
  '--ignore-gpu-blocklist', '--window-size=1440,900', '--no-first-run', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 80 && !target; i += 1) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { await sleep(250); }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
const problems = [];
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') problems.push('EXC ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).split('\n')[0]);
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) problems.push(`${m.params.type.toUpperCase()} ` + m.params.args.map((a) => a.value ?? a.description).join(' ').split('\n')[0]);
  if (m.method === 'Fetch.requestPaused') {
    send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(ephOverride).toString('base64') }).catch(() => {});
    return;
  }
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) problems.push(`HTTP ${m.params.response.status} ${new URL(m.params.response.url).pathname}`);
});
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const waitFor = async (expr, ms = 60000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await evaluate(expr).catch(() => false)) return true; await sleep(200); } return false; };
const shot = async (name) => { const { data } = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(outDir, name), Buffer.from(data, 'base64')); };
const results = [];
const ok = (c, name, detail = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const dirAzEl = (from, to) => {
  const [x, y, z] = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  return { az: normalizeAzimuth((Math.atan2(x, -z) * 180) / Math.PI), el: (Math.atan2(y, Math.hypot(x, z)) * 180) / Math.PI };
};

await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
if (ephOverride) await send('Fetch.enable', { patterns: [{ urlPattern: '*/data/ephemeris_vectors.json' }] });
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: appUrl.href });
const ids = tel.sites.map((s) => s.site_id);
ok(await waitFor(`(() => { const s = window.__SELENIS_SCENE__; return !!(s && s.getObjectByName('lunar-south-pole-terrain') && ${JSON.stringify(ids)}.every((id) => s.getObjectByName('site-marker-' + id)) && document.querySelector('[data-testid=data-mode-badge]')?.textContent.includes('DATA TIM')); })()`), 'app ready with team data, terrain and every site marker');
ok(await waitFor(`!!(window.__SELENIS_SCENE__.getObjectByName('big-earth-model') && window.__SELENIS_SCENE__.getObjectByName('big-sun-model'))`, 30000), 'USDZ models of the Earth and the Sun loaded');
await sleep(500);

// ---------- page probe ----------
const readState = `(() => {
  const s = window.__SELENIS_SCENE__, cam = window.__SELENIS_CAMERA__;
  const world = (o, x, y, z) => { o.updateWorldMatrix(true, false); return o.localToWorld(o.position.clone().set(x, y, z)).toArray(); };
  const line = (name) => { const l = s.getObjectByName(name); if (!l) return null; const g = l.geometry, a = g.attributes.instanceStart, b = g.attributes.instanceEnd;
    return { start: world(l, a.getX(0), a.getY(0), a.getZ(0)), end: world(l, b.getX(0), b.getY(0), b.getZ(0)), color: l.material.color.getHexString(), dashed: 'USE_DASH' in l.material.defines }; };
  const obj = (name) => { const o = s.getObjectByName(name); if (!o) return null; o.updateWorldMatrix(true, false);
    const p = o.getWorldPosition(o.position.clone()); const cs = p.clone().applyMatrix4(cam.matrixWorldInverse); const n = p.clone().project(cam);
    return { pos: p.toArray(), radius: o.userData?.radiusKm ?? o.geometry?.parameters?.radius ?? null, model: !!o.getObjectByName(name + '-model'), color: o.material?.color?.getHexString?.() ?? null, opacity: o.material?.opacity ?? null,
      depthTest: o.material?.depthTest ?? null, onScreen: cs.z < 0 && Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1 }; };
  let light = null; s.traverse((o) => { if (o.isDirectionalLight) light = o.position.clone().sub(o.target.position).normalize().toArray(); });
  const tracks = {}; s.traverse((o) => { const m = /^sky-track-(sun|earth)-(past|future)-([0-9]+)$/.exec(o.name); if (!m) return;
    const g = o.geometry, a = g.attributes.instanceStart, b = g.attributes.instanceEnd, n = a.count;
    (tracks[m[1] + '-' + m[2]] ??= []).push({ points: n + 1, first: world(o, a.getX(0), a.getY(0), a.getZ(0)), last: world(o, b.getX(n - 1), b.getY(n - 1), b.getZ(n - 1)) }); });
  const ringObj = s.getObjectByName('sky-horizon-ring'); let ring = null;
  if (ringObj) { const g = ringObj.geometry, a = g.attributes.instanceStart, b = g.attributes.instanceEnd, n = a.count; ring = [];
    for (let i = 0; i < n; i += 1) ring.push(world(ringObj, a.getX(i), a.getY(i), a.getZ(i))); ring.push(world(ringObj, b.getX(n - 1), b.getY(n - 1), b.getZ(n - 1))); }
  const text = (id) => document.querySelector('[data-testid=' + id + ']')?.textContent.trim() ?? null;
  const sec = [...document.querySelectorAll('section')].find((x) => x.textContent.includes('360° Lander POV Horizon'));
  const svg = sec?.querySelector('svg[viewBox="0 0 360 100"]');
  const dot = (r) => { const c = svg && [...svg.querySelectorAll('g[transform] > circle')].find((k) => k.getAttribute('r') === r); if (!c) return null; const m = c.parentNode.getAttribute('transform').match(/translate\\(([-0-9.]+),\\s*([-0-9.]+)\\)/); return { x: +m[1], y: +m[2] }; };
  const fwd = cam.getWorldDirection(cam.position.clone());
  const comp = document.querySelector('[data-testid=sky-compass]');
  const cxy = (id) => { const c = comp?.querySelector('[data-testid=' + id + ']'); return c ? [+c.getAttribute('cx'), +c.getAttribute('cy')] : null; };
  const pressed = (id) => document.querySelector('[data-testid=' + id + ']')?.getAttribute('aria-pressed') ?? null;
  return {
    mode: pressed('sky-mode-big') === 'true' ? 'big' : 'small', size: pressed('size-true') === 'true' ? 'true' : 'enlarged',
    sunLine: line('sun-direction'), earthLine: line('earth-direction'), light,
    bigSun: obj('big-sun'), bigEarth: obj('big-earth'), sunIcon: obj('sky-sun-sprite'), earthIcon: obj('sky-earth-sprite'),
    labels: { bigSun: text('big-sun-label'), bigEarth: text('big-earth-label'), bigEarthDetail: text('big-earth-label-detail'), bigSunDetail: text('big-sun-label-detail'),
      sun: text('sky-sun-label'), earth: text('sky-earth-label'), earthDetail: text('sky-earth-label-detail') },
    pan: { sun: dot('3.2'), earth: dot('2.8'), sunText: text('sun-visibility'), earthText: text('earth-visibility') },
    tracks, ring, horizonBand: !!s.getObjectByName('sky-horizon-band'),
    camHeadingGrid: ((Math.atan2(fwd.x, -fwd.z) * 180 / Math.PI) % 360 + 360) % 360,
    cam: cam.position.toArray(),
    compass: comp ? { size: +comp.querySelector('svg').getAttribute('width'), rot: comp.querySelector('svg g')?.getAttribute('transform') ?? null, sun: cxy('sky-compass-sun'), earth: cxy('sky-compass-earth'),
      sunHint: text('sky-compass-sun-hint'), earthHint: text('sky-compass-earth-hint') } : null,
    legend: text('sky-legend'), body: !!document.getElementById('sky-controls-body'),
    earthQ: (() => { const g = s.getObjectByName('big-earth-orientation'); return g ? g.getWorldQuaternion(g.quaternion.clone()).toArray() : null; })(),
    notesMore: [...document.querySelectorAll('[data-testid=sky-note-more]')].map((n) => n.textContent).join(' '),
    skyNote: [...document.querySelectorAll('[data-testid=sky-note]')].map((n) => n.textContent).join(' '),
    utc: text('active-utc'), slider: document.querySelector('input[type=range]')?.value,
  };
})()`;
const setIndex = (i) => evaluate(`(() => { const el = document.querySelector('input[type=range]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '${i}'); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()`);
const selectSite = (name) => evaluate(`(() => { const b = [...document.querySelectorAll('button[aria-pressed]')].find((x) => x.querySelector('[title]')?.getAttribute('title') === ${JSON.stringify(name)}); if (!b) return false; b.click(); return true; })()`);
const clickTestId = (id) => evaluate(`(() => { const b = document.querySelector('[data-testid=${id}]'); if (!b) return false; b.click(); return true; })()`);
const clickButton = (label) => evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().includes(${JSON.stringify(label)})); if (!b) return false; b.click(); return true; })()`);

// ---------- checks ----------
function checkPanorama(st, pt, vis, kind) {
  // Panorama dot = data; panorama status text = data flag.
  const bad = [];
  const local = pt[`${kind}_vector`];
  const state = kind === 'sun' ? vis.is_sun_visible : vis.is_dte_active;
  if (!st.pan[kind] || Math.abs(st.pan[kind].x - normalizeAzimuth(local.azimuth_deg)) > 0.01) bad.push(`${kind}:panorama-dot`);
  if (st.pan[`${kind}Text`] !== visibilityLabel(kind, state).text) bad.push(`${kind}:panorama-status`);
  return bad;
}

function checkBig(st, pt, offset, vis) {
  const bad = [];
  const center = st.earthLine?.start;
  if (!center) return ['big:earth-line-missing'];
  if (st.sunLine) bad.push('big:sun-line-should-be-hidden');
  const dists = { earth: sky.bigBodyDistanceKm('earth', W, D), sun: sky.bigBodyDistanceKm('sun', W, D) };
  for (const kind of ['earth', 'sun']) {
    const body = kind === 'earth' ? st.bigEarth : st.bigSun;
    const local = pt[`${kind}_vector`];
    const state = kind === 'sun' ? vis.is_sun_visible : vis.is_dte_active;
    if (!body) { bad.push(`big:${kind}-missing`); continue; }
    if (!body.model) bad.push(`big:${kind}-model-not-shown`);
    const d = dirAzEl(center, body.pos);
    if (angDiff(d.az - offset, normalizeAzimuth(local.azimuth_deg)) > 0.01 || Math.abs(d.el - local.elevation_deg) > 0.01) bad.push(`big:${kind}-direction`);
    if (Math.abs(dist(center, body.pos) - dists[kind]) > 1e-6) bad.push(`big:${kind}-distance`);
    if (Math.abs(body.radius - sky.bigBodyRadiusKm(kind, dists[kind], st.size)) > 1e-9) bad.push(`big:${kind}-radius`);
    const label = kind === 'earth' ? st.labels.bigEarth : st.labels.bigSun;
    if (label !== sky.skyObjectLabel(kind, local, state)) bad.push(`big:${kind}-label`);
    bad.push(...checkPanorama(st, pt, vis, kind));
  }
  if (st.bigEarth && dist(st.earthLine.end, st.bigEarth.pos) > 1e-6) bad.push('big:earth-line-end');
  if (`#${st.earthLine.color}` !== skyLineStyle('earth', vis.is_dte_active).color) bad.push('big:earth-line-colour');
  // The Earth's phase comes from the same Sun light as the terrain: light direction = Sun data direction.
  const g = vectorInGrid(pt.sun_vector, offset);
  const sunDir = azElToUnitVector(g.azimuth_deg, g.elevation_deg);
  if (!st.light || (Math.acos(Math.min(1, st.light.reduce((s, v, i) => s + v * sunDir[i], 0))) * 180) / Math.PI > 1e-3) bad.push('big:light-direction');
  const ph = sky.earthPhase(pt.sun_vector, pt.earth_vector);
  if (st.labels.bigEarthDetail !== `${Math.round(ph.illuminatedFraction * 100)}% terang` || st.labels.bigSunDetail !== null) bad.push('big:label-detail');
  bad.push(...checkEarthOrientation(st, pt, offset));
  const sizeText = st.size === 'true' ? 'Arah dan ukuran sudut nyata' : 'Arah dari data, ukuran dan jarak tidak berskala';
  if (!st.skyNote.includes(sizeText)) bad.push('big:size-note');
  return bad;
}

// Earth model pose: with orientation fields, model +Y = Earth's axis and the sub-observer point
// faces the site; without them, the default pose and the "ilustratif" note.
const rotate = ([x, y, z, w], v) => {
  const [vx, vy, vz] = v;
  const ix = w * vx + y * vz - z * vy, iy = w * vy + z * vx - x * vz, iz = w * vz + x * vy - y * vx, iw = -x * vx - y * vy - z * vz;
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
};
const angleDeg = (a, b) => (Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b))))) * 180) / Math.PI;
function checkEarthOrientation(st, pt, offset) {
  const site = tel.sites.find((x) => eph.timelines_by_site[x.site_id].includes(pt));
  const axes = orient.earthAxesScene(pt.earth_vector, site.coordinates.latitude_deg, offset);
  if (!st.earthQ) return ['orientation:group-missing'];
  if (!axes) {
    const identity = Math.abs(st.earthQ[3]) > 1 - 1e-9;
    return [...(identity ? [] : ['orientation:should-be-default']), ...(st.notesMore.includes('ilustratif') ? [] : ['orientation:note'])];
  }
  const bad = [];
  if (angleDeg(rotate(st.earthQ, [0, 1, 0]), axes.z) > 0.01) bad.push('orientation:axis');
  const lat = (pt.earth_vector.sub_observer_lat_deg * Math.PI) / 180;
  const lon = (pt.earth_vector.sub_observer_lon_deg * Math.PI) / 180;
  const B = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  const facing = rotate(st.earthQ, [-B[1], B[2], -B[0]]); // body → NASA model axes (earthModelBasis)
  const g = vectorInGrid(pt.earth_vector, offset);
  const toSite = azElToUnitVector(g.azimuth_deg, g.elevation_deg).map((v) => -v);
  if (angleDeg(facing, toSite) > 0.01) bad.push('orientation:sub-observer-facing');
  if (!st.notesMore.includes('dari data Horizons')) bad.push('orientation:note');
  return bad;
}

function checkSmall(st, pt, offset, vis, total, idx) {
  const bad = [];
  for (const kind of ['sun', 'earth']) {
    const local = pt[`${kind}_vector`];
    const state = kind === 'sun' ? vis.is_sun_visible : vis.is_dte_active;
    const icon = kind === 'sun' ? st.sunIcon : st.earthIcon;
    const line = kind === 'sun' ? st.sunLine : st.earthLine;
    if (!icon || !line) { bad.push(`small:${kind}-missing`); continue; }
    if (dist(icon.pos, line.end) > 1e-6) bad.push(`small:${kind}-icon≠line-end`);
    const d = dirAzEl(line.start, icon.pos);
    if (angDiff(d.az - offset, normalizeAzimuth(local.azimuth_deg)) > 0.01 || Math.abs(d.el - local.elevation_deg) > 0.01) bad.push(`small:${kind}-direction`);
    if (icon.depthTest !== false) bad.push(`small:${kind}-depthTest`);
    if ((kind === 'sun' ? st.labels.sun : st.labels.earth) !== sky.skyObjectLabel(kind, local, state)) bad.push(`small:${kind}-label`);
    if (kind === 'earth' && st.labels.earthDetail !== `${Math.round(sky.earthPhase(pt.sun_vector, local).illuminatedFraction * 100)}% terang`) bad.push('small:earth-phase');
    if (`#${line.color}` !== skyLineStyle(kind, state).color) bad.push(`small:${kind}-line-colour`);
    bad.push(...checkPanorama(st, pt, vis, kind));
    // Tracks cover the timeline and meet at the icon.
    const past = st.tracks[`${kind}-past`] ?? [];
    const future = st.tracks[`${kind}-future`] ?? [];
    const nPast = past.reduce((n, t) => n + t.points, 0);
    const nFuture = future.reduce((n, t) => n + t.points, 0);
    if (nPast !== (idx >= 1 ? idx + 1 : 0) || nFuture !== (idx <= total - 2 ? total - idx : 0)) bad.push(`small:${kind}-track-count`);
    if (past.length && dist(past.at(-1).last, icon.pos) > 1e-6) bad.push(`small:${kind}-track-past-end`);
    if (future.length && dist(future[0].first, icon.pos) > 1e-6) bad.push(`small:${kind}-track-future-start`);
  }
  return bad;
}

function checkCompass(st, pt, offset) {
  const c = st.compass;
  if (!c) return ['compass:missing'];
  const bad = [];
  const heading = normalizeAzimuth(st.camHeadingGrid - offset);
  const m = /rotate\(([-0-9.]+) /.exec(c.rot ?? '');
  if (!m || angDiff(-Number(m[1]), heading) > 0.1) bad.push('compass:rotation');
  for (const kind of ['sun', 'earth']) {
    const local = normalizeAzimuth(pt[`${kind}_vector`].azimuth_deg);
    const xy = c[kind];
    const cc = c.size / 2;
    if (!xy || angDiff(normalizeAzimuth((Math.atan2(xy[0] - cc, -(xy[1] - cc)) * 180) / Math.PI), local) > 0.05) bad.push(`compass:${kind}-dot`);
    const obj = st.mode === 'big' ? (kind === 'sun' ? st.bigSun : st.bigEarth) : (kind === 'sun' ? st.sunIcon : st.earthIcon);
    const want = sky.bearingHint(obj?.onScreen, sky.relativeBearingDeg(local, heading));
    if (c[`${kind}Hint`] !== want) bad.push(`compass:${kind}-hint "${c[`${kind}Hint`]}" vs "${want}"`);
  }
  return bad;
}

const indices = [...new Set([0, 1, 137, 174, 273, 400, 542, 719, ...Array.from({ length: 36 }, (_, i) => i * 20)])].sort((a, b) => a - b);
const fails = { big: [], small: [] };
let combos = 0;
for (const mode of ['big', 'small']) {
  for (const site of tel.sites) {
    const offset = northOffsetForSite(site);
    await selectSite(site.name);
    await clickTestId(`sky-mode-${mode}`);
    await sleep(400);
    if (mode === 'small') {
      const st = await evaluate(readState);
      let worst = 0;
      for (let k = 0; st.ring && k < 360; k += 1) {
        const d = dirAzEl(st.earthLine.start, st.ring[k]);
        worst = Math.max(worst, angDiff(d.az - offset, k), Math.abs(d.el - site.horizon_mask_360[k].horizon_elevation_deg));
      }
      ok(st.ring?.length === 361 && st.horizonBand && worst < 1e-3, `${site.site_id}: horizon ring (Kecil) = horizon_mask_360`, `worst Δ ${worst.toExponential(2)}°`);
    }
    for (const idx of indices) {
      await setIndex(idx);
      await sleep(180);
      const st = await evaluate(readState);
      const tl = eph.timelines_by_site[site.site_id];
      const pt = tl[idx];
      const vis = evaluateLineOfSight(site, pt);
      const bad = [];
      if (st.slider !== String(idx) || st.mode !== mode) bad.push('state');
      bad.push(...(mode === 'big' ? checkBig(st, pt, offset, vis) : checkSmall(st, pt, offset, vis, tl.length, idx)));
      bad.push(...checkCompass(st, pt, offset));
      combos += 1;
      if (bad.length) fails[mode].push({ site: site.site_id, idx, bad });
    }
    await setIndex(0);
    await sleep(300);
    await shot(`${site.site_id}-${mode}-overview.png`);
  }
}
ok(fails.big.length === 0, 'Besar: big Sun/Earth = data = panorama (direction, distance, size, label, phase light), Earth line only', fails.big.slice(0, 3));
ok(fails.small.length === 0, 'Kecil: icons = marker lines = data = panorama, tracks, compass', fails.small.slice(0, 3));
results.push(`INFO  ${combos} mode×site×time combinations`);

// ---------- "Besar": look shortcuts, true size; layer switches, legend, collapse ----------
{
  const site = tel.sites[0];
  const offset = northOffsetForSite(site);
  await selectSite(site.name);
  await clickTestId('sky-mode-big');
  await setIndex(174);
  await sleep(400);
  const pt = eph.timelines_by_site[site.site_id][174];
  const panel = [];
  if ((await evaluate(readState)).body) panel.push('panel should start collapsed');
  await clickTestId('sky-controls-toggle'); await sleep(200);
  for (const body of ['earth', 'sun']) {
    await clickTestId(`look-${body}`);
    await sleep(2500);
    const st = await evaluate(readState);
    const obj = body === 'earth' ? st.bigEarth : st.bigSun;
    const g = vectorInGrid(pt[`${body}_vector`], offset);
    const pose = sky.lookTowardPose(st.earthLine.start, azElToUnitVector(g.azimuth_deg, g.elevation_deg));
    if (!obj?.onScreen) panel.push(`look-${body}: body not on screen`);
    if (dist(st.cam, pose.position) > 0.1) panel.push(`look-${body}: camera pose`);
    await shot(`${site.site_id}-big-look-${body}.png`);
  }
  const modelRadius = () => evaluate(`(() => { const s = window.__SELENIS_SCENE__; const out = {};
    for (const kind of ['earth', 'sun']) { const g = s.getObjectByName('big-' + kind); const m = s.getObjectByName('big-' + kind + '-model');
      if (!g || !m) { out[kind] = null; continue; } g.updateWorldMatrix(true, true); const c = g.getWorldPosition(g.position.clone()); const v = c.clone(); let r = 0;
      m.traverse((o) => { const p = o.isMesh ? o.geometry.attributes.position : null; if (!p) return; for (let i = 0; i < p.count; i += 1) r = Math.max(r, v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).distanceTo(c)); });
      out[kind] = { rendered: r, declared: g.userData.radiusKm }; } return out; })()`);
  for (const mode of ['enlarged', 'true']) {
    await clickTestId(`size-${mode}`); await sleep(400);
    const r = await modelRadius();
    for (const kind of ['earth', 'sun']) {
      const want = sky.bigBodyRadiusKm(kind, sky.bigBodyDistanceKm(kind, W, D), mode);
      if (!r[kind] || Math.abs(r[kind].rendered - want) / want > 0.005 || Math.abs(r[kind].declared - want) > 1e-9) panel.push(`model size ${kind}/${mode}`);
    }
  }
  await clickTestId('size-true'); await sleep(400);
  const t = await evaluate(readState);
  const tb = checkBig(t, pt, offset, evaluateLineOfSight(site, pt));
  if (t.size !== 'true' || tb.length) panel.push(`size-true: ${tb.join(',')}`);
  await shot(`${site.site_id}-big-true-size.png`);
  await clickTestId('size-enlarged'); await sleep(300);
  for (const [key, field] of [['earthLine', 'earthLine'], ['compass', 'compass']]) {
    await clickTestId(`layer-${key}`); await sleep(250);
    const off = await evaluate(readState);
    await clickTestId(`layer-${key}`); await sleep(250);
    const on = await evaluate(readState);
    if (off[field] !== null || on[field] === null) panel.push(`big layer ${key}`);
  }
  const bigLegend = (await evaluate(readState)).legend;
  await clickTestId('sky-mode-small'); await sleep(400);
  const smallLegend = (await evaluate(readState)).legend;
  const smallLayers = [
    ['icons', (s) => s.sunIcon],
    ['lines', (s) => s.sunLine],
    ['tracks', (s) => s.tracks['sun-future'] || s.tracks['sun-past']],
    ['horizon', (s) => s.ring],
    ['compass', (s) => s.compass],
  ];
  for (const [key, check] of smallLayers) {
    await clickTestId(`layer-${key}`); await sleep(250);
    const off = await evaluate(readState);
    await clickTestId(`layer-${key}`); await sleep(250);
    const on = await evaluate(readState);
    if (check(off) || !check(on)) panel.push(`small layer ${key}`);
  }
  if (!bigLegend || !smallLegend || bigLegend === smallLegend) panel.push('legend per mode');
  await clickTestId('sky-controls-toggle'); await sleep(200);
  const closed = (await evaluate(readState)).body;
  await clickTestId('sky-controls-toggle'); await sleep(200);
  if (closed || !(await evaluate(readState)).body) panel.push('collapse');
  await clickTestId('sky-mode-big'); await sleep(300);
  ok(panel.length === 0, 'panel: Lihat Bumi/Matahari bring the body on screen, model size = declared (both sizes), layer switches, legend, collapse', panel);
  await clickButton('Peta Kawah');
  await sleep(1500);
}

// ---------- phone layout (390×844) ----------
{
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await send('Page.reload');
  await waitFor(`!!window.__SELENIS_SCENE__?.getObjectByName('lunar-south-pole-terrain') && !!document.querySelector('[data-testid=sky-controls]')`);
  await sleep(1500);
  const layout = () => evaluate(`(() => {
    const r = (sel) => document.querySelector(sel)?.getBoundingClientRect().toJSON() ?? null;
    const panel = r('[data-testid=sky-controls]'), stack = r('[data-testid=scene-overlay-stack]'), header = r('header');
    const buttons = [...document.querySelectorAll('[data-testid=sky-controls] button')].map((b) => b.getBoundingClientRect().height);
    const overlap = panel && stack && !(panel.bottom <= stack.top || stack.bottom <= panel.top || panel.right <= stack.left || stack.right <= panel.left);
    return { panel, overlap, body: !!document.getElementById('sky-controls-body'), minButton: Math.min(...buttons),
      underHeader: !panel || !header || panel.top >= header.bottom - 0.5, overflowX: document.documentElement.scrollWidth > innerWidth };
  })()`);
  const phone = [];
  const first = await layout();
  if (first.body) phone.push('panel not collapsed by default');
  await shot('phone-big.png');
  await clickTestId('sky-controls-toggle'); await sleep(300);
  const open = await layout();
  await shot('phone-panel-open.png');
  await clickTestId('sky-controls-toggle'); await sleep(200);
  for (const [name, l] of [['closed', first], ['open', open]]) {
    if (!l.panel || l.panel.left < 0 || l.panel.right > 390 || l.panel.bottom > 844) phone.push(`${name}: panel off-screen`);
    if (l.minButton < 44 - 0.5) phone.push(`${name}: touch target ${l.minButton.toFixed(1)} px`);
    if (!l.underHeader) phone.push(`${name}: panel overlaps the header`);
    if (l.overflowX) phone.push(`${name}: horizontal overflow`);
  }
  if (first.overlap) phone.push('closed panel overlaps compass/badge');
  ok(phone.length === 0, 'phone 390×844: panel collapsed at start, below the header, inside the screen, ≥ 44 px targets, no overflow', phone);
}

const errors = problems.filter((p) => !p.startsWith('WARNING'));
const warnings = [...new Set(problems.filter((p) => p.startsWith('WARNING')))];
ok(errors.length === 0, 'no exception / console error / HTTP error', errors.slice(0, 5).join(' | '));
results.push(`INFO  warnings: ${warnings.join(' | ') || 'none'}`);
results.push(`INFO  screenshots: ${outDir}`);
console.log(results.join('\n'));
ws.close();
browser.kill();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
