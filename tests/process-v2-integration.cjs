const {Engine}=require('../desktop/engine.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {deflateSync}=require('node:zlib');
function chunk(name,data){
 const tag=Buffer.from(name),n=Buffer.alloc(4),crc=Buffer.alloc(4);n.writeUInt32BE(data.length);
 let v=0xffffffff;for(const b of Buffer.concat([tag,data])){v^=b;for(let i=0;i<8;i++)v=(v>>>1)^((v&1)?0xedb88320:0);}crc.writeUInt32BE((v^0xffffffff)>>>0);
 return Buffer.concat([n,tag,data,crc]);
}
function chart(){
 const w=384,h=256,scan=Buffer.alloc((w*3+1)*h);let seed=22;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const n=(seed>>>27)-16,i=y*(w*3+1)+1+x*3,base=x<w/2?90:170;
  scan[i]=base+n;scan[i+1]=base;scan[i+2]=base-n;
 }
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);
}
(async()=>{
 const out=path.resolve('tests/fixtures/results');await fs.mkdir(out,{recursive:true});
 const source=path.join(out,'process-noise.png');await fs.writeFile(source,chart());
 const e=new Engine(process.env.FILMLAB_ENGINE||path.resolve('native/target/release/filmlab-professional-engine'+(process.platform==='win32'?'.exe':'')));
 try{
  await e.start();await e.request('open',{key:'v2',kind:'photo',path:source});
  const common={denoise:65,denoiseColor:85,sharpness:30,sharpenRadius:1.2,exposure:.2};
  const preview=async(version,suffix,draft=false)=>{
   const output=path.join(out,'process-'+suffix+'.png');
   const r=await e.request('preview',{key:'v2',settings:{...common,...(version?{processVersion:version}:{})},edge:384,draft,output});
   assert.equal(r.previewDiagnostics.processVersion,version||1);return fs.readFile(output);
  };
  for(const draft of [false,true]){
   const legacy=await preview(null,'legacy-'+draft,draft),v1=await preview(1,'v1-'+draft,draft),v2=await preview(2,'v2-'+draft,draft);
   assert.deepEqual(legacy,v1);assert.notDeepEqual(v1,v2);
   assert.deepEqual(v1,await preview(1,'back-v1-'+draft,draft));
   assert.deepEqual(v2,await preview(2,'back-v2-'+draft,draft));
  }
  for(const version of [1,2]){
   await e.request('open',{key:'v2',kind:'photo',path:source});
   const output=path.join(out,'process-v'+version+'-export.png');
   const r=await e.request('export',{key:'v2',path:source,settings:{...common,processVersion:version},output});
   assert.equal(r.diagnostics.processVersion,version);assert.equal(r.diagnostics.settings.processVersion,version);
   const bytes=await fs.readFile(output);assert.equal(bytes[24],16);assert(bytes.includes(Buffer.from('iCCP')));
   await e.request('open',{key:'reopen',kind:'photo',path:output});
   await e.request('preview',{key:'reopen',settings:{},edge:384,output:path.join(out,'process-reopened-'+version+'.png')});
  }
  await e.request('open',{key:'v2',kind:'photo',path:source});
  const detail=path.join(out,'process-detail.png'),before=path.join(out,'process-before.png');
  const details=[];
  for(const version of [1,2,1]){
   await e.request('detail-preview',{key:'v2',path:source,x:.5,y:.5,width:192,height:128,settings:{...common,processVersion:version},output:detail,beforeOutput:before});
   details.push(await fs.readFile(detail));
  }
  assert.notDeepEqual(details[0],details[1]);assert.deepEqual(details[0],details[2]);
  await assert.rejects(()=>e.request('preview',{key:'v2',settings:{processVersion:3},edge:384,output:detail}),/proceso/);
  console.log('V1 legacy, V2 preview/draft/export/detail, cache switches, 16-bit ICC and reopening: OK');
 }finally{e.stop();}
})().catch(err=>{console.error(err);process.exitCode=1;});
