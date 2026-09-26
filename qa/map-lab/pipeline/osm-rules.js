// Feature rules produce renderer-independent geometry instructions. Defaults are explicit estimates.
export function detailsFromOSM(features, project, polygons, length, issue, curbDefault) {
  const details = [];
  for (const f of features) {
    const t = f.tags, active = v => v !== undefined && v !== 'no';
    if (active(t.building) || active(t['building:part']) || (t.highway && f.type === 'way')) continue;
    if (!Object.keys(t).length || (f.type === 'relation' && ['route', 'route_master', 'restriction', 'public_transport', 'building', 'site'].includes(t.type))) continue;
    const paths = f.paths.map(p => p.points.map(project)), shapes = polygons(f.paths, project);
    const base = { id: f.id, tags: t, paths, shapes, rule: '', dimensions: {}, estimates: [], attributes: {}, rotation: 0 };
    const dim = (key, tag, fallback) => { const n = length(t[tag]); base.dimensions[key] = n > 0 ? n : fallback; base.attributes[key] = { value: base.dimensions[key], unit: 'metres', source: n > 0 ? 'OSM' : 'rule default', tag, raw: t[tag] ?? null, estimated: !(n > 0) }; if (!(n > 0)) base.estimates.push(`${key}=${fallback} m (default; ${tag} absent/unusable)`); return base.dimensions[key]; };
    const curb = () => {
      const tags=f.type==='node'?['kerb:height','height']:['height','kerb:height'];
      const classification=['flush','no','lowered'].includes(t.kerb),tag=tags.find(key=>length(t[key])!==null), value=tag?length(t[tag]):t.kerb==='flush'||t.kerb==='no'?0:t.kerb==='lowered'?.03:curbDefault;
      const reason=tag?'Explicit tagged height':t.kerb==='flush'||t.kerb==='no'?'Zero offset inferred from curb classification':t.kerb==='lowered'?'3 cm estimate from lowered classification':'No usable curb height; configured default';
      return {value,unit:'metres',source:tag?'OSM':classification?'OSM classification':'rule default',tag:tag||'kerb',raw:t[tag||'kerb']??null,estimated:!tag,reason};
    };
    if (f.type === 'node') {
      base.point = paths[0][0];
      if (t.natural === 'tree') { base.rule = 'tree'; const h = dim('height', 'height', 7); dim('crown', 'diameter_crown', Math.min(5, h * 0.6)); const c = length(t.circumference); base.dimensions.trunk = c > 0 ? c / Math.PI : 0.3; if (!(c > 0)) base.estimates.push('trunk diameter=0.3 m (default)'); }
      else if (t.amenity === 'bench') { base.rule = 'bench'; dim('length', 'length', 1.8); dim('width', 'width', 0.55); dim('height', 'height', 0.9); }
      else if (t.highway === 'street_lamp') { base.rule = 'lamp'; dim('height', 'height', 6); }
      else if (t.highway === 'traffic_signals') { base.rule = 'signal'; dim('height', 'height', 3); }
      else if (t.highway === 'bus_stop' || t.highway === 'stop' || t.man_made === 'flagpole') { base.rule = 'pole'; dim('height', 'height', t.man_made === 'flagpole' ? 6 : 2.5); }
      else if (t.barrier === 'bollard') { base.rule = 'bollard'; dim('height', 'height', 0.9); dim('width', 'width', 0.2); }
      else if (t.barrier === 'gate' || t.barrier === 'lift_gate') { base.rule = 'gate'; dim('height', 'height', 1.1); dim('width', 'width', 1.5); }
      else if (t.amenity === 'waste_basket' || t.amenity === 'waste_disposal') { base.rule = 'bin'; dim('height', 'height', 1); dim('width', 'width', 0.6); }
      else { base.rule = 'point'; base.reference = true; issue(f.id, 'point-reference', 'Point marker only: no mapped object outline or supported solid rule.', 'info'); }
      if(t.barrier==='kerb'){const h=curb();base.attributes.curbHeight=h;if(h.estimated)base.estimates.push(`curb height=${h.value} m (${h.reason})`);issue(f.id,'curb-point-reference','Curb height retained at this point; local ramp shaping is not implemented. It does not set the height of an entire sidewalk.','info');}
      if (['bench', 'gate'].includes(base.rule)) {
        const direction = t.direction ?? t['bench:direction'];
        if (direction !== undefined && String(direction).trim() && Number.isFinite(Number(direction))) base.rotation = -Number(direction) * Math.PI / 180;
        else base.estimates.push('orientation=north (default; direction absent/unusable)');
      }
    } else {
      const area = shapes.length && !f.paths.some(p => !p.closed);
      if (active(t.barrier)) {
        base.rule = t.barrier === 'kerb' ? 'kerb' : t.barrier === 'wall' || t.barrier === 'retaining_wall' ? 'wall' : t.barrier === 'hedge' ? 'hedge' : 'fence';
        if(base.rule==='kerb'){const h=curb();base.dimensions.height=h.value;base.attributes.height=h;if(h.estimated)base.estimates.push(`height=${h.value} m (${h.reason})`);}else dim('height','height',base.rule==='wall'?1.5:1.2); dim('width', 'width', base.rule === 'hedge' ? 0.6 : base.rule === 'wall' ? 0.25 : 0.08);
        // One object can have both park-area and fence-boundary tags.
        base.surface = area && !!(t.leisure || t.landuse);
      } else if (t.natural === 'tree_row') { base.rule = 'tree-row'; dim('height', 'height', 7); dim('spacing', 'tree_spacing', 6); }
      else if (t.railway && t.railway !== 'platform') { base.rule = 'rail'; dim('width', 'width', 1.5); }
      else if (area) { base.rule = 'surface'; base.surface = true; }
      else { base.rule = 'line'; base.reference = true; issue(f.id, 'line-reference', 'Mapped line only: no complete surface or supported solid rule.', 'info'); }
      if (base.surface) base.surfaceKind = t.natural === 'water' || t.water || t.amenity === 'fountain' ? 'water' : t.leisure === 'pitch' ? 'pitch' : t.amenity === 'parking' || t.railway === 'platform' || t.public_transport === 'platform' ? 'paved' : 'land';
      if (f.paths.some(p => !p.closed) && (t.type === 'multipolygon' || t.area === 'yes')) issue(f.id, 'partial-area', 'Incomplete area: showing returned boundary segments only.', 'warning');
      if (t.tunnel || t.bridge || Number(t.layer)) issue(f.id, 'flat-detail', 'Elevation/structure tag present; geometry shown on flat reference ground.', 'warning');
    }
    if (base.estimates.length) issue(f.id, 'estimated-detail', `${base.rule}: ${base.estimates.join('; ')}.`, 'info');
    details.push(base);
  }
  return details;
}
