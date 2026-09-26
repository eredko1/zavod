import { initNYCLayers } from './nyc-layers.js';
import { downloadJSON } from './download.js';
import { resolveMap } from '../pipeline/map-pipeline.js';
import { projection } from '../pipeline/osm-model.js';
import { display2DMerge } from './map-merge-2d.js';
import { normalize } from '../pipeline/osm-geometry.js';

export function createMapPreview(root, { options = () => ({}), onMerge = () => {} } = {}) {
const $ = id => root.querySelector(`#${id}`), svg = $('map'), NS = 'http://www.w3.org/2000/svg';
const COLORS = { land: ['Land & recreation', '#50775e'], water: ['Water', '#5192b5'], buildings: ['Buildings', '#d7a477'], roads: ['Roads', '#97a7af'], paths: ['Paths & steps', '#d8d4a7'], rail: ['Railways', '#cba5c5'], other: ['Other outlines', '#a49cd1'], points: ['Mapped points', '#f3cb72'], vertices: ['Geometry nodes', '#647681'] };
const view = { x: 0, z: 0, span: 600 }, features = new Map(), groups = new Map();
let nyc = null, displayData = null, mergedPlan = null, mergedInput = null, mergedSnapshots = [], mergedEnabled = null;
let areaOverride = null;
let origin = [40.5775, -73.978], selected = null, drag = null, moved = false, raw = null, fullBounds = null, lastQuery = '', lastEndpoint = '', fetchedAt = '';
let project = projection(...origin);
const filters = new Map();
function el(tag, attrs = {}, parent = svg) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); parent.append(e); return e; }
function gps(x, z) { let lat = origin[0] - z / 111132, lon = origin[1] + x / (111320 * Math.cos(origin[0] * Math.PI / 180)); for (let i=0;i<3;i++) { const p=project({lat,lon}); lat -= (z-p[1])/111132; lon += (x-p[0])/(111320*Math.cos(lat*Math.PI/180)); } return [lat,lon]; }
function bounds(points) { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of points) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); } return { x0, z0, x1, z1 }; }
function size() { const r = svg.getBoundingClientRect(); return { width: Math.max(1, r.width), height: Math.max(1, r.height) }; }
function renderView() {
  const s = size(), w = view.span * s.width / s.height;
  svg.setAttribute('viewBox', `${view.x - w / 2} ${view.z - view.span / 2} ${w} ${view.span}`);
  const desired = 80 * view.span / s.height, pow = 10 ** Math.floor(Math.log10(desired)), unit = [1, 2, 5, 10].find(n => n * pow >= desired) * pow;
  $('scale').style.width = `${unit * s.height / view.span}px`; $('scale').textContent = unit >= 1000 ? `${unit / 1000} km` : `${unit} m`;
}
function fit(b) { if (!b || !Number.isFinite(b.x0)) return; const s = size(); view.x = (b.x0 + b.x1) / 2; view.z = (b.z0 + b.z1) / 2; view.span = Math.max(40, b.z1 - b.z0, (b.x1 - b.x0) * s.height / s.width) * 1.2; renderView(); }
function point(e) { const r = svg.getBoundingClientRect(), k = view.span / r.height; return [view.x + (e.clientX - r.left - r.width / 2) * k, view.z + (e.clientY - r.top - r.height / 2) * k]; }
function zoom(factor, at = [view.x, view.z]) { const next = Math.max(20, Math.min(400000, view.span * factor)), k = next / view.span; view.x = at[0] + (view.x - at[0]) * k; view.z = at[1] + (view.z - at[1]) * k; view.span = next; renderView(); }
function path(points) { return points.map((p, i) => `${i ? 'L' : 'M'}${project(p).join(',')}`).join(' '); }
function layer(id, count) {
  const [title, color] = COLORS[id], g = el('g', { 'data-layer': id }); groups.set(id, g);
  const label = document.createElement('label'), input = document.createElement('input'), swatch = document.createElement('span'), text = document.createElement('span'), num = document.createElement('small');
  input.type = 'checkbox'; input.checked = filters.get(id) ?? id !== 'vertices'; input.dataset.layer = id; g.toggleAttribute('hidden', !input.checked);
  swatch.className = 'swatch'; swatch.style.background = color; text.textContent = title; num.textContent = count;
  input.addEventListener('change', () => { filters.set(id,input.checked); g.toggleAttribute('hidden', !input.checked); if (selected && g.contains(selected)) clearSelection(); });
  label.append(input, swatch, text, num); $('layers').append(label);
}
function clearSelection() { selected?.classList.remove('selected'); selected = null; $('details').textContent = 'Select a feature.'; }
function select(shape) {
  const f = features.get(shape?.dataset.feature); clearSelection(); if (!f) return;
  selected = shape; shape.classList.add('selected'); const title = document.createElement('strong'); title.textContent = f.tags.name || f.tags['addr:street'] || COLORS[f.category][0];
  const link = document.createElement('a'); link.textContent = `${f.id} ↗`; link.href = `https://www.openstreetmap.org/${f.id}`; link.target = '_blank'; link.rel = 'noopener';
  const dl = document.createElement('dl');
  for (const [name, value] of Object.entries(f.tags)) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = name; dd.textContent = value; dl.append(dt, dd); }
  const note = document.createElement('p'); note.className = 'muted'; note.style.fontSize = '12px'; note.textContent = Object.keys(f.tags).length ? 'Tags are shown as returned by OpenStreetMap. Missing heights or widths are not estimated.' : 'This geometry node has no tags.';
  const p = document.createElement('p'); p.append(link); $('details').replaceChildren(title, p, dl, note); const decision = mergeDecision(f.id); if (decision) { const pre=document.createElement('pre'); pre.textContent=JSON.stringify(decision,null,2); $('details').append(pre); }
}
function show(data) {
  const list = normalize(data.elements);
  if (data.elements.length && !list.length) throw new Error('No drawable coordinates. End the query with out geom; to include geometry.');
  // Validate before replacing SVG geometry. The controller owns source-session resets.
  displayData = data; clearSelection(); svg.replaceChildren(); $('layers').replaceChildren(); features.clear(); groups.clear();
  const pts = list.flatMap(f => f.paths.flatMap(p => p.points)), geo = bounds(pts.map(p => [p.lon, p.lat]));
  if (pts.length) origin = [(geo.z0 + geo.z1) / 2, (geo.x0 + geo.x1) / 2];
  project = projection(...origin);
  for (const id of Object.keys(COLORS)) { const count = list.filter(f => f.category === id).length; if (count) layer(id, count); }
  for (const f of list) {
    const g = el('g', { 'data-feature': f.id }, groups.get(f.category)), color = COLORS[f.category][1];
    if (f.type === 'node') { const [x, z] = project(f.paths[0].points[0]); el('circle', { cx: x, cy: z, r: f.category === 'vertices' ? 0.7 : 1.8, fill: color, stroke: '#16232d', 'stroke-width': 0.5, 'vector-effect': 'non-scaling-stroke' }, g); }
    else {
      const closed = f.paths.filter(p => p.closed), open = f.paths.filter(p => !p.closed);
      const attrs = { stroke: color, 'stroke-width': f.category === 'roads' ? 3 : 1.4, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
      if (closed.length) el('path', { ...attrs, d: closed.map(p => path(p.points) + ' Z').join(' '), fill: color, 'fill-opacity': 0.45, 'fill-rule': 'evenodd' }, g);
      if (open.length) el('path', { ...attrs, d: open.map(p => path(p.points)).join(' '), fill: 'none' }, g);
    }
    features.set(f.id, f);
  }
  $('coverage').textContent = `${list.length} drawable / ${data.elements.length} returned`;
  nyc?.render();applyOSMVisibility();
  fullBounds=mergedPlan?.bounds;fit(fullBounds);$('position').textContent=`${list.length.toLocaleString()} OSM features`;
  $('empty').hidden = !!list.length || !!nyc?.hasVisible(); $('empty').textContent = 'No features returned. Try another area or query.';
}
$('all').addEventListener('click', () => fit(fullBounds));
$('download').onclick=()=>downloadJSON({ ...raw, query:lastQuery },'osm-query.json');
$('zoom-in').addEventListener('click', () => zoom(0.75)); $('zoom-out').addEventListener('click', () => zoom(1 / 0.75));
svg.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.exp(Math.max(-0.5, Math.min(0.5, e.deltaY * 0.001))), point(e)); }, { passive: false });
svg.addEventListener('pointerdown', e => { if (e.button !== 0 || drag) return; moved = false; drag = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: view.x, cz: view.z, target: e.target.closest('[data-feature]') }; svg.setPointerCapture(e.pointerId); svg.classList.add('dragging'); });
svg.addEventListener('pointermove', e => {
  if (drag && e.pointerId === drag.id) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) > 4) moved = true; view.x = drag.cx - dx * view.span / size().height; view.z = drag.cz - dy * view.span / size().height; renderView(); }
  const [x, z] = point(e), [lat, lon] = gps(x, z); $('position').textContent = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
});
function endDrag(e) { if (!drag || drag.id !== e.pointerId) return; const target = drag.target; drag = null; svg.classList.remove('dragging'); if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId); if (e.type === 'pointerup' && !moved) select(target); }
svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag); svg.addEventListener('lostpointercapture', endDrag);
svg.addEventListener('keydown', e => { if (e.key === '+' || e.key === '=') zoom(0.75); else if (e.key === '-') zoom(1 / 0.75); else if (e.key === 'Escape') clearSelection(); else if (e.key.startsWith('Arrow')) { const d = view.span * 0.1; if (e.key === 'ArrowLeft') view.x -= d; if (e.key === 'ArrowRight') view.x += d; if (e.key === 'ArrowUp') view.z -= d; if (e.key === 'ArrowDown') view.z += d; renderView(); } else return; e.preventDefault(); });
const observer=new ResizeObserver(renderView);observer.observe(svg);

function applyOSMVisibility() { for (const g of groups.values()) g.style.display = $('osm-visible').checked ? '' : 'none'; }
$('osm-visible').onchange = applyOSMVisibility;
nyc = initNYCLayers({ root, svg, project:p=>project(p),
  mapBounds: () => { if (areaOverride) return areaOverride; const s = size(), w = view.span * s.width / s.height, [south, west] = gps(view.x - w / 2, view.z + view.span / 2), [north, east] = gps(view.x + w / 2, view.z - view.span / 2); return { south, west, north, east }; },
  inspected: clearSelection, mergeDecision,
  changed: () => { updateMerge(); $('empty').hidden = features.size > 0 || !!nyc?.hasVisible(); },
});

function mergeDecision(id) { return mergedPlan?.merge.decisions.find(d => d.members.some(m => m.id === id) && !d.representedBy) || mergedPlan?.merge.decisions.find(d => d.members.some(m => m.id === id)); }
function updateMerge() {
  const snaps=nyc?.snapshots()||[], enabled=$('merge-enabled').checked;
  if (mergedInput!==displayData || mergedEnabled!==enabled || snaps.length!==mergedSnapshots.length || snaps.some((s,i)=>s.data!==mergedSnapshots[i])) { mergedPlan=resolveMap({data:displayData,nyc:snaps,bounds:areaOverride,mergeEnabled:enabled},options()); mergedInput=displayData;mergedSnapshots=snaps.map(s=>s.data);mergedEnabled=enabled; }
  display2DMerge(svg,mergedPlan);const m=mergedPlan?.merge;
  $('merge-summary').textContent=m?.enabled?`${m.summary.matched} matches · ${m.summary.suppressed} redundant · ${m.summary.partial} partial roads · ${m.summary.conflicts} conflicts.`:'Merging off.';
  $('merge-download').disabled=!m; onMerge(m);
}
$('merge-enabled').onchange=updateMerge;
$('merge-download').onclick=()=>downloadJSON({merge:mergedPlan.merge,query:lastQuery,endpoint:lastEndpoint,fetchedAt,nycSources:nyc.snapshots().map(({data,...p})=>p)},'map-merge-log.json');
return {
  setArea(bounds) { areaOverride=bounds;origin=[(bounds.south+bounds.north)/2,(bounds.west+bounds.east)/2];project=projection(...origin); },
  load(result) { raw=result.data;lastQuery=result.query;lastEndpoint=result.endpoint;fetchedAt=result.fetchedAt;nyc.restore(result.nyc||[]);show(raw||{elements:[]});$('download').disabled=!raw; },
  result() { return { data:raw,query:lastQuery,endpoint:lastEndpoint,fetchedAt,bounds:areaOverride,nyc:nyc.snapshots(),mergeEnabled:$('merge-enabled').checked,hiddenOSM:[...features.values()].filter(f=>!$('osm-visible').checked||groups.get(f.category)?.hasAttribute('hidden')).map(f=>f.id) }; },
  get plan() { return mergedPlan; },
  refreshRules() {mergedInput=null;updateMerge();},
  fit() { fit(fullBounds); },
  dispose() {observer.disconnect();},
};
}
