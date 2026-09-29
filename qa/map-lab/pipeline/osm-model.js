// OSM -> metre-based construction plan. Pure data: no rendering, game state, or authored scenery.
import { normalize } from './osm-geometry.js';
import { detailsFromOSM } from './osm-rules.js';
import {physicalLevel,isGroundLevel,isBridgeLevel} from './physical-level.js';

export const DEFAULTS = { storey: 3, curb: 0.15, laneWidth: 3, roadWidth: 7, pathWidth: 2 };
const DEG = Math.PI / 180, A = 6378137, E2 = 6.69437999014e-3;
const active = v => v !== undefined && v !== 'no';
export function projection(lat, lon) {
  // WGS84 ellipsoid -> local east/north tangent plane. y is separately modelled above flat ground.
  const ecef = (lat, lon) => { const p = lat * DEG, l = lon * DEG, n = A / Math.sqrt(1 - E2 * Math.sin(p) ** 2); return [n * Math.cos(p) * Math.cos(l), n * Math.cos(p) * Math.sin(l), n * (1 - E2) * Math.sin(p)]; };
  const o = ecef(lat, lon), sp = Math.sin(lat * DEG), cp = Math.cos(lat * DEG), sl = Math.sin(lon * DEG), cl = Math.cos(lon * DEG);
  return p => { const v = ecef(p.lat, p.lon).map((n, i) => n - o[i]); return [-sl * v[0] + cl * v[1], sp * cl * v[0] + sp * sl * v[1] - cp * v[2]]; };
}
// Affine source-coordinate plane preserves straight geographic segments across different vertex densities.
export function affineProjection(lat,lon){const sin=Math.sin(lat*DEG),den=1-E2*sin*sin,east=A/Math.sqrt(den)*Math.cos(lat*DEG)*DEG,north=A*(1-E2)/den**1.5*DEG;return ([x,y])=>[(x-lon)*east,(lat-y)*north];}
export function length(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const s = String(value).trim(), feet = /^(\d+(?:\.\d+)?)\s*'\s*(\d+(?:\.\d+)?)?\s*"?$/.exec(s);
  if (feet) return +feet[1] * 0.3048 + +(feet[2] || 0) * 0.0254;
  const m = /^(\d+(?:\.\d+)?)\s*(m|metres?|meters?|cm|mm|ft|feet|foot)?$/i.exec(s);
  return m ? +m[1] * (/^(ft|feet|foot)$/i.test(m[2] || '') ? 0.3048 : m[2]?.toLowerCase()==='cm' ? .01 : m[2]?.toLowerCase()==='mm' ? .001 : 1) : null;
}
const positive = v => { const n = Number(v); return v !== undefined && String(v).trim() !== '' && Number.isFinite(n) && n > 0 ? n : null; };
export function heightOf(tags, o = DEFAULTS) {
  const raw = length(tags.height), h = raw > 0 ? raw : null, floors = positive(tags['building:levels']);
  if(o.measurementsOnly){const min=length(tags.min_height),minLevel=positive(tags['building:min_level']),bottom=min??(minLevel?null:0);return {top:h,bottom,bottomSource:min!==null?'min_height tag':minLevel?'No measured base height; floor tag retained':'Ground-relative origin',source:h===null?'No measured height':'height tag',estimated:false,valid:h!==null&&(bottom===null||h>bottom)};}
  const roof = length(tags['roof:height']) ?? (positive(tags['roof:levels']) || 0) * o.storey;
  const min = length(tags.min_height), minLevel = positive(tags['building:min_level']);
  const bottom = min ?? (minLevel ? minLevel * o.storey : 0), top = h ?? (floors ? floors * o.storey + roof : null);
  const bottomEstimated=min===null&&!!minLevel;
  return { top, bottom, source: h !== null ? 'height tag'+(bottomEstimated?`; base ${minLevel} floors × ${o.storey} m`:'') : floors ? `${floors} floors × ${o.storey} m${roof ? ' + roof' : ''}` : 'height unknown', estimated: h === null || bottomEstimated,topEstimated:h===null,bottomEstimated, valid: top !== null && top > bottom };
}
export function widthOf(tags, o = DEFAULTS) {
  const width = length(tags.width), lanes = positive(tags.lanes), path = /^(footway|path|pedestrian|steps|cycleway|bridleway)$/.test(tags.highway || '');
  if (width > 0) return { value: width, source: 'width tag', estimated: false };
  if(o.measurementsOnly)return null;
  if (lanes) return { value: lanes * o.laneWidth, source: `${lanes} lanes × ${o.laneWidth} m`, estimated: true };
  const defaults = { motorway: 12, trunk: 10, primary: 10, secondary: 9, tertiary: 8, residential: o.roadWidth, service: 5 };
  return { value: path ? o.pathWidth : (defaults[tags.highway] || o.roadWidth), source: `default for ${tags.highway}`, estimated: true };
}
export function ringArea(p) { return p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2; }
export function inRing(x, z, p) {
  let hit = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit; }
  return hit;
}
export const inShape = (x, z, s) => inRing(x, z, s.outer) && !s.holes.some(p => inRing(x, z, p));
function polygons(paths, project,retainGeographic=false) {
  const sorted = paths.filter(p => p.closed).map(path=>{const points=path.points.slice(0,-1),p=points.map(project);return{p,geographic:retainGeographic?points.map(q=>[q.lon,q.lat]):null,area:Math.abs(ringArea(p)),parent:null,depth:0};}).filter(r=>r.p.length>=3&&r.area>0.001).sort((a,b)=>b.area-a.area);
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    for (let j = i - 1; j >= 0; j--) if (inRing(...r.p[0], sorted[j].p)) { r.parent = sorted[j]; r.depth = r.parent.depth + 1; break; }
  }
  return sorted.filter(r => r.depth % 2 === 0).map(r => {const holes=sorted.filter(h=>h.parent===r&&h.depth%2===1);return{outer:r.p,holes:holes.map(h=>h.p),...(retainGeographic?{geographic:{outer:r.geographic,holes:holes.map(h=>h.geographic)}}:{})};});
}
export function planFromOSM(data, options = {}) {
  if (!Array.isArray(data?.elements)) throw new Error('Expected Overpass JSON with an elements array.');
  if (data.remark) throw new Error(`Incomplete API response: ${data.remark}`);
  const o = { ...DEFAULTS, ...options };
  for (const k of ['storey', 'laneWidth', 'roadWidth', 'pathWidth']) if (!(o[k] > 0 && Number.isFinite(o[k]))) throw new Error(`Invalid ${k}. Enter a positive number.`);
  const all = normalize(data.elements), normalized = new Map(all.map(f => [f.id, f])), rawWays=new Map(data.elements.filter(e=>e.type==='way').map(e=>[`way/${e.id}`,e])), list = all.filter(f => active(f.tags.building) || active(f.tags['building:part']) || f.tags.highway);
  const points = all.flatMap(f => f.paths.flatMap(p => p.points));
  if (!points.length && !data.elements.some(e => active(e.tags?.building) || active(e.tags?.['building:part']))) throw new Error('No drawable geometry. Include out geom; in the query.');
  let lat0 = Infinity, lat1 = -Infinity, lon0 = Infinity, lon1 = -Infinity;
  for (const p of points) { lat0 = Math.min(lat0, p.lat); lat1 = Math.max(lat1, p.lat); lon0 = Math.min(lon0, p.lon); lon1 = Math.max(lon1, p.lon); }
  const origin = points.length ? [(lat0 + lat1) / 2, (lon0 + lon1) / 2] : [40.5775, -73.978], project = projection(...origin), buildings = [], roads = [], issues = [];
  const issue = (id, code, message, severity = 'error') => issues.push({ id, code, severity, message });
  const counts = { incompleteBuildings: 0, unknownHeights: 0, estimatedHeights: 0, estimatedWidths: 0, hiddenOutlines: 0, tunnels: 0, ignored: all.length - list.length };
  // A member way can repeat a multipolygon already returned as a relation.
  const relationMembers = new Set();
  for (const e of data.elements.filter(e => e.type === 'relation' && e.tags?.type === 'multipolygon' && (active(e.tags.building) || active(e.tags['building:part'])))) {
    const parent = normalized.get(`relation/${e.id}`);
    if (!parent?.paths.length || parent.paths.some(p => !p.closed) || !polygons(parent.paths, project).length || !heightOf(e.tags, o).valid || !isGroundLevel(e)) continue;
    for (const m of e.members || []) if (m.type === 'way' && (!m.role || m.role === 'outer')) {
      const child = normalized.get(`way/${m.ref}`);
      if (child && isGroundLevel(child) && active(child.tags['building:part']) === active(e.tags['building:part'])) relationMembers.add(child.id);
    }
  }
  for (const f of list) {
    const t = f.tags;
    if (active(t['bridge:support'])) continue;
    if (active(t.building) || active(t['building:part'])) {
      if (!o.retainRepresented&&relationMembers.has(f.id)) continue;
      const shapes = polygons(f.paths, project,true), height = heightOf(t, o), incomplete = f.paths.some(p => !p.closed);
      if (!shapes.length || incomplete) { counts.incompleteBuildings++; issue(f.id, 'incomplete-footprint', 'Skipped: no complete area footprint. Fetch full out geom;.'); }
      if (!height.valid && height.top !== null) issue(f.id, 'invalid-height', 'Skipped: top height must exceed min_height.');
      const reference=!isGroundLevel(f),extrude = shapes.length > 0 && !incomplete && height.valid&&!reference;
      if (height.top === null) { counts.unknownHeights++;if(!o.measurementsOnly)issue(f.id, 'missing-height', 'Skipped: neither a usable height nor building:levels tag.'); }
      if (t.height !== undefined && !(length(t.height) > 0)) issue(f.id, 'invalid-height-tag', o.measurementsOnly?'Unusable height tag; original tags retained for rendering.':'Unusable height tag; floor count used if available.', 'warning');
      if (height.valid && height.estimated) issue(f.id, 'estimated-height', height.source, 'info');
      if (extrude && height.estimated) counts.estimatedHeights++;
      buildings.push({ id: f.id, tags: t, shapes, paths: f.paths.map(p => p.points.map(project)), height, extrude, reference, part: active(t['building:part']), suppressed: false });
    } else if (t.highway && f.type === 'way') {
      const placement=physicalLevel(f);if(['tunnel','subsurface'].includes(placement.kind))counts.tunnels++;
      if(placement.kind!=='ground')issue(f.id,'flat-road',`Vertical placement requires resolution: ${placement.reason}`,'warning');
      const width = widthOf(t, o), shapes = polygons(f.paths, project), paths = f.paths.filter(p => !p.closed && p.points.length > 1).map(p => p.points.map(project));
      if (!shapes.length && !paths.length) continue;
      const elevated = isBridgeLevel(f);
      if (paths.length && width?.estimated) counts.estimatedWidths++;
      const nodes=rawWays.get(f.id)?.nodes;
      roads.push({ id: f.id, tags: t, width, shapes, paths, ...(paths.length===1&&nodes?.length===paths[0].length?{nodes:[...nodes]}:{}), elevated, path: /^(footway|path|pedestrian|steps|cycleway|bridleway)$/.test(t.highway) });
    }
  }
  // Whole/part assembly is resolved by the renderer after all source alternatives are merged.
  const details = detailsFromOSM(all, project, polygons, length, issue, o.curb,o.measurementsOnly);
  const detailById = new Map(details.map(f => [f.id, f])), surfaceMembers = new Map();
  // Only complete parent surfaces replace matching outer-member surfaces. Inner areas and boundary solids remain independent.
  const areaKeys = ['leisure','landuse','natural','water','amenity','railway','public_transport'];
  for (const e of data.elements.filter(e => e.type === 'relation' && e.tags?.type === 'multipolygon')) {
    const parent = detailById.get(`relation/${e.id}`), geometry = normalized.get(parent?.id);
    if (!parent?.surface || !geometry?.paths.length || geometry.paths.some(p => !p.closed)) continue;
    for (const member of e.members || []) {
      if (member.type !== 'way' || (member.role && member.role !== 'outer')) continue;
      const child = detailById.get(`way/${member.ref}`);
      if (!child?.surface || !areaKeys.some(k => child.tags[k]) || areaKeys.some(k => child.tags[k] !== parent.tags[k])) continue;
      if (Object.keys(child.tags).some(k => !['barrier','height','width','fence_type','area'].includes(k) && child.tags[k] !== parent.tags[k])) continue;
      child.surface = false; surfaceMembers.set(child.id, parent.id);
      issue(child.id, 'member-surface', `Surface represented by ${parent.id}; independent boundary solids retained.`, 'info');
    }
  }
  for (let i = details.length - 1; i >= 0; i--) if (surfaceMembers.has(details[i].id) && details[i].rule === 'surface') details.splice(i, 1);
  const generated = new Map([...buildings, ...roads, ...details].map(f => [f.id, f]));
  const coverage = [...new Map(data.elements.map(e => [`${e.type}/${e.id}`, e])).entries()].map(([id, e]) => {
    const f = normalized.get(id), g = generated.get(id), tags = e.tags || {};
    let status = 'represented', reason = 'Logical relation / member geometry; no separate physical object.', rule = 'metadata';
    if (!Object.keys(tags).length) { status = 'support'; reason = 'Geometry reference retained in source data.'; rule = 'geometry-reference'; }
    else if (g) {
      rule = g.rule || (g.height ? 'building' : 'road'); status = g.reference ? 'reference' : 'rendered'; reason = g.reference ? 'Mapped geometry shown without inventing an object model.' : 'Generated from mapped geometry; inspect attributes for estimates.';
      if (g.height && !g.extrude && !g.reference) { status = 'skipped'; reason = 'Building requires a complete footprint and usable height or floor count.'; }
      if(o.measurementsOnly&&!g.reference){status='retained';reason='Mapped geometry and measurements retained; model dimensions and placement belong to rendering.';}
      if (g.suppressed) { status = 'represented'; reason = 'Parent volume replaced by mapped building parts.'; }
    } else if (surfaceMembers.has(id)) { reason = `Member surface represented by ${surfaceMembers.get(id)}.`; rule = 'member-surface'; }
    else if (relationMembers.has(id)) { reason = 'Member geometry represented by the parent building relation.'; }
    else if (!f && !(e.type === 'relation' && ['route', 'route_master', 'restriction', 'public_transport', 'building', 'site'].includes(tags.type))) {
      status = 'skipped'; rule = 'missing-geometry'; reason = 'No geometry returned; cannot render.'; issue(id, 'missing-geometry', reason);
    }
    return { id, tags, rule, status, reason, ...(surfaceMembers.has(id) ? { representedBy: surfaceMembers.get(id) } : {}) };
  });
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of points) { const [x, z] = project(p); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  if (!points.length) { x0 = z0 = -50; x1 = z1 = 50; }
  return { version: 2, origin, units: 'metres', axes: 'x east, y up, z south', ground: o.measurementsOnly?'unresolved':'flat', options: o.measurementsOnly?{measurementsOnly:true}:o, buildings, roads, details, coverage, bounds: { x0, z0, x1, z1 }, counts, issues, timestamp: data.osm3s?.timestamp_osm_base || null };
}
