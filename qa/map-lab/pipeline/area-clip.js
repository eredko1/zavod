// Clip horizontal paths to the requested area; source snapshots remain untouched.
export function clipPaths(paths,b){
  const out=[];
  for(const path of paths){let current=null;
    for(let i=1;i<path.length;i++){
      const a=path[i-1],c=path[i],dx=c[0]-a[0],dz=c[1]-a[1];let lo=0,hi=1,valid=true;
      for(const [p,q]of[[-dx,a[0]-b.x0],[dx,b.x1-a[0]],[-dz,a[1]-b.z0],[dz,b.z1-a[1]]]){
        if(p===0){if(q<0)valid=false;continue;}const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
      }
      if(!valid||hi<=lo){current=null;continue;}
      const start=[a[0]+lo*dx,a[1]+lo*dz],end=[a[0]+hi*dx,a[1]+hi*dz];
      if(current&&Math.hypot(current.at(-1)[0]-start[0],current.at(-1)[1]-start[1])<1e-7)current.push(end);else{current=[start,end];out.push(current);}
      if(hi<1)current=null;
    }
  }return out;
}
