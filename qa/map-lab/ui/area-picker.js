import {eventScope} from './event-scope.js';
import { CONEY_BOUNDS, NEIGHBOR_BOUNDS, validateArea, areaDimensions } from '../data/generator-area.js';
import { MAX_MAP_LATITUDE, MIN_ZOOM, MAX_ZOOM, areaCenter, mapPoint, centeredArea, panArea, fitAreaZoom } from '../data/area-view.js';
import { createAreaTiles } from './area-tiles.js';

const TILE_SETTLE_MS=180, KEY_PAN_PIXELS=40;
export function createAreaPicker(dialog,{onApply}) {
const events=eventScope();
  const $=id=>dialog.querySelector(`#${id}`),map=$('area-map'),box=$('area-box');
  let bounds={...CONEY_BOUNDS},zoom=16,drag=null,timer=null;
  const tiles=createAreaTiles($('area-tiles'),{onError:()=>{$('area-map-status').textContent='Basemap unavailable. Bounds and presets still work.';}});
  const size=()=>({width:map.clientWidth,height:map.clientHeight});
  function draw(load=true){
    if(!dialog.open)return;
    const {width,height}=size(),center=areaCenter(bounds),p=mapPoint(center,zoom),a=mapPoint({lat:bounds.north,lon:bounds.west},zoom),b=mapPoint({lat:bounds.south,lon:bounds.east},zoom);
    tiles.render(center,zoom,width,height,{load});
    Object.assign(box.style,{left:`${width/2+a.x-p.x}px`,top:`${height/2+a.y-p.y}px`,width:`${b.x-a.x}px`,height:`${b.y-a.y}px`});
    const d=areaDimensions(bounds);$('area-size-label').textContent=`${Math.round(d.width)} × ${Math.round(d.height)} m`;
    $('area-map').setAttribute('aria-label',`Drag to choose an area. Center ${center.lat.toFixed(5)}, ${center.lon.toFixed(5)}. Arrow keys pan; plus and minus zoom.`);
    $('area-zoom-in').disabled=zoom===MAX_ZOOM;$('area-zoom-out').disabled=zoom===MIN_ZOOM;
  }
  function settle(){clearTimeout(timer);timer=setTimeout(()=>draw(),TILE_SETTLE_MS);}
  function fit(){const s=size();zoom=fitAreaZoom(bounds,s.width,s.height);draw();}
  function setDraft(next){bounds={...validateArea(next)};$('area-map-status').textContent='';fit();}
  function finishDrag(load=true){if(!drag)return;const id=drag.id;drag=null;map.classList.remove('dragging');if(map.hasPointerCapture(id))map.releasePointerCapture(id);draw(load);}
  function setZoom(value){finishDrag(false);zoom=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,value));draw(false);settle();}
  events.on(map,'pointerdown',e=>{if(e.button!==0||drag)return;clearTimeout(timer);drag={id:e.pointerId,x:e.clientX,y:e.clientY,bounds};map.setPointerCapture(e.pointerId);map.classList.add('dragging');});
  events.on(map,'pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;bounds=panArea(drag.bounds,e.clientX-drag.x,e.clientY-drag.y,zoom);$('area-preset').value='custom';draw(false);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])events.on(map,type,e=>{if(drag?.id===e.pointerId)finishDrag();});
  events.on(map,'wheel',e=>{e.preventDefault();if(e.deltaY)setZoom(zoom+(e.deltaY<0?1:-1));},{passive:false});
  events.on(map,'keydown',e=>{
    const shifts={ArrowLeft:[KEY_PAN_PIXELS,0],ArrowRight:[-KEY_PAN_PIXELS,0],ArrowUp:[0,KEY_PAN_PIXELS],ArrowDown:[0,-KEY_PAN_PIXELS]};
    if(shifts[e.key]){bounds=panArea(bounds,...shifts[e.key],zoom);$('area-preset').value='custom';draw(false);settle();}
    else if(e.key==='+'||e.key==='=')setZoom(zoom+1);else if(e.key==='-')setZoom(zoom-1);else return;e.preventDefault();
  });
  events.on($('area-zoom-in'),'click',()=>setZoom(zoom+1));events.on($('area-zoom-out'),'click',()=>setZoom(zoom-1));
  events.on($('area-preset'),'change',()=>{if($('area-preset').value==='custom')return;$('area-size').value='current';setDraft($('area-preset').value==='coney'?CONEY_BOUNDS:NEIGHBOR_BOUNDS);});
  events.on($('area-size'),'change',()=>{const metres=Number($('area-size').value);if(!metres)return;$('area-preset').value='custom';setDraft(centeredArea(areaCenter(bounds),{width:metres,height:metres}));});
  events.on($('area-use'),'click',()=>{onApply({...bounds});dialog.close();});events.on($('area-dismiss'),'click',()=>dialog.close());
  events.on(dialog,'close',()=>{if(dialog.open)return;clearTimeout(timer);tiles.enable(false);finishDrag();});
  const observer=new ResizeObserver(()=>{if(dialog.open){draw(false);settle();}});observer.observe(map);
  return {
    open(initial){
      validateArea(initial);if(initial.south < -MAX_MAP_LATITUDE || initial.north > MAX_MAP_LATITUDE)throw Error('The map picker supports latitudes within ±85°. Use exact coordinates for polar areas.');
      bounds={...initial};$('area-preset').value=Object.keys(CONEY_BOUNDS).every(k=>bounds[k]===CONEY_BOUNDS[k])?'coney':Object.keys(NEIGHBOR_BOUNDS).every(k=>bounds[k]===NEIGHBOR_BOUNDS[k])?'neighbor':'custom';$('area-size').value='current';$('area-map-status').textContent='';
      dialog.showModal();tiles.enable(true);fit();map.focus();
    },
    dispose(){events.dispose();finishDrag(false);dialog.close();clearTimeout(timer);observer.disconnect();tiles.enable(false);},
  };
}
