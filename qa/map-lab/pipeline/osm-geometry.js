// Overpass JSON -> drawable paths. Preserve gaps and join multipolygon members before filling.
const valid = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon);
const same = (a, b) => a.lat === b.lat && a.lon === b.lon;
export function runs(geometry = []) {
  const result = []; let run = [];
  for (const p of geometry) { if (valid(p)) run.push(p); else if (run.length) { result.push(run); run = []; } }
  if (run.length) result.push(run); return result;
}
export function joinRings(parts) {
  const pending = parts.map(p => p.slice()), result = [];
  while (pending.length) {
    let ring = pending.shift(), changed = true;
    while (changed && !same(ring[0], ring[ring.length - 1])) {
      changed = false;
      for (let i = 0; i < pending.length; i++) {
        const p = pending[i], first = ring[0], last = ring[ring.length - 1];
        if (same(last, p[0])) ring.push(...p.slice(1));
        else if (same(last, p[p.length - 1])) ring.push(...p.slice(0, -1).reverse());
        else if (same(first, p[p.length - 1])) ring = p.slice(0, -1).concat(ring);
        else if (same(first, p[0])) ring = p.slice(1).reverse().concat(ring);
        else continue;
        pending.splice(i, 1); changed = true; break;
      }
    }
    result.push(ring);
  }
  return result;
}
export function category(tags = {}, type = 'way') {
  if (type === 'node') return Object.keys(tags).length ? 'points' : 'vertices';
  if (tags.building || tags['building:part']) return 'buildings';
  if (tags.highway) return /^(footway|path|pedestrian|steps|cycleway|bridleway)$/.test(tags.highway) ? 'paths' : 'roads';
  if (tags.railway || tags.route === 'subway' || tags.route === 'train') return 'rail';
  if (tags.natural === 'water' || tags.water || tags.waterway) return 'water';
  if (tags.landuse || tags.leisure || tags.natural) return 'land';
  return 'other';
}
function area(tags) {
  if (tags.area === 'no') return false;
  if (tags.area === 'yes') return true;
  return !!(tags.building || tags['building:part'] || tags.landuse || tags.leisure || tags.water ||
    (tags.natural && !/^(coastline|cliff|ridge|tree_row)$/.test(tags.natural)) ||
    ['parking', 'fountain', 'waste_disposal'].includes(tags.amenity) || tags.railway === 'platform' || tags.public_transport === 'platform');
}
export function normalize(elements) {
  const nodes = new Map(elements.filter(e => e.type === 'node' && valid(e)).map(e => [e.id, e]));
  const ways = new Map(elements.filter(e => e.type === 'way').map(e => [e.id, e]));
  const result = [], seen = new Set();
  const geometry = e => e.geometry || (e.nodes || []).map(id => nodes.get(id) || null);
  for (const e of elements) {
    const id = `${e.type}/${e.id}`; if (seen.has(id)) continue; seen.add(id);
    const tags = e.tags || {}; let paths = [], isArea = false;
    if (e.type === 'node' && valid(e)) paths = [[e]];
    else if (e.type === 'way') { paths = runs(geometry(e)); isArea = area(tags); }
    else if (e.type === 'relation') {
      const members = (e.members || []).filter(m => m.type === 'way').map(m => ({ role: m.role, parts: runs(m.geometry || geometry(ways.get(m.ref) || {})) }));
      isArea = tags.type === 'multipolygon' || tags.type === 'boundary';
      if (isArea) {
        const outer = joinRings(members.filter(m => !m.role || m.role === 'outer').flatMap(m => m.parts));
        const inner = joinRings(members.filter(m => m.role === 'inner').flatMap(m => m.parts));
        paths = outer.concat(inner);
        // A clipped outer ring cannot define a fill; do not paint a surviving courtyard as land.
        isArea = outer.length > 0 && outer.every(p => p.length > 3 && same(p[0], p[p.length - 1]));
      } else paths = members.flatMap(m => m.parts);
    }
    if (!paths.length) continue;
    result.push({ id, type: e.type, tags, category: category(tags, e.type), paths: paths.map(p => ({ points: p, closed: isArea && p.length > 3 && same(p[0], p[p.length - 1]) })) });
  }
  return result;
}
