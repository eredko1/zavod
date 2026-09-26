
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
'nyc-roadbed':['Polygons · source_id, sub_code, shape_area, shape_leng','Road surface with holes / islands preserved',25],
'nyc-sidewalk':['Polygons · source_id, sub_code','Raised walking surfaces; curb offset estimated',14],
'nyc-median':['Polygons · sub_code, street_nam','Physical median geometry; painted areas are 2D references',12],
'nyc-curbs':['Lines · source_id, sub_code','Curb beams; matched OSM height, then classification estimate or default',57],
'nyc-pavement':['Lines · blockf_id, conflated','Pavement-edge reference geometry',39],
'nyc-buildings':['Polygons · doitt_id, bin, height_roof, ground_elevation, feature_code','Footprint extrusion + recorded roof/base heights',34],
'nyc-trees':['Points · objectid, tpstructure, genusspecies, dbh','Full trees or status markers',109],
'nyc-lion':['Lines · SegmentID, PhysicalID, StreetWidth_Min/Max, lanes, TrafDir, POSTED_SPEED','Network references + conservatively matched road attributes',137],
'nyc-elevation':['Points · source_id, elevation, feat_code, sub_code','Ground interpolation + sample markers',175]};
for (const source of NYC_SOURCES) { const tr=document.createElement('tr'), info=rows[source.id]; const td=document.createElement('td'), a=document.createElement('a'); a.href=datasetURL(source.dataset); a.textContent=source.name; td.append(a,document.createElement('br')); const code=document.createElement('code');code.textContent=source.id;td.append(code,document.createElement('br'),source.dataset,' · ');const q=document.createElement('a');q.href=nycURL(source,CONEY_BOUNDS);q.textContent='Area API';td.append(q);tr.append(td);for(const text of info){const cell=document.createElement('td');cell.textContent=text;tr.append(cell);}$('source-rows').append(tr); }
$('osm-query').textContent=queryForArea(CONEY_BOUNDS);
const url=nycURL(NYC_SOURCES[0],CONEY_BOUNDS);$('nyc-query-link').href=url;$('nyc-query').textContent=decodeURIComponent(url.replaceAll('+',' '));

}
