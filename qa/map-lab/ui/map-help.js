
import { NYC_SOURCES, CONEY_BOUNDS, nycURL, datasetURL } from '../data/map-sources.js';
import { queryForArea } from '../data/generator-area.js';
import { MERGE_POLICY_VERSION, MERGE_POLICY_STATUS, MERGE_INVARIANTS, MERGE_POLICIES } from '../pipeline/map-merge-rules.js';
export function initHelp(root) {
const $=id=>root.querySelector(`#${id}`);
$('merge-version').textContent = `Policy v${MERGE_POLICY_VERSION} · ${MERGE_POLICIES.length} feature categories · ${MERGE_POLICY_STATUS}`;
for (const text of MERGE_INVARIANTS) { const li = document.createElement('li'); li.textContent = text; $('merge-invariants').append(li); }
for (const rule of MERGE_POLICIES) {
  const details = document.createElement('details'); details.id = `merge-rule-${rule.id}`; const summary = document.createElement('summary'); summary.textContent = rule.name; details.append(summary);
  const sources = document.createElement('p'); sources.className = 'tag'; sources.textContent = `${rule.id} · ${rule.sources.join(' + ')}`; details.append(sources);
  for (const [title, text] of [['Match evidence', rule.match], ['Geometry', rule.geometry], ['Attributes', rule.attributes], ['Conflicts / missing data', rule.conflicts]]) { const p = document.createElement('p'), strong = document.createElement('strong'); strong.textContent = `${title}: `; p.append(strong, text); details.append(p); }
  const priorities = document.createElement('pre'); priorities.textContent = JSON.stringify({ geometrySources: rule.geometrySources, attributeSources: rule.attributeSources }, null, 2); details.append(priorities); $('merge-catalog').append(details);
}
const rows = {
'nyc-roadbed':['Polygons · source_id, sub_code, shape_area, shape_leng','Road surface with holes / islands preserved'],
'nyc-sidewalk':['Polygons · source_id, sub_code','Raised walking surfaces; curb offset estimated'],
'nyc-median':['Polygons · sub_code, street_nam','Physical median geometry; painted areas are 2D references'],
'nyc-curbs':['Lines · source_id, sub_code','Curb beams; matched OSM height, then classification estimate or default'],
'nyc-pavement':['Lines · blockf_id, conflated','Pavement-edge reference geometry'],
'nyc-buildings':['Polygons · doitt_id, bin, height_roof, ground_elevation, feature_code','Footprint extrusion + recorded roof/base heights'],
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
for (const source of NYC_SOURCES) { const tr=document.createElement('tr'), info=rows[source.id]; const td=document.createElement('td'), a=document.createElement('a'); a.href=datasetURL(source.dataset); a.textContent=source.name; td.append(a,document.createElement('br')); const code=document.createElement('code');code.textContent=source.id;td.append(code,document.createElement('br'),source.dataset,' · ');const q=document.createElement('a');q.href=nycURL(source,CONEY_BOUNDS);q.textContent='Area API';td.append(q);tr.append(td);for(const text of info.slice(0,2)){const cell=document.createElement('td');cell.textContent=text;tr.append(cell);}$('source-rows').append(tr); }
$('osm-query').textContent=queryForArea(CONEY_BOUNDS);
const url=nycURL(NYC_SOURCES[0],CONEY_BOUNDS);$('nyc-query-link').href=url;$('nyc-query').textContent=decodeURIComponent(url.replaceAll('+',' '));

}
