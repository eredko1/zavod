import { TILE_SIZE, tileLayout, mapPoint } from '../data/area-view.js';

// Images use browser HTTP caching. Fetch visible tiles only; no prefetch or offline download.
export function createAreaTiles(container, { template='https://tile.openstreetmap.org/{tile}.png', onError=()=>{} }={}) {
  const images=new Map();let enabled=false;
  function remove(image){image.onload=image.onerror=null;image.removeAttribute('src');image.remove();}
  return {
    enable(value){enabled=value;if(!value){for(const image of images.values())remove(image);images.clear();}},
    render(center,zoom,width,height,{load=true}={}) {
      if(!enabled)return;
      const tiles=tileLayout(center,zoom,width,height),wanted=new Set(tiles.map(t=>t.key));
      for(const [key,image] of images)if(!wanted.has(key)&&load){remove(image);images.delete(key);}
      for(const tile of tiles){
        let image=images.get(tile.key);
        if(!image&&load){image=document.createElement('img');image.alt='';image.draggable=false;image.width=image.height=TILE_SIZE;image.referrerPolicy='strict-origin-when-cross-origin';image.onerror=()=>onError();image.src=template.replace('{tile}',tile.key);container.append(image);images.set(tile.key,image);}
      }
      const p=mapPoint(center,zoom);
      for(const [key,image] of images){const [z,x,y]=key.split('/').map(Number);image.hidden=z!==zoom;if(z===zoom)image.style.transform=`translate(${x*TILE_SIZE-p.x+width/2}px,${y*TILE_SIZE-p.y+height/2}px)`;}
    },
  };
}
