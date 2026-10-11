import { projection, DEFAULTS } from './osm-model.js';
import { NYC_SOURCES, featureID, sourceFeatures, geoPolygons, geoLines, geoPoints } from '../data/map-sources.js';
import { sourceNumber } from '../data/source-number.js';
import { INFRASTRUCTURE_KINDS, infrastructureFeature } from './nyc-infrastructure.js';
import { clipPaths } from './area-clip.js';
import {planFromBuildingMeshes} from './nyc-building-mesh.js';
import {waterTankFeature} from './roof-equipment.js';
import {pointRecordSummary} from '../data/las-point-records.js';

export function planFromNYC(snapshot, origin, curbHeight = DEFAULTS.curb,measurementsOnly=false) {
  if(snapshot.sourceId==='nyc-buildings-2014')return planFromBuildingMeshes(snapshot,origin);
  const source = NYC_SOURCES.find(s => s.id === snapshot.sourceId), project = projection(...origin), buildings = [], details = [], coverage = [], issues = [];
  if(!source)throw Error(`Unknown NYC source: ${snapshot.sourceId}`);
  if(source.kind==='point-cloud')return {buildings:[],roads:[],details:[],issues:[],origin,sourceId:source.id,coverage:snapshot.data.assets.map(asset=>{const {decoded,...tags}=asset;return {id:`${source.id}/${asset.id}`,sourceRecordId:asset.id,sourceId:source.id,dataset:source.dataset,tags:decoded?{...tags,decoded:pointRecordSummary(decoded)}:tags,rule:'point-cloud',status:'retained',reason:`Original compressed point payload retained at every intersecting EPT depth; ${decoded?.encoding==='laszip'?'complete records validated; decoded on renderer query':decoded?'full decoded measurements available':'point decoding pending'}. Model interpretation belongs to rendering. Node bounds describe acquisition coverage, not physical geometry.`};})};
  const infrastructure=INFRASTRUCTURE_KINDS.has(source.kind),inventory=['transport-reference','bridge-inventory','bridge-clearance-inventory','sign-structure-inventory','station-inventory','planimetric-reference','street-inventory','building-grade-inventory'].includes(source.kind),bounds=snapshot.bounds;
  const clipBounds=(infrastructure||inventory)&&bounds?(()=>{const a=project({lat:bounds.south,lon:bounds.west}),b=project({lat:bounds.north,lon:bounds.east});return{x0:a[0],x1:b[0],z0:b[1],z1:a[1]};})():null;
  const point = ([lon,lat]) => project({lon,lat});
  for (const f of sourceFeatures(source,snapshot.data.features)) {
    const id = featureID(source, f), tags = f.properties, item = { id, sourceRecordId:f.sourceRecordId||id, sourceId: source.id, dataset: source.dataset, tags, rule: source.kind, status: 'rendered', reason: 'NYC geometry; original properties retained.' }; coverage.push(item);
    try {
      if(f.geometryError)throw Error(f.geometryError);
      const ring = r => r.slice(0,-1).map(point);
      const shapes = geoPolygons(f.geometry).map(p => ({ outer: ring(p[0]), holes: p.slice(1).map(ring),...(source.kind==='building'?{geographic:{outer:p[0].slice(0,-1).map(q=>q.slice(0,2)),holes:p.slice(1).map(r=>r.slice(0,-1).map(q=>q.slice(0,2)))}}:{}) }));
      const base = { id, sourceRecordId:item.sourceRecordId, sourceId: source.id, dataset: source.dataset, tags, shapes, paths: geoLines(f.geometry).map(r => r.map(point)), dimensions: {}, attributes: {}, estimates: [], rule: source.kind };
      if(inventory){
        base.rule=base.shapes.length?'geometry-reference':base.paths.length?'line':'point';base.reference=true;base.sourceRole=source.sourceRole||source.kind;
        if(source.kind==='planimetric-reference'){
          base.sourceGeometry=structuredClone(f.geometry);
          base.coordinateProvenance={horizontalCRS:'EPSG:4326',...(source.nativeHasZ?{verticalCRS:snapshot.metadata.verticalCRS,verticalUnit:'unverified feet convention'}:{}),surveyFamily:source.surveyFamily,captureYear:source.captureYear,nativeResponseChannel:'raw.responses'};
        }
        if(source.kind==='station-inventory')base.coordinateProvenance={horizontalCRS:'EPSG:4326',coordinateRole:snapshot.metadata?.coordinateRole};
        if(clipBounds)base.clipBounds=clipBounds;
        item.status='reference';item.reason=source.kind==='planimetric-reference'?'Original survey geometry, classifications and native coordinate channels retained; vertical interpretation, equipment models and cross-export association require renderer rules.':source.kind==='station-inventory'?'GTFS station centroid and transit attributes; structure type does not measure platform height or locate supports.':source.kind==='bridge-inventory'?'Bridge inventory location and attributes; this point is not a column or pier.':'Mapped roadway alignment and attributes; vertex Z and route measures do not establish a deck elevation or OSM node connectivity.';
        if(source.sourceRole==='station-entrance')item.reason='Reported entrance coordinates and access attributes; station IDs relate entrances without combining them or measuring stair/platform heights.';
        if(source.kind==='street-inventory')item.reason='Pedestrian access survey/program point and every original measurement/status retained; units, sentinel values, survey dates and geometric orientation require interpretation before modeling.';
        if(source.kind==='building-grade-inventory')item.reason='Reported building-adjacent grade and estimated lowest active floor retained with source notes; obstructed grade may be source-estimated. This point does not measure street level or a building footprint.';
        if(source.kind==='sign-structure-inventory')item.reason='Reported overhead-sign asset location, identity and status retained. This point does not measure a sign face, gantry span, post location, support section or bridge pier.';
        if(source.kind==='bridge-clearance-inventory')item.reason='Reported bridge clearance and inspection fields retained at the bridge reference point. Zero and sentinel-like values remain raw until field rules are verified; this point does not measure a continuous underside or road grade.';
        const points=geoPoints(f.geometry);if(points.length)base.point=point(points[0]);details.push(base);
      }
      else if(source.kind==='roof-equipment')details.push(waterTankFeature(base,item,issues,snapshot));
      else if(infrastructure){
        if(clipBounds){base.clipBounds=clipBounds;base.paths=clipPaths(base.paths,clipBounds);}
        details.push(infrastructureFeature(base,source,item,issues,measurementsOnly));
      } else if (source.kind === 'building') {
        const h = Number(tags.height_roof), valid = h > 0 && Number.isFinite(h) && String(tags.feature_code) !== '1003';
        base.height = { top: valid ? h * 0.3048 : null, bottom: 0, valid, estimated: false, source: 'NYC height_roof (feet → metres)' }; base.extrude = valid; base.suppressed = false;
        const ground=sourceNumber(tags.ground_elevation);if(ground!==null)base.groundElevation=ground*0.3048;
        if (!valid) { item.status = measurementsOnly?'retained':'skipped'; item.reason = 'No usable roof height, or a placeholder footprint.';if(!measurementsOnly)issues.push({ id, dataset: source.dataset, code: 'missing-height', severity: 'error', message: item.reason }); }
        buildings.push(base);
      } else if (source.kind === 'median' && String(tags.sub_code) === '360010') {
        item.status = 'reference'; item.rule = 'painted-median'; item.reason = 'Painted road marking area, not a physical island. Retained in 2D; no 3D surface until a road-marking material rule exists.';
        issues.push({ id, dataset: source.dataset, code: 'painted-median-reference', severity: 'info', message: item.reason });
      } else if (['roadbed', 'sidewalk', 'median'].includes(source.kind)) {
        base.rule = 'surface'; base.surface = true; base.surfaceKind = source.kind === 'roadbed' ? 'roadbed' : source.kind === 'median' && String(tags.sub_code) === '360050' ? 'land' : 'paved';
        if(!measurementsOnly){base.surfaceHeight = source.kind === 'roadbed' ? 0.04 : curbHeight + 0.04;
        base.estimates.push(source.kind === 'roadbed' ? 'Reference road surface; ground height is flat or interpolated.' : `Raised surface ${curbHeight} m above the reference road surface (curb-height rule, not measured).`);}details.push(base);
      } else if (source.kind === 'lion') {
        base.rule = 'line'; base.reference = true; base.dimensions = {}; item.status = 'reference'; item.reason = 'LION network centerline. Supplies street attributes; does not replace roadbed outlines or provide road elevation.';
        for (const key of ['StreetWidth_Min','StreetWidth_Max']) if(Number(tags[key])>0) base.attributes[key]={value:Number(tags[key])*0.3048,unit:'metres',source:`LION ${key} (feet)`,raw:tags[key],estimated:false};
        details.push(base);
      } else if (source.kind === 'curb' || source.kind === 'line') {
        base.rule = source.kind === 'curb' ? 'kerb' : 'line';if(!measurementsOnly){base.baseOffset = 0.04;base.dimensions = { height: curbHeight, width: 0.12 }; base.estimates.push(...(source.kind==='curb'?[`Curb height=${curbHeight} m (no matched vertical measurement; rule default).`,'Curb width=0.12 m (rule default).']:['Pavement-edge line; no vertical measurements supplied.']));}details.push(base);
      } else for (const p of geoPoints(f.geometry)) {
        const q = { ...base, point: point(p) };
        if (source.kind === 'tree' && tags.tpstructure === 'Full') { q.rule = 'tree';if(!measurementsOnly){q.dimensions = { height: 7, crown: 4.2, trunk: 0.3 }; q.estimates.push('Tree height=7 m, crown=4.2 m, trunk=0.3 m (defaults; dimensions not inferred from species).');} }
        else { q.rule = 'point'; q.reference = true; item.status = 'reference'; item.reason = source.kind === 'tree' ? `Tree record ${tags.tpstructure || 'unknown status'} shown as a marker.` : 'Elevation sample marker. Ground subtype alone feeds terrain.'; }
        const elevation=sourceNumber(tags.elevation);if(source.kind==='elevation'&&elevation!==null)q.elevation=elevation*0.3048;
        if(source.kind==='elevation'&&elevation===null)issues.push({id,dataset:source.dataset,code:'missing-elevation',severity:'warning',message:'Missing or invalid elevation; this point cannot supply a terrain height.'});
        details.push(q);
      }
    } catch (e) { item.status = 'skipped'; item.reason = e.message; issues.push({ id, dataset: source.dataset, code: 'invalid-geometry', severity: 'error', message: e.message }); }
  }
  for (const d of details) {
    for (const [key, value] of Object.entries(d.dimensions)) d.attributes[key] ??= { value, unit: 'metres', source: 'rule default', estimated: true };
    if (d.surfaceHeight !== undefined) d.attributes.surfaceOffset = { value: d.surfaceHeight, unit: 'metres', source: infrastructure ? 'Display offset; not a measured physical dimension' : 'Curb rule + display offset', estimated: true };
    if (d.elevation !== undefined) d.attributes.elevation = { value: d.elevation, unit: 'metres', source: 'NYC elevation (feet)', raw: d.tags.elevation, estimated: false };
  }
  for (const d of details) for (const message of d.estimates) issues.push({ id: d.id, dataset: source.dataset, code: 'estimated-detail', severity: 'info', message });
  if(measurementsOnly)for(const item of coverage)if(item.status==='rendered'){item.status='retained';item.reason='Mapped geometry and measurements retained; model construction belongs to rendering.';}
  return { buildings, roads: [], details, coverage, issues, origin, sourceId: source.id };
}
