// The preview resolves sources only; 3D additionally prepares models. Hidden providers cannot suppress visible alternatives.
import { DEFAULTS, planFromOSM, projection } from './osm-model.js';
import { planFromNYC } from './nyc-model.js';
import { mergePlan } from './map-merge.js';
import { CONEY_BOUNDS } from '../data/generator-area.js';
import {runBuildStages} from './build-stages.js';
import {prepareRenderPlan} from '../render/render-plan.js';
import {sourceInventories} from './source-inventory.js';
export const GEOMETRY_DEFAULTS = Object.freeze({ storey: DEFAULTS.storey, curb: DEFAULTS.curb, terrain: true });
export const FEATURE_GROUPS = ['buildings','roads','details'];
export function resolveMap(result, options = {}, mark = () => {}) {
  return runBuildStages(resolveMapStages(result,options),mark);
}
export function resolveSources(result,_renderOptions={},mark=()=>{}){return runBuildStages(resolveSourceStages(result),mark);}
export function* resolveMapStages(result,options={}){
  const merged=yield* resolveSourceStages(result);
  yield 'renderModels';return prepareRenderPlan(merged,result,{...GEOMETRY_DEFAULTS,...options});
}
export function* resolveSourceStages(result){
  yield 'normalize';
  const snaps = result.nyc || [], bounds = result.bounds || snaps[0]?.bounds || CONEY_BOUNDS;
  const base = result.data?.elements?.length ? planFromOSM(result.data, {measurementsOnly:true}) : { origin: [(bounds.south+bounds.north)/2,(bounds.west+bounds.east)/2], buildings:[], roads:[], details:[], coverage:[], issues:[], options: {measurementsOnly:true}, counts:{} };
  const project = projection(...base.origin);
  base.sourceRecords=sourceInventories(result);
  const include = b => { const [x0,z1]=project({lat:b.south,lon:b.west}),[x1,z0]=project({lat:b.north,lon:b.east}), old=base.bounds; base.bounds=old?{x0:Math.min(old.x0,x0),x1:Math.max(old.x1,x1),z0:Math.min(old.z0,z0),z1:Math.max(old.z1,z1)}:{x0,x1,z0,z1}; };
  // Overpass includes neighbouring vertices outside out geom(bounds); they must not resize the scene.
  if(result.bounds)base.bounds=null;
  if (!base.bounds) include(bounds);
  for (const snap of snaps) { const p=planFromNYC(snap,base.origin,undefined,true); for(const key of [...FEATURE_GROUPS,'coverage','issues'])base[key].push(...p[key]); if(!result.bounds)include(snap.bounds); }
  const hidden=new Set(result.hiddenOSM||[]),disabled=new Set(snaps.filter(s=>s.visible===false).map(s=>s.sourceId));
  for(const c of base.coverage)if(disabled.has(c.sourceId))hidden.add(c.id);
  const selected=f=>!disabled.has(f.sourceId)&&!hidden.has(f.id);
  for(const key of FEATURE_GROUPS)base[key]=base[key].filter(selected);
  // Keep topology before surface coverage removes represented centreline spans.
  base.roadNetwork=base.roads.filter(f=>f.nodes).map(f=>({id:f.id,nodes:f.nodes,points:f.paths[0],tags:f.tags,path:f.path,width:f.width}));
  base.issues=base.issues.filter(i=>selected(i));
  for(const c of base.coverage)if(!selected(c)){c.status='hidden';c.reason='Source/category excluded from this merge selection.';}
  yield 'merge';const plan=mergePlan(base,result.mergeEnabled!==false);
  plan.observations.acquisitionFailures=result.acquisitionFailures||[];return plan;
}
