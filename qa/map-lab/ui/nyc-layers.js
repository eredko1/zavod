import {eventScope} from './event-scope.js';
import { NYC_SOURCES, datasetURL, NYC_MEDIAN_TYPES, geoPolygons, geoLines, geoPoints, featureID, sourceFeatures } from '../data/map-sources.js';
import { sourceControls } from './source-controls.js';

export function initNYCLayers({ root, svg, project, mapBounds, inspected, changed, mergeDecision }) {
const events=eventScope();
const rendered=new Map();
  const $ = id => root.querySelector(`#${id}`); let controls;
  const element = (name, text, parent) => { const e = document.createElement(name); if (text) e.textContent = text; parent?.append(e); return e; };
  const release=entry=>{entry.events.dispose();entry.group.remove();};
  function render({force=false}={}) {
    for (const source of NYC_SOURCES) {
      const s = controls.states.get(source.id),previous=rendered.get(source.id);
      if(!s.snapshot){if(previous){release(previous);rendered.delete(source.id);}continue;}
      if(!force&&previous?.data===s.snapshot.data&&previous.group.parentNode===svg){previous.group.toggleAttribute('hidden',!s.visible.checked);continue;}
      if(previous)release(previous);
      const featureEvents=eventScope(),group = document.createElementNS(svg.namespaceURI, 'g'); group.dataset.nycSource = source.id; group.toggleAttribute('hidden', !s.visible.checked);
      const next=NYC_SOURCES.slice(NYC_SOURCES.indexOf(source)+1).map(s=>rendered.get(s.id)?.group).find(group=>group?.parentNode===svg);svg.insertBefore(group,next||null);
      rendered.set(source.id,{data:s.snapshot.data,group,events:featureEvents});
      for (const feature of sourceFeatures(source,s.snapshot.data.features)) {
        // The merge/coverage log retains the invalid record and its validation error.
        if(feature.geometryError)continue;
        const path = document.createElementNS(svg.namespaceURI, 'path');
        const toPath = ring => ring.map((p, i) => `${i ? 'L' : 'M'}${project({ lon: p[0], lat: p[1] }).join(',')}`).join(' ');
        const d = [...geoPolygons(feature.geometry).flatMap(polygon => polygon.map(ring => toPath(ring) + ' Z')), ...geoLines(feature.geometry).map(toPath), ...geoPoints(feature.geometry).map(p => { const [x, z] = project({ lon: p[0], lat: p[1] }); return `M${x - 0.8} ${z}a0.8 0.8 0 1 0 1.6 0a0.8 0.8 0 1 0 -1.6 0`; })].join(' ');
        path.setAttribute('d', d); path.setAttribute('fill-rule', 'evenodd'); path.setAttribute('fill', geoLines(feature.geometry).length ? 'none' : source.color); path.setAttribute('fill-opacity', '0.4'); path.setAttribute('stroke', source.color); path.setAttribute('stroke-width', '1.4'); path.setAttribute('vector-effect', 'non-scaling-stroke'); path.dataset.nycFeature = featureID(source, feature);
        path.style.cursor = 'pointer'; featureEvents.on(path,'click', e => { if (e.detail) return; inspected(); const title = element('strong', `${source.name} · ${featureID(source, feature)}`), link = element('a', `Dataset ${source.dataset} ↗`), tags = element('pre'); link.href = datasetURL(source.dataset); link.target = '_blank'; link.rel = 'noopener'; tags.textContent = JSON.stringify({ properties: feature.properties, merge: mergeDecision?.(featureID(source,feature)) }, null, 2); const note = element('p', (source.kind === 'median' ? (NYC_MEDIAN_TYPES[feature.properties.sub_code] || 'Unclassified median') + '. ' : '') + 'Original source properties. GeoJSON coordinates are longitude/latitude; polygon holes are preserved.'); $('details').replaceChildren(title, element('br'), link, tags, note); e.stopPropagation(); });
        group.append(path);
      }
    }
    changed();
  }
  // SVG owns drag/pan capture, so remember the original target and inspect only a stationary pointer-up.
  let down = null;
  events.on(svg,'pointerdown', e => { down = e.target.dataset.nycFeature ? { target: e.target, x: e.clientX, y: e.clientY, dragged: false } : null; });
  events.on(svg,'pointermove', e => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) >= 5) down.dragged = true; });
  events.on(svg,'pointerup', e => { if (down && !down.dragged && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) down.target.dispatchEvent(new MouseEvent('click')); down = null; });
  events.on(svg,'pointercancel', () => { down = null; });
  controls = sourceControls({ root:$('nyc-sources'), mapBounds, changed: id => {
    // Visibility keeps existing paths, masks and inspection targets; it is not a source reload.
    const group=[...svg.querySelectorAll('[data-nyc-source]')].find(g=>g.dataset.nycSource===id);
    group?.toggleAttribute('hidden',!controls.states.get(id).visible.checked);
    inspected();changed('visibility');
  } });
  return { ...controls, render,dispose(){events.dispose();for(const entry of rendered.values())release(entry);rendered.clear();controls.dispose();down=null;} };
}
