// GeoJSON uses longitude, latitude. Reject missing/coerced coordinates before projection.
export function sourceCoordinate(value) {
  if (!Array.isArray(value) || !Number.isFinite(value[0]) || !Number.isFinite(value[1]) || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) throw new Error('Invalid coordinate');
  return { lon: value[0], lat: value[1] };
}
