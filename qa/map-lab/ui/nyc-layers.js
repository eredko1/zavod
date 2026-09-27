import {eventScope} from './event-scope.js';
import { NYC_SOURCES, datasetURL, NYC_MEDIAN_TYPES, geoPolygons, geoLines, geoPoints, featureID, sourceFeatures } from '../data/map-sources.js';
import { sourceControls } from './source-controls.js';

export function initNYCLayers({ root, svg, project, mapBounds, inspected, changed, mergeDecision }) {
const events=eventScope();
let featureEvents=eventScope();
  const $ = id => root.querySelector(`#${id}`); let controls;
  const element = (name, text, parent) => { const e = document.createElement(name); if (text) e.textContent = text; parent?.append(e); return e; };
  function render() {
    featureEvents.dispose();featureEvents=eventScope();
    svg.querySelectorAll('[data-nyc-source]').forEach(e => e.remove());
    for (const source of NYC_SOURCES) {
      const s = controls.states.get(source.id); if (!s.snapshot) continue;
      const group = document.createElementNS(svg.namespaceURI, 'g'); group.dataset.nycSource = source.id; group.toggleAttribute('hidden', !s.visible.checked); svg.append(group);
      for (const feature of sourceFeatures(source,s.snapshot.data.features)) {
        // The merge/coverage log retains the invalid record and its validation error.
        if(feature.geometryError)continue;
        const path = document.createElementNS(svg.namespaceURI, 'path');
        const toPath = ring => ring.map((p, i) => `${i ? 'L' : 'M'}${project({ lon: p[0], lat: p[1] }).join(',')}`).join(' ');
        const d = [...geoPolygons(feature.geometry).flatMap(polygon => polygon.map(ring => toPath(ring) + ' Z')), ...geoLines(feature.geometry).map(toPath), ...geoPoints(feature.geometry).map(p => { const [x, z] = project({ lon: p[0], lat: p[1] }); return `M${x - 0.8} ${z}a0.8 0.8 0 1 0 1.6 0a0.8 0.8 0 1 0 -1.6 0`; })].join(' ');
        path.setAttribute('d', d); path.setAttribute('fill-rule', 'evenodd'); path.setAttribute('fill', geoLines(feature.geometry).length ? 'none' : source.color); path.setAttribute('fill-opacity', '0.4'); path.setAttribute('stroke', source.color); path.setAttribute('stroke-width', '1.4'); path.setAttribute('vector-effect', 'non-scaling-stroke'); path.dataset.nycFeature = featureID(source, feature);
        path.style.cursor = 'pointer'; featureEvents.on(path,'click', e => { if (e.detail) return; inspected(); const title = element('strong', `${source.name} · ${featureID(source, feature)}`), link = element('a', `Dataset ${source.dataset} ↗`), tags = element('pre'); link.href = datasetURL(source.dataset); link.target = '_blank'; link.rel = 'noopener'; tags.textContent = JSON.stringify({ properties: feature.properties, merge: mergeDecision?.(featureID(source,feature)) }, null, 2); const note = element('p', (source.kind === 'median' ? (NYC_MEDIAN_TYPES[feature.properties.sub_code] || 'Unclassified median') + '. ' : '') + 'Original NYC properties. GeoJSON coordinates are longitude/latitude; polygon holes are preserved.'); $('details').replaceChildren(title, element('br'), link, tags, note); e.stopPropagation(); });
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
  return { ...controls, render,dispose(){events.dispose();featureEvents.dispose();controls.dispose();down=null;} };
}
