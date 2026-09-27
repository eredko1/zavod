import {sourceNumber} from '../data/source-number.js';

export const INFRASTRUCTURE_KINDS = new Set(['transport','railroad','rail-structures','retaining-walls','boardwalk','shoreline','hydro-structures','hydrography']);
const TYPES={transport:{2300:'road-bridge',2310:'tunnel',2320:'rail-bridge',2330:'pedestrian-bridge',2340:'rail-viaduct',2350:'overpass'},railroad:{2400:'rail',2410:'elevated-rail',2420:'embankment-rail',2430:'viaduct-rail',2440:'cutting-rail',2450:'rail-fence',2465:'abandoned-rail'},'rail-structures':{2140:'elevated-station',2160:'station',2470:'ventilation-grate',2480:'emergency-exit',2485:'transit-entrance'},'retaining-walls':{4000:'retaining-wall',2460:'rail-retaining-wall'},boardwalk:{4300:'boardwalk'},shoreline:{3900:'shoreline'},'hydro-structures':{2800:'pier',2810:'jetty',2820:'seawall'},hydrography:{2600:'lake',2610:'pond',2620:'river',2630:'stream',2640:'wetland',2650:'beach',2660:'ocean'}};
const REFERENCE_OFFSET=.06, SURFACE_OFFSET=.04, DEFAULT_GAUGE=1.435;
export const INFRASTRUCTURE_DEFAULTS=Object.freeze({wallHeight:1.5,wallWidth:.25,fenceHeight:1.2,fenceWidth:.08});

// Source classifications are physical roles, not evidence of dimensions or deck elevation.
export function infrastructureFeature(base,source,item,issues){
  const kind=source.kind,type=TYPES[kind][Number(base.tags.feat_code)];
  base.infrastructure=type||'unknown';base.rule='reference';base.reference=true;
  const reference=message=>{base.surfaceHeight=REFERENCE_OFFSET;item.status='reference';item.reason=message;issues.push({id:base.id,dataset:source.dataset,code:'infrastructure-reference',severity:'warning',message});};
  if(!type){reference(`Unsupported ${kind} feature code ${base.tags.feat_code}; original geometry retained as an outline.`);return base;}
  if(kind==='transport'){
    base.requiresElevation=true;reference(`${type}: deck elevation must be resolved independently of ground. Unresolved structures remain outlines.`);
  }else if(kind==='railroad'&&!['rail-fence','abandoned-rail'].includes(type)){
    base.rule='rail';base.dimensions={width:DEFAULT_GAUGE};base.attributes.width={value:DEFAULT_GAUGE,unit:'metres',estimated:true,source:'rail gauge default'};
    base.requiresElevation=type!=='rail'||String(base.tags.sub_code)!=='240000';base.reference=base.requiresElevation;
    if(base.requiresElevation)reference(`${type}: no measured height in the railroad response; needs an unambiguous structure/elevation association.`);
    else{item.status='rendered';base.estimates.push('Rail elevation follows interpolated terrain; gauge uses the standard-gauge rule until matched to a tagged track.');}
  }else if(kind==='retaining-walls'||type==='rail-fence'){
    const wall=kind==='retaining-walls';base.rule=wall?'wall':'fence';base.reference=false;base.dimensions={height:wall?INFRASTRUCTURE_DEFAULTS.wallHeight:INFRASTRUCTURE_DEFAULTS.fenceHeight,width:wall?INFRASTRUCTURE_DEFAULTS.wallWidth:INFRASTRUCTURE_DEFAULTS.fenceWidth};
    base.estimates.push(`${type}: simple ${base.rule} on the mapped alignment; height=${base.dimensions.height} m and width=${base.dimensions.width} m are rule estimates. Ground placement does not establish the retaining wall's actual top or bottom.`);
  }else if(kind==='boardwalk'||type==='beach'||type==='wetland'||['ventilation-grate','emergency-exit','transit-entrance'].includes(type)){
    base.rule='surface';base.reference=false;base.surface=true;base.surfaceKind=kind==='boardwalk'?'wood':type==='beach'?'sand':type==='wetland'?'land':'paved';base.surfaceHeight=SURFACE_OFFSET;
    base.estimates.push(`${type} follows interpolated terrain with ${SURFACE_OFFSET} m display offset; no surveyed local surface height.`);
  }else if(kind==='hydro-structures'){
    const elevation=sourceNumber(base.tags.elevation);
    if(elevation!==null){base.rule='surface';base.reference=false;base.surface=true;base.surfaceKind='paved';base.surfaceHeight=0;base.absoluteElevation=elevation*.3048;base.attributes.elevation={value:base.absoluteElevation,unit:'metres',raw:base.tags.elevation,source:'NYC hydro structure elevation (feet)',estimated:false};base.estimates.push('Surface top only; thickness/supports are unknown. Elevation datum alignment with NYC ground samples is provisional.');}
    else reference(`${type}: footprint retained; no usable surface elevation or structure height.`);
  }else if(kind==='hydrography'){
    base.requiresWaterElevation=true;reference(`${type}: water outline retained until a compatible water-level observation is available; no sloping water surface is inferred from ground.`);
  }else reference(`${type}: outline retained; no verified height/depth for a solid. Station outlines may describe roofs, not platforms.`);
  return base;
}
