// Serverless multiplayer over a free public MQTT broker (WebSockets). Owned by: main.
// Each client publishes {x,y,z,yaw,name} 10x/s to zavod/<map>/<room>/p/<id> and renders everyone else as a figure.
// ?room=<name> picks a room (default 'public'), ?mp=0 disables, ?name=<callsign>. No authority, no hit sync — presence only.
import * as THREE from 'three';
const BROKER = 'wss://broker.hivemq.com:8884/mqtt';
let S = null;
export async function init(ctx) {
  if (ctx.qs.get('mp') === '0' || ctx.qa && ctx.qs.get('mp') !== '1') return null;
  let mqtt; try { mqtt = (await import('https://cdn.jsdelivr.net/npm/mqtt@5.10.1/dist/mqtt.esm.js')).default; } catch (e) { console.warn('[net] mqtt lib unavailable', e); return null; }
  const id = Math.random().toString(36).slice(2, 10), room = (ctx.qs.get('room') || 'public').replace(/[^\w-]/g, '').slice(0, 24) || 'public';
  const name = (ctx.qs.get('name') || 'OP-' + id.slice(0, 4).toUpperCase()).slice(0, 16);
  const base = `zavod/${ctx.world?.mapId || 'zavod'}/${room}/p/`;
  const client = mqtt.connect(BROKER, { clientId: 'zv_' + id, clean: true, connectTimeout: 8000, reconnectPeriod: 3000 });
  const peers = new Map();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a6fd8, roughness: 0.6 }), headMat = new THREE.MeshStandardMaterial({ color: 0xe0b890, roughness: 0.7 });
  const makePeer = (pid, nm) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.0, 4, 10), bodyMat); body.position.y = 0.8; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), headMat); head.position.y = 1.62; g.add(head);
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(0, 8, 256, 48); x.fillStyle = '#9fd0ff'; x.fillText(nm, 128, 44);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); tag.scale.set(1.6, 0.4, 1); tag.position.y = 2.15; g.add(tag);
    ctx.scene.add(g); const p = { g, target: new THREE.Vector3(), yaw: 0, seen: performance.now() }; peers.set(pid, p); return p;
  };
  client.on('connect', () => { client.subscribe(base + '+'); console.log('[net] connected', room, name); });
  client.on('message', (topic, buf) => {
    const pid = topic.slice(base.length); if (pid === id) return;
    let m; try { m = JSON.parse(buf.toString()); } catch { return; }
    if (m.bye) { const p = peers.get(pid); if (p) { ctx.scene.remove(p.g); peers.delete(pid); } return; }
    const p = peers.get(pid) || makePeer(pid, String(m.n || '?').slice(0, 16));
    p.target.set(+m.x || 0, +m.y || 0, +m.z || 0); p.yaw = +m.r || 0; p.seen = performance.now();
    if (!p.placed) { p.g.position.copy(p.target); p.placed = true; }
  });
  addEventListener('beforeunload', () => { try { client.publish(base + id, JSON.stringify({ bye: 1 })); client.end(true); } catch {} });
  S = { ctx, client, id, base, name, peers, t: 0, room };
  ctx.bus.emit?.('net:ready', { room, name });
  return { get peers() { return peers.size; }, room, name };
}
export function update(dt, ctx) {
  if (!S) return;
  S.t += dt;
  const pl = ctx.player; const pos = pl?.position;
  if (pos && S.t > 0.1 && S.client.connected) { S.t = 0; S.client.publish(S.base + S.id, JSON.stringify({ x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2), r: +(pl.yaw || 0).toFixed(2), n: S.name })); }
  const now = performance.now();
  for (const [pid, p] of S.peers) {
    if (now - p.seen > 5000) { ctx.scene.remove(p.g); S.peers.delete(pid); continue; }
    p.g.position.lerp(p.target, 1 - Math.exp(-dt * 12)); p.g.rotation.y = p.yaw;
  }
}
