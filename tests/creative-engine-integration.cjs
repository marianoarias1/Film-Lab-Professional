// Real photo/RAW/video output, not a mock of the rendering implementation.
const {Engine}=require('../desktop/engine.cjs');const fs=require('node:fs/promises');const path=require('node:path');const assert=require('node:assert/strict');const {spawnSync}=require('node:child_process');
const bin=process.env.FILMLAB_ENGINE||path.resolve('native/target/release/filmlab-professional-engine'+(process.platform==='win32'?'.exe':''));
const probe=file=>{const p=spawnSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout);};
(async()=>{const e=new Engine(bin),out=path.resolve('tests/fixtures/results/creative');await fs.mkdir(out,{recursive:true});try{await e.start();
 const effects={enabled:true,mode:'motion',amount:100,distance:60,points:[[.15,.5],[.85,.5],[.5,.2]],windows:[{x:.4,y:.3,width:.2,height:.4,feather:0,border:3}]};
 for(const [name,kind]of [['gradient.jpg','photo'],['synthetic.dng','photo'],['clip.mp4','video']]){
 const source=path.resolve('tests/fixtures',name);await e.request('open',{key:name,path:source,kind});
 const before=path.join(out,name+'-before.png');await e.request('preview',{key:name,settings:{},edge:320,time:.5,output:before});
 for(const mode of ['motion','tiltShift','path']){const after=path.join(out,name+'-'+mode+'.png');await e.request('preview',{key:name,settings:{labEffects:{...effects,mode}},edge:320,time:.5,output:after});assert.notDeepEqual(await fs.readFile(after),await fs.readFile(before),`${name} ${mode}`);}
 const stack={enabled:true,stack:true,layers:[{...effects,mode:'tiltShift',dissolve:65,bandWidth:8},{enabled:true,mode:'path',amount:100,paths:[{points:[[.1,.2],[.8,.2],[.5,.05]],distance:70,influence:35},{points:[[.2,.6],[.8,.8],[.4,.9]],distance:40,influence:35}],strokes:[{points:[[.4,.4],[.5,.5]],size:.2,feather:80,erase:false}]}]};
 const layered=path.join(out,name+'-stack.png');await e.request('preview',{key:name,settings:{labEffects:stack},edge:320,time:.5,output:layered});assert.notDeepEqual(await fs.readFile(layered),await fs.readFile(before));
 const output=path.join(out,name+(kind==='video'?'.mp4':'.jpg'));const delivery={width:120,height:160,fit:'cover',upscale:true,jpegQuality:87,fps:15,bitrateMbps:4,audioKbps:128};
 await e.request('export',{key:name,path:source,settings:{labEffects:stack},output,encoding:'cpu',delivery});const meta=probe(output),v=meta.streams.find(s=>s.codec_type==='video');assert.equal(v.width,120);assert.equal(v.height,160);
 if(kind==='video'){assert(meta.streams.some(s=>s.codec_type==='audio'));assert(Math.abs(Number(meta.format.duration)-2)<.2);assert.equal(v.avg_frame_rate,'15/1');}
 else{const png=path.join(out,name+'.png');await e.request('export',{key:name,path:source,settings:{labEffects:{...effects,mode:'tiltShift'}},output:png,delivery:{...delivery,fit:'contain'}});assert.equal((await fs.readFile(png))[24],16);assert.equal(probe(png).streams[0].width,120);}
 console.log('Creative preview/export + dimensions/audio:',name);
 }
 await assert.rejects(e.request('export',{key:'clip.mp4',path:path.resolve('tests/fixtures/clip.mp4'),settings:{},output:path.join(out,'invalid.mp4'),delivery:{width:999999,height:1920}}),/inválidos/);
 }finally{e.stop();}})().catch(e=>{console.error(e);process.exitCode=1;});
