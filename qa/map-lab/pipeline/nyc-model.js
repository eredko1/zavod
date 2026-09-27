import { projection, DEFAULTS } from './osm-model.js';
import { NYC_SOURCES, featureID, geoPolygons, geoLines, geoPoints } from '../data/map-sources.js';
import { sourceNumber } from '../data/source-number.js';
import { sourceCoordinate } from '../data/source-coordinate.js';

export function planFromNYC(snapshot, origin, curbHeight = DEFAULTS.curb) {
  const source = NYC_SOURCES.find(s => s.id === snapshot.sourceId), project = projection(...origin), buildings = [], details = [], coverage = [], issues = [];
  const point = p => project(sourceCoordinate(p));
  for (const f of snapshot.data.features) {
    const id = featureID(source, f), tags = f.properties, item = { id, sourceId: source.id, dataset: source.dataset, tags, rule: source.kind, status: 'rendered', reason: 'NYC geometry; original properties retained.' }; coverage.push(item);
    try {
      const ring = r => { if (r.length < 4 || r[0][0] !== r.at(-1)[0] || r[0][1] !== r.at(-1)[1]) throw new Error('Incomplete polygon ring.'); return r.slice(0, -1).map(point); };
      const shapes = geoPolygons(f.geometry).map(p => ({ outer: ring(p[0]), holes: p.slice(1).map(ring) }));
      if (shapes.some(s => s.outer.length < 3 || s.holes.some(h => h.length < 3))) throw new Error('Incomplete polygon ring.');
      const base = { id, sourceId: source.id, dataset: source.dataset, tags, shapes, paths: geoLines(f.geometry).map(r => r.map(point)), dimensions: {}, attributes: {}, estimates: [], rule: source.kind };
      if (source.kind === 'building') {
        const h = Number(tags.height_roof), valid = h > 0 && Number.isFinite(h) && String(tags.feature_code) !== '1003';
        base.height = { top: valid ? h * 0.3048 : null, bottom: 0, valid, estimated: false, source: 'NYC height_roof (feet → metres)' }; base.extrude = valid; base.suppressed = false;
        const ground=sourceNumber(tags.ground_elevation);if(ground!==null)base.groundElevation=ground*0.3048;
        if (!valid) { item.status = 'skipped'; item.reason = 'No usable roof height, or a placeholder footprint.'; issues.push({ id, dataset: source.dataset, code: 'missing-height', severity: 'error', message: item.reason }); }
        buildings.push(base);
      } else if (source.kind === 'median' && String(tags.sub_code) === '360010') {
        item.status = 'reference'; item.rule = 'painted-median'; item.reason = 'Painted road marking area, not a physical island. Retained in 2D; no 3D surface until a road-marking material rule exists.';
        issues.push({ id, dataset: source.dataset, code: 'painted-median-reference', severity: 'info', message: item.reason });
      } else if (['roadbed', 'sidewalk', 'median'].includes(source.kind)) {
        base.rule = 'surface'; base.surface = true; base.surfaceKind = source.kind === 'roadbed' ? 'roadbed' : source.kind === 'median' && String(tags.sub_code) === '360050' ? 'land' : 'paved';
        base.surfaceHeight = source.kind === 'roadbed' ? 0.04 : curbHeight + 0.04;
        base.estimates.push(source.kind === 'roadbed' ? 'Reference road surface; ground height is flat or interpolated.' : `Raised surface ${curbHeight} m above the reference road surface (curb-height rule, not measured).`); details.push(base);
      } else if (source.kind === 'lion') {
        base.rule = 'line'; base.reference = true; base.dimensions = {}; item.status = 'reference'; item.reason = 'LION network centerline. Supplies street attributes; does not replace roadbed outlines or provide road elevation.';
        for (const key of ['StreetWidth_Min','StreetWidth_Max']) if(Number(tags[key])>0) base.attributes[key]={value:Number(tags[key])*0.3048,unit:'metres',source:`LION ${key} (feet)`,raw:tags[key],estimated:false};
        details.push(base);
      } else if (source.kind === 'curb' || source.kind === 'line') {
        base.baseOffset = 0.04; base.rule = source.kind === 'curb' ? 'kerb' : 'line'; base.dimensions = { height: curbHeight, width: 0.12 }; base.estimates.push(...(source.kind==='curb'?[`Curb height=${curbHeight} m (no matched vertical measurement; rule default).`,'Curb width=0.12 m (rule default).']:['Pavement-edge line; no vertical measurements supplied.'])); details.push(base);
      } else for (const p of geoPoints(f.geometry)) {
        const q = { ...base, point: point(p) };
        if (source.kind === 'tree' && tags.tpstructure === 'Full') { q.rule = 'tree'; q.dimensions = { height: 7, crown: 4.2, trunk: 0.3 }; q.estimates.push('Tree height=7 m, crown=4.2 m, trunk=0.3 m (defaults; dimensions not inferred from species).'); }
        else { q.rule = 'point'; q.reference = true; item.status = 'reference'; item.reason = source.kind === 'tree' ? `Tree record ${tags.tpstructure || 'unknown status'} shown as a marker.` : 'Elevation sample marker. Ground subtype alone feeds terrain.'; }
        const elevation=sourceNumber(tags.elevation);if(source.kind==='elevation'&&elevation!==null)q.elevation=elevation*0.3048;
        if(source.kind==='elevation'&&elevation===null)issues.push({id,dataset:source.dataset,code:'missing-elevation',severity:'warning',message:'Missing or invalid elevation; this point cannot supply a terrain height.'});
        details.push(q);
      }
    } catch (e) { item.status = 'skipped'; item.reason = e.message; issues.push({ id, dataset: source.dataset, code: 'invalid-geometry', severity: 'error', message: e.message }); }
  }
  for (const d of details) {
    for (const [key, value] of Object.entries(d.dimensions)) d.attributes[key] = { value, unit: 'metres', source: 'rule default', estimated: true };
    if (d.surfaceHeight !== undefined) d.attributes.surfaceOffset = { value: d.surfaceHeight, unit: 'metres', source: 'curb rule + 0.04 m display offset', estimated: true };
    if (d.elevation !== undefined) d.attributes.elevation = { value: d.elevation, unit: 'metres', source: 'NYC elevation (feet)', raw: d.tags.elevation, estimated: false };
  }
  for (const d of details) for (const message of d.estimates) issues.push({ id: d.id, dataset: source.dataset, code: 'estimated-detail', severity: 'info', message });
  return { buildings, roads: [], details, coverage, issues, origin, sourceId: source.id };
}
