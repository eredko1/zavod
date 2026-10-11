
import { NYC_SOURCES, CONEY_BOUNDS, nycURL, datasetURL } from '../data/map-sources.js';
import { queryForArea } from '../data/generator-area.js';
import { MERGE_POLICY_VERSION, MERGE_POLICY_STATUS, MERGE_INVARIANTS, MERGE_POLICIES } from '../pipeline/map-merge-rules.js';
import {RENDER_POLICY_VERSION,RENDER_INVARIANTS,RENDER_POLICIES} from '../render/render-rules.js';
import {ACQUISITION_LIMITS} from '../data/acquisition-limits.js';
export function initHelp(root) {
const $=id=>root.querySelector(`#${id}`);
for(const node of root.querySelectorAll('[data-acquisition-limit]')){const value=node.dataset.acquisitionLimit.split('.').reduce((object,key)=>object[key],ACQUISITION_LIMITS);node.textContent=(node.dataset.unit==='km'?value/1000:node.dataset.unit==='MiB'?value/(1024*1024):value).toLocaleString('en-US');}
$('merge-version').textContent = `Policy v${MERGE_POLICY_VERSION} · ${MERGE_POLICIES.length} feature categories · ${MERGE_POLICY_STATUS}`;
for (const text of MERGE_INVARIANTS) { const li = document.createElement('li'); li.textContent = text; $('merge-invariants').append(li); }
for (const rule of MERGE_POLICIES) {
  const details = document.createElement('details'); details.id = `merge-rule-${rule.id}`; const summary = document.createElement('summary'); summary.textContent = rule.name; details.append(summary);
  const sources = document.createElement('p'); sources.className = 'tag'; sources.textContent = `${rule.id} · ${rule.sources.join(' + ')}`; details.append(sources);
  for (const [title, text] of [['Match evidence', rule.match], ['Geometry', rule.geometry], ['Attributes', rule.attributes], ['Conflicts / missing data', rule.conflicts]]) { const p = document.createElement('p'), strong = document.createElement('strong'); strong.textContent = `${title}: `; p.append(strong, text); details.append(p); }
  const priorities = document.createElement('pre'); priorities.textContent = JSON.stringify({ geometrySources: rule.geometrySources, attributeSources: rule.attributeSources }, null, 2); details.append(priorities); $('merge-catalog').append(details);
}
const renderTitle=document.createElement('h3');renderTitle.textContent=`Rendering rules v${RENDER_POLICY_VERSION}`;$('merge-catalog').append(renderTitle);
for(const text of RENDER_INVARIANTS){const p=document.createElement('p');p.textContent=text;$('merge-catalog').append(p);}
for(const rule of RENDER_POLICIES){const details=document.createElement('details'),summary=document.createElement('summary'),p=document.createElement('p');details.id='render-rule-'+rule.id;summary.textContent=rule.name;p.textContent=rule.description;details.append(summary,p);$('merge-catalog').append(details);}
const rows = {
'mta-stations':['GTFS centroids · station_id, complex_id, gtfs_stop_id, structure, routes and ADA fields','Actual station records retained; reference markers only, no inferred platforms or supports'],
'mta-entrances':['Entrance coordinates · :id, station_id, complex_id, entrance_type, entry_allowed, exit_allowed','Each entrance retained separately by source row ID; station IDs are relationships, no inferred stair geometry or height'],
'nyc-pedestrian-ramps':['Points · rampid, cornerid, geocyclora, curb reveal, widths, lengths, slopes and conditions','Full survey observations retained unchanged; units/sentinels and orientation need validation before modeling pedestrian ramps'],
'nyc-pedestrian-progress':['Points · objectid, cornerid, streets, construction dates/status','Program records complement dated ramp surveys; corner IDs do not combine distinct ramps, no inferred geometry'],
'nyc-lidar-2017':['Lossless LASzip point archives · EPT hierarchy, schema, OriginId inventory, validated LAS/VLR layout and decoded checksums','Acquisition validates every point; renderer decodes intersecting tiles on query by native XYZ bounds/classes/origins. All source depths/attributes retained; reconstruction and datum alignment pending'],
'nysdot-ramps':['Lines · DOTID, RAMP_INTERCHANGE_CODE, BRIDGE_FEATURE_NUMBER, lane/pavement fields','Ramp alignment references; original Z/M retained without treating zero Z as an elevation'],
'nysdot-roadways':['Lines · Roadway_Type, DOT_ID, Direction_ID, bridge BIN, lane/shoulder widths','Road/ramp inventory references; retain every record without inventing OSM node connectivity'],
'nysdot-bridges':['Points · bridge BIN, NumberOfSpans, GTMSStructure/Material, BridgeLengthft, DeckAreaSqFt','Bridge inventory constraints; points do not identify individual columns, piers or foundations'],
'nysdot-overhead-signs':['Points · OBJECTID, AssetID, SIN, AssetStatus, EditedDate, GlobalID','Reported overhead-sign asset locations and status, with all native fields retained; no sign-face, gantry, post or bridge-pier dimensions'],
'nysdot-height-restricted-bridges':['Points · bridge BIN, carried/crossed roles, minimum/posted/permitted clearance, inspection date','Original numeric clearances and status retained as references; zero/sentinel/units require field validation, and one point does not define an underside or ramp grade'],
'usdot-nbi-2023':['Points · federal structure ID, span/deck/approach fields, underclearance codes, pier-protection code','2023 federal bridge reference. Original codes/units and all fields retained; point/clearance values do not locate supports or establish an absolute deck profile'],
'nysdot-bridge-roadway':['Reported Lat/Long points · bridge BIN, route IDs, roadway type and from/to route measures','Original state bridge-to-roadway table rows retained as references; route relationships do not make a measured ramp surface or grade'],
'nyc-roadbed':['Polygons · source_id, sub_code, shape_area, shape_leng','Road surface with holes / islands preserved'],
'nyc-sidewalk':['Polygons · source_id, sub_code','Raised walking surfaces; curb offset estimated'],
'nyc-median':['Polygons · sub_code, street_nam','Physical median geometry; painted areas are 2D references'],
'nyc-curbs':['Lines · source_id, sub_code','Curb beams; matched OSM height, then classification estimate or default'],
'nyc-pavement':['Lines · blockf_id, conflated','Pavement-edge reference geometry'],
'nyc-buildings':['Polygons · doitt_id, bin, height_roof, ground_elevation, feature_code','Footprint extrusion + recorded roof/base heights; cantilever/skybridge codes remain raw clues, not underside clearances'],
'nyc-building-grade':['Centroids · bin, bbl, z_grade, z_floor, subgrade, notes1–3 · reported feet above sea level','Lowest adjacent building grade and estimated lowest active floor retained as references; obstruction notes mark potentially estimated grade. No street elevation, support position or automatic footprint-height replacement'],
'nyc-buildings-2014':['Native I3S triangles · OBJECTID, BIN, DOITT_ID · EGM96 metres','Source identity association retains both dated geometries; rendering owns span/date/detail selection, topology audit and estimated rebasing'],
'nyc-water-tanks':['Polygons · BIN, BASE_ELEVATION, TOP_ELEVATION, HEIGHT, GlobalID · NAVD88 feet','Rooftop tank envelopes with parent, footprint and roof checks; full native responses retained'],
'nyc-trees':['Points · objectid, tpstructure, genusspecies, dbh','Full trees or status markers'],
'nyc-lion':['Lines · SegmentID, PhysicalID, StreetWidth_Min/Max, lanes, TrafDir, POSTED_SPEED','Network references + conservatively matched road attributes'],
'nyc-elevation':['Points · elevation, feat_code, sub_code','Ground interpolation + separate bridge constraints'],
'nyc-transport':['Polygons · feat_code, sub_code','Deck surfaces supported by bridge samples; otherwise outlines'],
'nyc-railroad':['Lines · feat_code, sub_code','Track rails; elevated tracks require a compatible deck profile'],
'nyc-rail-structures':['Polygons · feat_code, sub_code','Station outlines; simple entrance and ventilation footprints'],
'nyc-retaining-walls':['Lines · feat_code, sub_code','Wall beams with logged estimates; matched measured OSM walls take priority'],
'nyc-boardwalk':['Polygons · feat_code, sub_code','Terrain-following footprint; height remains estimated'],
'nyc-shoreline':['Lines · feat_code, sub_code','Reference shoreline, bounded in 3D'],
'nyc-hydro-structures':['Polygons · elevation, feat_code, sub_code','Recorded surface tops in feet; no guessed thickness'],
'nyc-hydrography':['Polygons · feat_code, sub_code','Beach/wetland surfaces; water requires a measured level']};
for(const source of NYC_SOURCES.filter(s=>s.kind==='planimetric-reference'))rows[source.id]=[`${source.geometryType==='esriGeometryPolyline'?'Lines':'Polygons'} · ${[source.idField,...source.requiredFields].join(', ')}${source.nativeHasZ?' · original vertex Z':''}`,`${source.sourceRole} observations, full native coordinates and geographic geometry; reference only, no inferred heights, grades or supports. Same survey lineage as corresponding Socrata exports.`];
for (const source of NYC_SOURCES) { const tr=document.createElement('tr'), info=rows[source.id]; const td=document.createElement('td'), a=document.createElement('a'); a.href=datasetURL(source.dataset); a.textContent=source.name; td.append(a,document.createElement('br')); const code=document.createElement('code');code.textContent=source.id;td.append(code,document.createElement('br'),source.dataset,' · ');const q=document.createElement('a');q.href=nycURL(source,CONEY_BOUNDS);q.textContent=source.kind==='point-cloud'?'EPT entry point':'Area API';td.append(q);tr.append(td);for(const text of info.slice(0,2)){const cell=document.createElement('td');cell.textContent=text;tr.append(cell);}$('source-rows').append(tr); }
$('osm-query').textContent=queryForArea(CONEY_BOUNDS);
const url=nycURL(NYC_SOURCES[0],CONEY_BOUNDS);$('nyc-query-link').href=url;$('nyc-query').textContent=decodeURIComponent(url.replaceAll('+',' '));

}
