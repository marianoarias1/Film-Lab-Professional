// Each creative layer has its own guides, local paths, protection brush and history.
import {effectLayerDefaults,normalizeEffects} from './model.js';
const names={motion:'Movimiento direccional',tiltShift:'Franja nítida',path:'Trayectorias curvas'};
const limit=(v,min=0,max=1)=>Math.max(min,Math.min(max,v));
const rotateCursor=`url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><path d="M7 11a8 8 0 1 1 0 8M7 11V4m0 7h7" fill="none" stroke="white" stroke-width="4"/><path d="M7 11a8 8 0 1 1 0 8M7 11V4m0 7h7" fill="none" stroke="#254731" stroke-width="2"/></svg>')}") 14 14, alias`;


const icons={
 motion:'M3 8h12m-9 4h15M3 16h12m2-7 4 3-4 3',
 tiltShift:'M4 5h16M4 10h16M4 14h16M4 19h16',
 path:'M3 18C9 18 8 5 15 5c3 0 4 3 6 3M3 18h.01M21 8h.01',
 plus:'M12 5v14M5 12h14',
 eye:'M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
 hidden:'m3 3 18 18M10 6c.7-.1 1.3-.1 2-.1 6 0 10 6 10 6a19 19 0 0 1-3 3.2M6 7.8A18 18 0 0 0 2 12s4 6 10 6c1.3 0 2.6-.3 3.7-.8',
 up:'m6 13 6-6 6 6m-6-6v13',
 trash:'M4 7h16m-14 0 1 13h10l1-13M9 7V4h6v3m-5 3v7m4-7v7',
 guide:'M12 3v4m0 10v4M3 12h4m10 0h4m-5 0a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
};
const descriptions={motion:'Arrastre recto',tiltShift:'Foco en una franja',path:'Movimiento por zonas'};
function fxIcon(name){
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
 for(const [k,v] of Object.entries({viewBox:'0 0 24 24',width:18,height:18,fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(k,v);
 path.setAttribute('d',icons[name]);svg.append(path);return svg;
}

export function mountEffects({current,commit,preview,finished,box,isVisible,exclusive}){
 const $=id=>document.getElementById(id),panel=$('motionPanel'),controls=$('motionControls'),svg=$('fxOverlay');
 let layerIndex=0,pathIndex=0,windowIndex=-1,tool=null,drag=null,showGuides=true,brushSize=.12,brushFeather=80,erase=false,cursor=null,fileId=null,inspector='settings';
 const state=()=>current()?.settings.labEffects;
 const layer=()=>state()?.layers?.[layerIndex];
 const el=(tag,props={},text)=>{const e=Object.assign(document.createElement(tag),props);if(text!==undefined)e.textContent=text;return e;};
 function ensure(){const f=current();if(!f)return null;if(fileId!==f.id){fileId=f.id;inspector='settings';layerIndex=0;pathIndex=0;windowIndex=-1;tool=null;cursor=null;}
  if(!f.settings.labEffects?.stack)f.settings.labEffects=normalizeEffects(f.settings.labEffects);
  layerIndex=limit(layerIndex,0,Math.max(0,state().layers.length-1));const s=layer();if(s?.mode==='path'&&!s.paths.length)s.paths=[{points:structuredClone(s.points),distance:s.distance,influence:55}];pathIndex=limit(pathIndex,0,Math.max(0,(s?.paths.length||1)-1));return state();
 }
 function mutate(fn){if(!current())return;ensure();const old=structuredClone(current().settings);fn(state(),layer());commit(old);finished();draw();}
 function range(target,key,label,min=0,max=100,step=1){const wrap=el('label',{className:'fx-range'}),head=el('span',{},label),out=el('output',{},target[key]),input=el('input',{type:'range',min,max,step,value:target[key]});let old;
  head.append(out);input.onpointerdown=()=>old=structuredClone(current().settings);input.oninput=()=>{old??=structuredClone(current().settings);target[key]=Number(input.value);out.value=input.value;refresh();preview();};const end=()=>{if(old){commit(old);old=null;finished();}};input.onchange=end;input.onpointerup=end;input.onpointercancel=end;input.onblur=end;wrap.append(head,input);return wrap;}
 function button(text,fn,cls='outline'){const b=el('button',{className:cls},text);b.onclick=fn;return b;}
 function add(mode){mutate(root=>{root.enabled=true;const s={...effectLayerDefaults(),mode};if(mode==='path')s.paths=[{points:structuredClone(s.points),distance:s.distance,influence:55}];root.layers.push(s);layerIndex=root.layers.length-1;pathIndex=0;windowIndex=-1;tool=null;showGuides=true;});}

 function iconButton(icon,label,action,pressed){
  const b=button('',action,'fx-icon-button');b.append(fxIcon(icon));b.title=label;b.setAttribute('aria-label',label);
  if(pressed!==undefined)b.setAttribute('aria-pressed',String(pressed));
  return b;
 }
 function hint(text,active=false){return el('p',{className:active?'fx-hint fx-tool-active':'fx-hint'},text);}
 function changeView(view){inspector=view;tool=null;cursor=null;draw();}
 function draw(){
  const root=ensure();controls.replaceChildren();
  if(!root){controls.append(hint('Abrí una foto o un video para agregar efectos.'));refresh();return;}
  const header=el('div',{className:'fx-stack-header'});
  header.append(el('span',{className:'fx-kicker'},'Capas de efecto'),el('span',{className:'fx-count'},root.layers.length+' / 6'));
  controls.append(header);
  if(root.layers.length){
   const list=el('div',{className:'fx-layer-list'});
   root.layers.forEach((s,i)=>{
    const selected=i===layerIndex,row=el('div',{className:'fx-layer-row'+(selected?' active':'')+(!s.enabled?' is-off':'')});
    const choose=button('',()=>{layerIndex=i;pathIndex=0;windowIndex=-1;changeView('settings');},'fx-layer-select');
    choose.append(el('span',{className:'fx-layer-icon'}),el('span',{className:'fx-layer-name'},names[s.mode]));
    choose.firstChild.append(fxIcon(s.mode));choose.setAttribute('aria-pressed',String(selected));
    const label=(s.enabled?'Ocultar ':'Mostrar ')+names[s.mode]+' '+(i+1);
    const visible=iconButton(s.enabled?'eye':'hidden',label,()=>mutate(()=>{s.enabled=!s.enabled;}),s.enabled);
    row.append(choose,visible);list.append(row);
   });
   controls.append(list);
  }
  if(root.layers.length<6){
   const palette=el('details',{className:'fx-palette',open:root.layers.length===0});
   const summary=el('summary',{className:'fx-add'});summary.append(fxIcon('plus'),el('span',{},'Añadir efecto'));palette.append(summary);
   const options=el('div',{className:'fx-palette-options'});
   Object.entries(names).forEach(([mode,name])=>{
    const choice=button('',()=>{inspector='settings';add(mode);},'fx-palette-option');
    const mark=el('span',{className:'fx-layer-icon'});mark.append(fxIcon(mode));
    const copy=el('span',{className:'fx-option-copy'});copy.append(el('strong',{},name),el('small',{},descriptions[mode]));
    choice.append(mark,copy);options.append(choice);
   });
   palette.append(options);controls.append(palette);
  }
  const s=layer();if(!s){refresh();return;}
  if(!root.enabled)root.enabled=true;
  const card=el('section',{className:'fx-inspector'});
  const title=el('div',{className:'fx-inspector-head'}),copy=el('div',{className:'fx-inspector-copy'});
  copy.append(el('span',{className:'fx-kicker'},'Capa '+(layerIndex+1)),el('h4',{},names[s.mode]));
  const actions=el('div',{className:'fx-inspector-actions'});
  const up=iconButton('up','Aplicar antes',()=>mutate(r=>{const i=layerIndex;[r.layers[i-1],r.layers[i]]=[r.layers[i],r.layers[i-1]];layerIndex=i-1;}));
  up.disabled=layerIndex===0;
  const remove=iconButton('trash','Eliminar esta capa',()=>mutate(r=>{r.layers.splice(layerIndex,1);layerIndex=Math.max(0,layerIndex-1);inspector='settings';tool=null;}));
  remove.classList.add('fx-danger');
  actions.append(up,remove);title.append(copy,actions);card.append(title);

  const tabs=el('div',{className:'fx-inspector-tabs',role:'group',ariaLabel:'Controles de la capa'});
  const other=s.mode==='path'?'Pincel':'Ventanas';
  for(const [value,name] of [['settings',s.mode==='path'?'Curvas':'Ajustes'],['zones',other]]){
   const tab=button(name,()=>changeView(value),'fx-tab');tab.setAttribute('aria-pressed',String(inspector===value));tabs.append(tab);
  }
  card.append(tabs);
  const body=el('div',{className:'fx-inspector-body'});
  if(inspector==='zones'){
   if(s.mode==='path')drawBrush(s,body);else drawWindows(s,body);
  }else{
   body.append(range(s,'amount','Intensidad'));
   if(s.mode==='tiltShift'){
    body.append(range(s,'distance','Desenfoque'));
    const texture=el('div',{className:'fx-control-group'});
    texture.append(el('h5',{},'Textura'),range(s,'dissolve','Disolución de luces'),range(s,'particleSize','Tamaño'));
    body.append(texture);
    body.append(hint('Punto: mover · Línea central: girar\nLíneas: ancho · Punteadas: transición'));
   }else if(s.mode==='path'){
    drawPaths(s,body);
   }else{
    body.append(range(s,'distance','Longitud del rastro'),range(s,'sharpness','Conservar nitidez'),hint('Arrastrá los extremos sobre la foto para orientar el movimiento.'));
   }
  }
  card.append(body);
  const footer=el('div',{className:'fx-inspector-footer'});
  const guides=button('',()=>{showGuides=!showGuides;tool=null;cursor=null;draw();},'fx-guide-button');
  guides.append(fxIcon('guide'),el('span',{},'Mostrar guías'));guides.setAttribute('aria-pressed',String(showGuides));footer.append(guides);
  card.append(footer);controls.append(card);refresh();
 }

 function picker(items,index,label,change){
  const select=el('select',{className:'fx-picker',ariaLabel:label});
  items.forEach((_,i)=>select.append(el('option',{value:i,selected:i===index},label+' '+(i+1))));
  select.onchange=()=>change(Number(select.value));return select;
 }
 function drawPaths(s,body){
  const group=el('div',{className:'fx-control-group'});
  const head=el('div',{className:'fx-control-head'});head.append(el('h5',{},'Recorrido'));
  const addPath=button(tool==='curve'?'Cancelar dibujo':'+ Dibujar curva',()=>{tool=tool==='curve'?null:'curve';showGuides=true;draw();},'fx-action');
  addPath.disabled=s.paths.length>=8;head.append(addPath);group.append(head);
  const row=el('div',{className:'fx-item-picker'});
  const remove=iconButton('trash','Eliminar curva seleccionada',()=>mutate((r,s)=>{if(s.paths.length>1){s.paths.splice(pathIndex,1);pathIndex=Math.max(0,pathIndex-1);}}));
  remove.disabled=s.paths.length<2;remove.classList.add('fx-danger');
  row.append(picker(s.paths,pathIndex,'Curva',i=>{pathIndex=i;tool=null;draw();}),remove);group.append(row);
  const p=s.paths[pathIndex];
  group.append(range(p,'distance','Longitud'),range(p,'influence','Alcance',5,100));body.append(group);
  body.append(range(s,'sharpness','Conservar nitidez'));
  if(tool==='curve')body.append(hint('Arrastrá sobre la foto para dibujar. Después mové el punto central para curvar.',true));
 }
 function drawBrush(s,body){
  const brush=button(tool==='brush'?'Terminar pincel':'Activar pincel de nitidez',()=>{tool=tool==='brush'?null:'brush';showGuides=true;draw();},'fx-action fx-primary-action');
  brush.setAttribute('aria-pressed',String(tool==='brush'));body.append(brush);
  if(tool==='brush'){
   const opts={size:Math.round(brushSize*100),feather:brushFeather};const size=range(opts,'size','Tamaño',1,60),soft=range(opts,'feather','Suavidad',5,100);
   // Brush options do not alter the photograph until the next stroke.
   for(const [wrap,key]of[[size,'size'],[soft,'feather']]){const input=wrap.querySelector('input'),out=wrap.querySelector('output');input.onpointerdown=null;input.onchange=null;input.onpointerup=null;input.onblur=null;input.oninput=()=>{out.value=input.value;if(key==='size')brushSize=Number(input.value)/100;else brushFeather=Number(input.value);refresh();};}
   const modes=el('div',{className:'fx-brush-modes',role:'group',ariaLabel:'Modo del pincel'});
   for(const [value,label] of [[false,'Recuperar nitidez'],[true,'Restaurar efecto']]){
    const mode=button(label,()=>{erase=value;draw();},'fx-tab');mode.setAttribute('aria-pressed',String(erase===value));modes.append(mode);
   }
   body.append(modes,size,soft);
  }
  body.append(hint(erase&&tool==='brush'?'Pintá para devolver el desenfoque en las zonas recuperadas.':'Pintá para recuperar nitidez con un borde gradual.',tool==='brush'));
  if(s.strokes.length>=128||s.strokes.reduce((n,s)=>n+s.points.length,0)>=8192)body.append(hint('Llegaste al límite de pinceladas. Podés deshacer o borrar trazos.'));
  if(s.strokes.length)body.append(button('Borrar pinceladas',()=>mutate((r,s)=>s.strokes=[]),'fx-action fx-danger'));
 }
 function drawWindows(s,body){
  const add=button(tool==='window'?'Cancelar dibujo':'+ Dibujar ventana',()=>{tool=tool==='window'?null:'window';showGuides=true;draw();},'fx-action fx-primary-action');
  add.disabled=s.windows.length>=8;body.append(add);
  if(s.windows.length){
   const row=el('div',{className:'fx-item-picker'});
   const remove=iconButton('trash','Eliminar ventana seleccionada',()=>mutate((r,s)=>{s.windows.splice(windowIndex,1);windowIndex=Math.min(windowIndex,s.windows.length-1);}));
   remove.classList.add('fx-danger');
   if(windowIndex<0||windowIndex>=s.windows.length)windowIndex=0;
   row.append(picker(s.windows,windowIndex,'Ventana',i=>{windowIndex=i;draw();}),remove);body.append(row);
   const w=s.windows[windowIndex];body.append(range(w,'feather','Suavidad del borde'),range(w,'border','Marco blanco',0,24));
  }
  body.append(hint(tool==='window'?'Arrastrá sobre la foto para definir el rectángulo.':'Las ventanas conservan zonas nítidas dentro del efecto.',tool==='window'));
 }
 function active(){return panel.open&&isVisible()&&!!layer()&&showGuides;}
 function refresh(){svg.replaceChildren();svg.toggleAttribute('hidden',!active());if(!active())return;const s=layer(),b=box();if(!b.width||!b.height)return;Object.assign(svg.style,{left:b.x+'px',top:b.y+'px',width:b.width+'px',height:b.height+'px'});svg.setAttribute('viewBox',`0 0 ${b.width} ${b.height}`);svg.style.pointerEvents=tool?'auto':'none';svg.style.cursor=tool==='brush'?'none':tool?'crosshair':'default';
  const shape=(tag,attrs,action,index)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(action&&!tool){e.dataset.fx=action;if(index!==undefined)e.dataset.index=index;e.style.pointerEvents='all';e.style.cursor=action==='rotate'?rotateCursor:action==='band'||action==='fade'?['ew-resize','nwse-resize','ns-resize','nesw-resize'][Math.round((Math.atan2((s.points[1][1]-s.points[0][1])*b.height,(s.points[1][0]-s.points[0][0])*b.width)+Math.PI/2)/(Math.PI/4)+8)%4]:action.startsWith('point')||action==='move'?'grab':action==='resize'?'nwse-resize':'move';const t=document.createElementNS(e.namespaceURI,'title');t.textContent={rotate:'Arrastrar para girar',band:'Arrastrar para ampliar o reducir la franja',fade:'Arrastrar para ajustar la transición',move:'Arrastrar para mover'}[action]||'Arrastrar para modificar';e.append(t);}svg.append(e);return e;};
  const pin=(x,y,action,index)=>shape('circle',{cx:x,cy:y,r:6,fill:'#f8faf1',stroke:'#405a47','stroke-width':2},action,index);
  const line=(a,z,action,dash=false)=>{shape('line',{x1:a[0],y1:a[1],x2:z[0],y2:z[1],stroke:'#173d2b','stroke-width':3,'pointer-events':'none'});shape('line',{x1:a[0],y1:a[1],x2:z[0],y2:z[1],stroke:'#fafff3','stroke-width':1,'stroke-dasharray':dash?'6 5':'none','pointer-events':'none'});if(action)shape('line',{x1:a[0],y1:a[1],x2:z[0],y2:z[1],stroke:'transparent','stroke-width':15},action);};
  if(s.mode==='tiltShift'){
   const p=s.points.map(p=>[p[0]*b.width,p[1]*b.height]),center=[(p[0][0]+p[1][0])/2,(p[0][1]+p[1][1])/2],dx=p[1][0]-p[0][0],dy=p[1][1]-p[0][1],len=Math.hypot(dx,dy)||1,t=[dx/len,dy/len],n=[-t[1],t[0]],long=Math.max(b.width,b.height),half=s.bandWidth/100*long*.4,fade=s.transition/100*long*.2,extent=Math.hypot(b.width,b.height)*1.2;
   for(const [offset,action,dash]of[[0,'rotate',false],[-half,'band',false],[half,'band',false],[-half-fade,'fade',true],[half+fade,'fade',true]]){const c=[center[0]+n[0]*offset,center[1]+n[1]*offset];line([c[0]-t[0]*extent,c[1]-t[1]*extent],[c[0]+t[0]*extent,c[1]+t[1]*extent],action,dash);}pin(...center,'move');
  }else if(s.mode==='path'){
   s.paths.forEach((path,i)=>{const p=path.points.map(q=>[q[0]*b.width,q[1]*b.height]),d=`M${p[0]} Q${p[2]} ${p[1]}`;shape('path',{d,fill:'none',stroke:i===pathIndex?'#f4fff0':'#c2d6bd','stroke-width':i===pathIndex?2.5:1.5,'stroke-dasharray':i===pathIndex?'none':'5 4'});shape('path',{d,fill:'none',stroke:'transparent','stroke-width':14},'curve',i);for(const k of[0,1,2])pin(...p[k],'point'+k,i);});
  }else{const p=s.points.map(q=>[q[0]*b.width,q[1]*b.height]);line(p[0],p[1]);pin(...p[0],'point0');pin(...p[1],'point1');}
  if(s.mode!=='path')s.windows.forEach((w,i)=>{shape('rect',{x:w.x*b.width,y:w.y*b.height,width:w.width*b.width,height:w.height*b.height,fill:'#88aa7020',stroke:windowIndex===i?'#c2e4a2':'#fff','stroke-width':2},'windowMove',i);shape('rect',{x:(w.x+w.width)*b.width-5,y:(w.y+w.height)*b.height-5,width:10,height:10,fill:'#f8faf1',stroke:'#405a47'},'resize',i);});
  if(tool==='brush'&&cursor){const r=brushSize*Math.max(b.width,b.height)/2,x=cursor[0]*b.width,y=cursor[1]*b.height;shape('circle',{cx:x,cy:y,r,fill:'none',stroke:'#fff','stroke-width':1.5,'pointer-events':'none'});shape('circle',{cx:x,cy:y,r:r*(1-brushFeather/100),fill:'none',stroke:'#d9eccd','stroke-width':1,'stroke-dasharray':'3 3','pointer-events':'none'});}
 }
 const point=e=>{const r=svg.getBoundingClientRect();return[limit((e.clientX-r.left)/r.width),limit((e.clientY-r.top)/r.height)];};
 function appendBrush(p){const stroke=layer().strokes.at(-1),last=stroke.points.at(-1);if(stroke.points.length<1024&&layer().strokes.reduce((n,s)=>n+s.points.length,0)<8192&&(!last||Math.hypot(p[0]-last[0],p[1]-last[1])>brushSize*.07))stroke.points.push(p);}
 svg.onpointerdown=e=>{if(e.button!==0||!current())return;const action=tool||e.target.dataset.fx;if(!action)return;const index=Number(e.target.dataset.index||0);if(action==='curve'&&!tool){pathIndex=index;draw();return;}e.preventDefault();e.stopPropagation();ensure();drag={id:e.pointerId,start:point(e),old:structuredClone(current().settings),layer:structuredClone(layer()),action,index,b:box()};const s=layer();s.enabled=true;
  if(action==='window'){s.windows.push({x:drag.start[0],y:drag.start[1],width:0,height:0,feather:0,border:0});windowIndex=s.windows.length-1;}
  if(action==='brush'){if(s.strokes.length>=128||s.strokes.reduce((n,s)=>n+s.points.length,0)>=8192){drag=null;return;}s.strokes.push({points:[drag.start],size:brushSize,feather:brushFeather,erase});cursor=drag.start;preview();}
  if(action==='curve'){s.paths.push({points:[drag.start,drag.start,drag.start],distance:s.distance,influence:55});pathIndex=s.paths.length-1;}
  if(s.mode==='path'&&action.startsWith('point'))pathIndex=index;
  svg.setPointerCapture(e.pointerId);refresh();
 };
 svg.onpointermove=e=>{const p=point(e);if(tool==='brush'){cursor=p;if(!drag){refresh();return;}}if(!drag)return;const s=layer(),a=drag.action,o=drag.layer;
  if(a==='brush')appendBrush(p);
  else if(a.startsWith('point')){const dest=s.mode==='path'?s.paths[pathIndex].points:s.points;dest[Number(a.slice(5))]=p;}
  else if(a==='curve'){s.paths[pathIndex].points=[drag.start,p,[(drag.start[0]+p[0])/2,(drag.start[1]+p[1])/2]];}
  else if(['move','rotate','band','fade'].includes(a)){
   const b=drag.b,pts=o.points.map(q=>[q[0]*b.width,q[1]*b.height]),c=[(pts[0][0]+pts[1][0])/2,(pts[0][1]+pts[1][1])/2],dx=pts[1][0]-pts[0][0],dy=pts[1][1]-pts[0][1],len=Math.hypot(dx,dy)||1,n=[-dy/len,dx/len],xy=[p[0]*b.width,p[1]*b.height];
   if(a==='move'){let tx=p[0]-drag.start[0],ty=p[1]-drag.start[1];tx=limit(tx,-Math.min(...o.points.map(p=>p[0])),1-Math.max(...o.points.map(p=>p[0])));ty=limit(ty,-Math.min(...o.points.map(p=>p[1])),1-Math.max(...o.points.map(p=>p[1])));s.points=o.points.map(q=>[q[0]+tx,q[1]+ty]);}
   else if(a==='rotate'){const start=Math.atan2(drag.start[1]*b.height-c[1],drag.start[0]*b.width-c[0]),angle=Math.atan2(xy[1]-c[1],xy[0]-c[0])-start;let end=pts.map(q=>[c[0]+(q[0]-c[0])*Math.cos(angle)-(q[1]-c[1])*Math.sin(angle),c[1]+(q[0]-c[0])*Math.sin(angle)+(q[1]-c[1])*Math.cos(angle)]);const f=Math.min(1,...end.flatMap(q=>[q[0]<0?c[0]/(c[0]-q[0]):q[0]>b.width?(b.width-c[0])/(q[0]-c[0]):1,q[1]<0?c[1]/(c[1]-q[1]):q[1]>b.height?(b.height-c[1])/(q[1]-c[1]):1]));s.points=end.map(q=>[limit((c[0]+(q[0]-c[0])*f)/b.width),limit((c[1]+(q[1]-c[1])*f)/b.height)]);}
   else{const perpendicular=Math.abs((xy[0]-c[0])*n[0]+(xy[1]-c[1])*n[1]),long=Math.max(b.width,b.height);if(a==='band')s.bandWidth=limit(perpendicular/(long*.4)*100,0,100);else s.transition=limit((perpendicular-o.bandWidth/100*long*.4)/(long*.2)*100,0,100);}
  }else if(a==='window'){const w=s.windows[windowIndex];w.x=Math.min(p[0],drag.start[0]);w.y=Math.min(p[1],drag.start[1]);w.width=Math.abs(p[0]-drag.start[0]);w.height=Math.abs(p[1]-drag.start[1]);}
  else{const w=s.windows[drag.index],old=o.windows[drag.index];windowIndex=drag.index;if(a==='resize'){w.width=limit(p[0]-old.x,.005,1-old.x);w.height=limit(p[1]-old.y,.005,1-old.y);}else{w.x=limit(old.x+p[0]-drag.start[0],0,1-old.width);w.y=limit(old.y+p[1]-drag.start[1],0,1-old.height);}}
  refresh();if(s.windows.every(w=>w.width>=.005&&w.height>=.005))preview();
 };
 function end(e,cancel=false){if(!drag)return;e?.stopPropagation();const old=drag.old,s=layer();if(cancel)current().settings=old;else{if(drag.action==='window'){if(s.windows[windowIndex].width<.005||s.windows[windowIndex].height<.005){s.windows.splice(windowIndex,1);windowIndex=-1;}tool=null;}if(drag.action==='curve'){const p=s.paths[pathIndex].points;if(Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1])<.01){s.paths.pop();pathIndex=0;}tool=null;}commit(old);}drag=null;finished();draw();}
 svg.onpointerup=e=>end(e);svg.onpointercancel=e=>end(e,true);svg.onpointerleave=()=>{if(!drag){cursor=null;refresh();}};svg.addEventListener('lostpointercapture',e=>{if(drag)end(e);});panel.ontoggle=()=>{if(panel.open)exclusive();draw();};new ResizeObserver(refresh).observe($('preview'));return{draw,refresh,active};
}
