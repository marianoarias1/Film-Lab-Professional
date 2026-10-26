// All geometry is measured in displayed image pixels; serialization stays normalized.
export const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
export const smooth = (lo, hi, n) => { const t = clamp((n - lo) / Math.max(1e-9, hi - lo)); return t * t * (3 - 2 * t); };
const px = (p, b) => ({x:p.x*b.width, y:p.y*b.height});
const norm = (p, b) => ({x:clamp(p.x/b.width), y:clamp(p.y/b.height)});
export function createShape(kind, a, z, b) {
  if (kind === 'radial') return {kind, center:norm({x:(a.x+z.x)/2,y:(a.y+z.y)/2},b),
    rx:Math.max(.01,Math.abs(z.x-a.x)/2/Math.max(b.width,b.height)),
    ry:Math.max(.01,Math.abs(z.y-a.y)/2/Math.max(b.width,b.height)),angle:0,feather:65,invert:false};
  return {kind:'linear',start:norm(a,b),end:norm(z,b)};
}
export function linearGeometry(s,b) {
  const a=px(s.start,b),z=px(s.end,b),dx=z.x-a.x,dy=z.y-a.y,d=Math.max(.01,Math.hypot(dx,dy));
  return {center:{x:(a.x+z.x)/2,y:(a.y+z.y)/2},n:{x:dx/d,y:dy/d},half:d/2};
}
function setLinear(center,n,half,b) {
  // Keep both serialized endpoints in bounds, preserving angle and midpoint.
  let limit=Infinity;
  for(const [v,k,max] of [[n.x,'x',b.width],[n.y,'y',b.height]]) if(Math.abs(v)>1e-9)
    limit=Math.min(limit,center[k]/Math.abs(v),(max-center[k])/Math.abs(v));
  const minimum=.001/(Math.abs(n.x)/b.width+Math.abs(n.y)/b.height);
  if(limit<minimum)return null;
  const h=Math.max(minimum,Math.min(half,limit));
  return {kind:'linear',start:norm({x:center.x-n.x*h,y:center.y-n.y*h},b),end:norm({x:center.x+n.x*h,y:center.y+n.y*h},b)};
}
export function transformShape(s,action,from,to,b) {
  const out=structuredClone(s),long=Math.max(b.width,b.height);
  if(s.kind==='radial') {
    const c=px(s.center,b),a=s.angle*Math.PI/180,dx=to.x-c.x,dy=to.y-c.y;
    if(action==='center') out.center=norm({x:c.x+to.x-from.x,y:c.y+to.y-from.y},b);
    if(action==='rx')out.rx=clamp(Math.abs(dx*Math.cos(a)+dy*Math.sin(a))/long,.01,2);
    if(action==='ry')out.ry=clamp(Math.abs(-dx*Math.sin(a)+dy*Math.cos(a))/long,.01,2);
    if(action==='rotate') {
      const delta=Math.atan2(dy,dx)-Math.atan2(from.y-c.y,from.x-c.x);
      out.angle=((s.angle+delta*180/Math.PI+540)%360)-180;
    }
    return out;
  }
  const {center,n,half}=linearGeometry(s,b);
  if(action==='center') {
    const a=px(s.start,b),z=px(s.end,b);
    const dx=clamp(to.x-from.x,-Math.min(a.x,z.x),b.width-Math.max(a.x,z.x));
    const dy=clamp(to.y-from.y,-Math.min(a.y,z.y),b.height-Math.max(a.y,z.y));
    out.start=norm({x:a.x+dx,y:a.y+dy},b);out.end=norm({x:z.x+dx,y:z.y+dy},b);return out;
  }
  if(action==='rotate') {
    const delta=Math.atan2(to.y-center.y,to.x-center.x)-Math.atan2(from.y-center.y,from.x-center.x);
    return setLinear(center,{x:n.x*Math.cos(delta)-n.y*Math.sin(delta),y:n.x*Math.sin(delta)+n.y*Math.cos(delta)},half,b)||out;
  }
  if(action==='spread')return setLinear(center,n,Math.max(1,Math.abs((to.x-center.x)*n.x+(to.y-center.y)*n.y)),b)||out;
  return out;
}
export function shapeAlpha(s,x,y,b) {
  const long=Math.max(b.width,b.height);
  if(s.kind==='radial') {
    const a=s.angle*Math.PI/180,dx=x-s.center.x*b.width,dy=y-s.center.y*b.height;
    const r=Math.hypot((dx*Math.cos(a)+dy*Math.sin(a))/(s.rx*long),(-dx*Math.sin(a)+dy*Math.cos(a))/(s.ry*long));
    const v=1-smooth(1-Math.max(.01,s.feather/100),1,r);return s.invert?1-v:v;
  }
  if(s.kind==='linear') {
    const a=px(s.start,b),z=px(s.end,b),dx=z.x-a.x,dy=z.y-a.y;
    return 1-smooth(0,1,((x-a.x)*dx+(y-a.y)*dy)/Math.max(1e-9,dx*dx+dy*dy));
  }
  return 0;
}
// Bounded-resolution brush coverage: same dab falloff, flow/density and erase order as the engine.
export function brushAlpha(strokes,b,cache) {
  if(cache&&strokes.length){
    const prefix=JSON.stringify(strokes.slice(0,-1)),size=b.width+'x'+b.height;
    if(cache.prefix!==prefix||cache.size!==size){cache.prefix=prefix;cache.size=size;cache.base=brushAlpha(strokes.slice(0,-1),b);cache.last=null;}
    const s=strokes.at(-1),meta=JSON.stringify({...s,points:undefined}),old=cache.last;
    const reusable=old&&old.meta===meta&&old.points.length<=s.points.length&&old.points.every((p,i)=>p.x===s.points[i].x&&p.y===s.points[i].y);
    const layer=strokeLayer(s,b,reusable?old:null);layer.meta=meta;cache.last=layer;
    const out=cache.base.slice();
    for(let i=0;i<out.length;i++)out[i]=s.erase?out[i]*(1-layer.alpha[i]):Math.max(out[i],layer.alpha[i]);
    return out;
  }
  const out=new Float32Array(b.width*b.height);
  for(const s of strokes){const {alpha}=strokeLayer(s,b);for(let i=0;i<out.length;i++)out[i]=s.erase?out[i]*(1-alpha[i]):Math.max(out[i],alpha[i]);}
  return out;
}
function strokeLayer(s,b,old){
  const alpha=old?.alpha||new Float32Array(b.width*b.height),long=Math.max(b.width,b.height),r=Math.max(.5,s.size*long),hard=r*(1-s.feather/100);
  let prev=old?.prev||null;
  const dab=p=>{
    for(let y=Math.max(0,Math.floor(p.y-r));y<Math.min(b.height,Math.ceil(p.y+r));y++)
      for(let x=Math.max(0,Math.floor(p.x-r));x<Math.min(b.width,Math.ceil(p.x+r));x++){
        const d=Math.hypot(x+.5-p.x,y+.5-p.y),a=d<=hard?1:1-smooth(hard,r,d),i=y*b.width+x;
        alpha[i]=Math.min(s.density/100,alpha[i]+a*(s.flow/100)*(1-alpha[i]));
      }
  };
  for(let i=old?.points.length||0;i<s.points.length;i++){
    const p=px(s.points[i],b);
    if(!prev){dab(p);prev=p;continue;}
    const d=Math.hypot(p.x-prev.x,p.y-prev.y);if(d<=1e-6)continue;
    const steps=Math.max(1,Math.ceil(d/Math.max(.5,r/4)));
    for(let k=1;k<=steps;k++)dab({x:prev.x+(p.x-prev.x)*k/steps,y:prev.y+(p.y-prev.y)*k/steps});
    prev=p;
  }
  return {alpha,prev,points:s.points.map(p=>({...p}))};
}

// Matches LightCraft's ordered max/add, multiply/subtract and multiply/intersect.
export function combineAlpha(base,zone,operation,first=false){
  if(first&&operation!=='intersect')return zone;
  if(operation==='subtract')return base*(1-zone);
  if(operation==='intersect')return base*zone;
  return Math.max(base,zone);
}
export function maskCoverage(mask,b,brushCache={}){
  if(mask.components.some(c=>!['radial','linear','brush'].includes(c.shape.kind)))return null;
  const alpha=new Float32Array(b.width*b.height);
  mask.components.forEach((c,index)=>{
    const brush=c.shape.kind==='brush'?brushAlpha(c.shape.strokes,b,brushCache[index]??={}):null;
    for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++){
      const i=y*b.width+x;let a=brush?brush[i]:shapeAlpha(c.shape,x+.5,y+.5,b);
      if(c.invert)a=1-a;alpha[i]=combineAlpha(alpha[i],a,c.op||'add',index===0);
    }
  });
  if(mask.invert)for(let i=0;i<alpha.length;i++)alpha[i]=1-alpha[i];
  return alpha;
}
