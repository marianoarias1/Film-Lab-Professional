const {Engine}=require('../desktop/engine.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const e=new Engine(process.env.FILMLAB_ENGINE||path.resolve('native/target/release/filmlab-professional-engine'+(process.platform==='win32'?'.exe':''))),out=path.resolve('tests/fixtures/results/glow');await fs.mkdir(out,{recursive:true});
try{const hello=await e.start();assert.match(hello.engine,/filmlab-pro-0.10/);
for(const [name,kind] of [['gradient.jpg','photo'],['synthetic.dng','photo'],['clip.mp4','video']]){
 const source=path.resolve('tests/fixtures',name);await e.request('open',{key:name,path:source,kind});
 const render=async(settings,label)=>{const output=path.join(out,name+'-'+label+'.png');await e.request('preview',{key:name,settings,edge:320,time:.5,output});return fs.readFile(output);};
 const baseline=await render({},'base');assert.deepEqual(await render({glow:{enabled:false,amount:100}},'off'),baseline);
 const glow={enabled:true,style:'soft',amount:90,range:90,spread:60};
 const soft=await render({glow},'soft');assert.notDeepEqual(soft,baseline);
 const directional=await render({glow:{...glow,style:'directional',angle:30}},'directional');assert.notDeepEqual(directional,soft);
 assert.deepEqual(await render({glow:{...glow,maskId:999}},'deleted-mask'),baseline);
 const mask={id:1,name:'Zona',visible:true,invert:false,components:[{op:'add',invert:false,shape:{kind:'radial',center:{x:.5,y:.5},rx:.2,ry:.2,angle:0,feather:50,invert:false}}],adjust:{}};
 const local=await render({glow:{...glow,maskId:1},masks:[mask]},'masked');assert.notDeepEqual(local,soft);assert.notDeepEqual(local,baseline);
 assert.deepEqual(await render({glow:{...glow,maskId:1},masks:[{...mask,visible:false}]},'hidden-mask'),baseline);
 assert.deepEqual(await render({glow},'repeat'),soft);
 const output=path.join(out,name+(kind==='video'?'.mp4':'.png'));
 await e.request('export',{key:name,path:source,settings:{glow},output,encoding:'cpu',delivery:{width:120,height:160,fit:'contain',upscale:true,fps:15,bitrateMbps:4,audioKbps:128}});
 assert((await fs.stat(output)).size>100);console.log('Glow preview/export:',name);
}
await assert.rejects(()=>e.request('preview',{key:'gradient.jpg',settings:{glow:{style:'invalid'}},edge:320,output:path.join(out,'invalid.png')}),/Resplandor/);
}finally{e.stop();}})().catch(error=>{console.error(error);process.exitCode=1;});
