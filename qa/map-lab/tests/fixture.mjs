import {readFile,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';

// Immutable offline input for regression tests. The browser UI always fetches live data.
export async function loadFixture() {
  return loadPinned('manifest.json');
}
export async function loadFidelityFixture(){return loadPinned('fidelity-manifest.json');}
export async function loadTransportInventoryFixture(){return loadPinned('transport-inventory-manifest.json');}
export async function loadNativeLayerSamples(){return loadPinned('native-layer-manifest.json');}
export async function loadPlanimetricSamples(){return loadPinned('planimetric-manifest.json');}
export async function loadLandContextSamples(){return loadPinned('land-context-manifest.json');}
async function loadPinned(name){
  const directory=new URL('./fixtures/',import.meta.url);
  const manifest=JSON.parse(await readFile(new URL(name,directory),'utf8'));
  const bytes=gunzipSync(await readFile(new URL(manifest.file,directory)));
  if(createHash('sha256').update(bytes).digest('hex')!==manifest.sha256)throw Error('Pinned map fixture checksum mismatch');
  await mkdir('.tmp/map-lab',{recursive:true});
  return JSON.parse(bytes);
}
