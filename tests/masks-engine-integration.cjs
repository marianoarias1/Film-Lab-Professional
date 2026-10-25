const {Engine}=require('../desktop/engine.cjs');const fs=require('node:fs/promises');const path=require('node:path');const assert=require('node:assert/strict');const {spawnSync}=require('node:child_process');
const bin=process.env.FILMLAB_ENGINE||path.resolve('native/target/release/filmlab-professional-engine'+(process.platform==='win32'?'.exe':''));
(async()=>{const e=new Engine(bin);const out=path.resolve('tests/fixtures/results/masks');await fs.mkdir(out,{recursive:true});try{
 const hello=await e.start();assert.equal(hello.engineVersion||hello.engine,'filmlab-pro-0.5-lc-d999e382-fc-6c3948a3');
 const mask={id:1,name:'Radial test',visible:true,invert:false,components:[{shape:{kind:'radial',center:{x:.4,y:.4},rx:.4,ry:.3,angle:15,feather:65,invert:false}}],adjust:{exposure:1,shadows:20,temp:10}};
 for(const [name,kind]of [['gradient.jpg','photo'],['synthetic.dng','photo'],['clip.mp4','video']]){
 const source=path.resolve('tests/fixtures',name);await e.request('open',{key:name,path:source,kind});
 const before=path.join(out,name+'-before.png'),after=path.join(out,name+'-after.png');
 await e.request('preview',{key:name,settings:{},time:.5,edge:320,output:before});
 await e.request('preview',{key:name,settings:{masks:[mask]},time:.5,edge:320,output:after});
 assert.notDeepEqual(await fs.readFile(before),await fs.readFile(after),name+' mask should change preview');
 const output=path.join(out,name+(kind==='video'?'.mp4':'.png'));await e.request('export',{key:name,path:source,settings:{masks:[mask]},output,encoding:'cpu'});assert((await fs.stat(output)).size>100);
 if(kind==='photo'){const b=await fs.readFile(output);assert.equal(b[24],16);}
 else{const r=spawnSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',output],{encoding:'utf8'});assert.equal(r.status,0);const meta=JSON.parse(r.stdout);assert(meta.streams.some(s=>s.codec_type==='audio'));assert(Math.abs(Number(meta.format.duration)-2)<.2);}
 console.log('Máscaras verificadas en preview/export:',name);
 }
}finally{e.stop();}})().catch(e=>{console.error(e);process.exitCode=1;});
