// These checks run at lifecycle boundaries, not inside the measured render loop.
export function observeEnvironment(canvas) {
  if(document.visibilityState!=='visible'||!document.hasFocus())throw Error('Benchmark requires a visible, focused page before replay');
  const snapshot=()=>JSON.stringify([innerWidth,innerHeight,canvas.width,canvas.height,devicePixelRatio,document.visibilityState,document.hasFocus()]);
  const initial=snapshot();let change=null;
  const check=()=>{const current=snapshot();if(current!==initial&&!change)change=`${initial} → ${current}`;};
  const mutations=new MutationObserver(records=>{
    // Old values catch a resize restored within the same event-loop turn.
    const resized=records.find(r=>r.oldValue!==r.target.getAttribute(r.attributeName));
    if(resized&&!change)change=`canvas ${resized.attributeName}: ${resized.oldValue} → ${resized.target.getAttribute(resized.attributeName)}`;
    check();
  });
  mutations.observe(canvas,{attributes:true,attributeOldValue:true,attributeFilter:['width','height']});
  const events=['resize','blur','visibilitychange'];
  for(const event of events)window.addEventListener(event,check,true);
  return {
    validate(){check();if(change)throw Error(`Viewport, visibility or focus changed during replay (${change})`);},
    dispose(){mutations.disconnect();for(const event of events)window.removeEventListener(event,check,true);},
  };
}

export function validateAssets(raw,modes) {
  if(raw.pendingAssets||raw.assetEvents.some(e=>e.kind==='error'))throw Error('Assets pending or failed during replay');
  for(const mode of modes){
    const frames=raw.frames.filter(f=>f.phase===mode),first=frames[0],last=frames.at(-1);
    if(!first)continue;
    const pending=new Map();
    for(const event of raw.assetEvents){
      if(event.atMs>=first.startMs)break;
      const count=pending.get(event.url)||0;
      if(event.kind==='start')pending.set(event.url,count+1);
      else if(event.kind==='end'&&count)pending.set(event.url,count-1);
    }
    if([...pending.values()].some(count=>count>0))throw Error('Assets pending at measured scenario start');
    // Includes loads between frames, even when they finish before the next frame.
    const changed=raw.assetEvents.some(e=>e.atMs>=first.startMs&&e.atMs<=last.startMs+last.cpu.loop);
    if(changed)throw Error('Assets changed during measured scenario');
  }
}

// A control experiment cannot enable the full profiler just to detect asset drift.
export function observeAssetActivity(manager) {
  const original=manager.itemStart;let changed=false;
  function wrapped(...args){changed=true;return original.apply(this,args);}
  manager.itemStart=wrapped;
  return {
    validate(){if(changed)throw Error('Assets changed during control experiment');},
    dispose(){if(manager.itemStart===wrapped)manager.itemStart=original;},
  };
}
