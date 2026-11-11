const {Engine}=require('../desktop/engine.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
let decodedId=0;
// Reopen exported media with the actual engine; no external ffmpeg dependency in Windows CI.
const decoded=async(e,file,video)=>{
 const key='export-check-'+(++decodedId),output=file+'.verification.png';
 await e.request('open',{key,path:file,kind:video?'video':'photo'});
 await e.request('preview',{key,settings:{},edge:160,time:video?.5:0,output});
 return fs.readFile(output);
};
(async()=>{const bin=process.env.FILMLAB_ENGINE||path.resolve('native/target/release/filmlab-professional-engine'+(process.platform==='win32'?'.exe':''));const e=new Engine(bin),decoder=new Engine(bin),out=path.resolve('tests/fixtures/results/glow');await fs.mkdir(out,{recursive:true});
try{await decoder.start();const hello=await e.start();assert.match(hello.engine,/filmlab-pro-0.12/);
for(const [name,kind] of [['gradient.jpg','photo'],['synthetic.dng','photo'],['clip.mp4','video']]){
 const source=path.resolve('tests/fixtures',name);await e.request('open',{key:name,path:source,kind});
 const render=async(settings,label)=>{const output=path.join(out,name+'-'+label+'.png');await e.request('preview',{key:name,settings,edge:320,time:.5,output});return fs.readFile(output);};
 const delivery={width:120,height:160,fit:'contain',upscale:true,fps:15,bitrateMbps:4,audioKbps:128};
 const baseExport=path.join(out,name+'-export-base'+(kind==='video'?'.mp4':'.png'));
 await e.request('export',{key:name,path:source,settings:{},output:baseExport,encoding:'cpu',delivery});
 const basePixels=await decoded(decoder,baseExport,kind==='video');
 const baseline=await render({},'base');assert.deepEqual(await render({glow:{enabled:false,amount:100}},'off'),baseline);
 const glow={enabled:true,style:'soft',amount:90,range:90,spread:60};
 const soft=await render({glow},'soft');assert.notDeepEqual(soft,baseline);
 const directional=await render({glow:{...glow,style:'directional',angle:30}},'directional');assert.notDeepEqual(directional,soft);
 assert.deepEqual(await render({glow:{...glow,maskId:999}},'deleted-mask'),baseline);
 const mask={id:1,name:'Zona',visible:true,invert:false,components:[{op:'add',invert:false,shape:{kind:'radial',center:{x:.5,y:.5},rx:.2,ry:.2,angle:0,feather:50,invert:false}}],adjust:{}};
 const local=await render({glow:{...glow,maskId:1},masks:[mask]},'masked');assert.notDeepEqual(local,soft);assert.notDeepEqual(local,baseline);
 assert.deepEqual(await render({glow:{...glow,maskId:1},masks:[{...mask,visible:false}]},'hidden-mask'),baseline);
 assert.deepEqual(await render({glow},'repeat'),soft);
 for(const style of ['motion','streak']) {
  const settings={glow:{...glow,style,softness:0,angle:0}};
  const crisp=await render(settings,style+'-crisp');assert.notDeepEqual(crisp,baseline);
  const smooth=await render({glow:{...settings.glow,softness:100}},style+'-smooth');assert.notDeepEqual(smooth,crisp);
  const rotated=await render({glow:{...settings.glow,angle:90}},style+'-rotated');assert.notDeepEqual(rotated,crisp);
  if(style==='motion') assert.notDeepEqual(await render({glow:{...settings.glow,angle:180}},style+'-reverse'),crisp);
  const output=path.join(out,name+'-'+style+(kind==='video'?'.mp4':'.png'));
  await e.request('export',{key:name,path:source,settings,output,encoding:'cpu',delivery:{width:120,height:160,fit:'contain',upscale:true,fps:15,bitrateMbps:4,audioKbps:128}});
  assert((await fs.stat(output)).size>100);
  assert.notDeepEqual(await decoded(decoder,output,kind==='video'),basePixels,style+' must reach exported pixels');
  assert.deepEqual(await render({glow:{...settings.glow,amount:0}},style+'-zero'),baseline);
 }

 const output=path.join(out,name+(kind==='video'?'.mp4':'.png'));
 await e.request('export',{key:name,path:source,settings:{glow},output,encoding:'cpu',delivery:{width:120,height:160,fit:'contain',upscale:true,fps:15,bitrateMbps:4,audioKbps:128}});
 assert((await fs.stat(output)).size>100);console.log('Glow preview/export:',name);
}
await assert.rejects(()=>e.request('preview',{key:'gradient.jpg',settings:{glow:{style:'invalid'}},edge:320,output:path.join(out,'invalid.png')}),/Resplandor/);
await assert.rejects(()=>e.request('preview',{key:'gradient.jpg',settings:{glow:{style:'motion',softness:101}},edge:320,output:path.join(out,'invalid-softness.png')}),/Resplandor/);
}finally{e.stop();decoder.stop();}})().catch(error=>{console.error(error);process.exitCode=1;});
