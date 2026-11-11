const { Engine } = require("../desktop/engine.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { deflateSync } = require("node:zlib");
const assert = require("node:assert/strict");

function crc32(data) {
  let value = 0xffffffff;
  for (const b of data) {
    value ^= b;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const tag = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([tag, data])));
  return Buffer.concat([size,tag,data,crc]);
}
function chart() {
  const width = 2200, height = 1500, scan = Buffer.alloc((width * 3 + 1) * height);
  let seed = 7;
  for (let y=0;y<height;y++)for(let x=0;x<width;x++){
    seed = (Math.imul(seed,1664525)+1013904223)>>>0;
    const n = (seed>>>26)-32, edge=x<width/2?90:170, i=y*(width*3+1)+1+x*3;
    scan[i]=edge+n;scan[i+1]=edge+Math.round(n*.3);scan[i+2]=edge-n;
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  return Buffer.concat([Buffer.from("89504e470d0a1a0a","hex"),chunk("IHDR",header),chunk("IDAT",deflateSync(scan)),chunk("IEND",Buffer.alloc(0))]);
}
(async()=>{
  const out=path.resolve("tests/fixtures/results");await fs.mkdir(out,{recursive:true});
  const source=path.join(out,"detail-noise.png");await fs.writeFile(source,chart());
  const engine=new Engine(process.env.FILMLAB_ENGINE||path.resolve("native/target/release/filmlab-professional-engine"+(process.platform==="win32"?".exe":"")));
  try{
    const hello=await engine.start();assert.match(hello.engine,/filmlab-pro-0.9/);
    await engine.request("open",{key:"photo",kind:"photo",path:source});
    const output=path.join(out,"detail-after.png"),beforeOutput=path.join(out,"detail-before.png");
    const inspect=settings=>engine.request("detail-preview",{key:"photo",path:source,x:.5,y:.5,width:320,height:200,settings,output,beforeOutput});
    const baseline=await inspect({});
    assert.deepEqual([baseline.fullWidth,baseline.fullHeight,baseline.width,baseline.height],[2200,1500,320,200]);
    assert.deepEqual([baseline.x,baseline.y],[940,650]);
    const baselineBytes=await fs.readFile(output);
    assert.deepEqual(baselineBytes,await fs.readFile(beforeOutput));
    await inspect({sharpness:90,sharpenRadius:.6});const small=await fs.readFile(output);
    await inspect({sharpness:90,sharpenRadius:2.5});assert.notDeepEqual(await fs.readFile(output),small);
    await inspect({denoiseColor:80});assert.notDeepEqual(await fs.readFile(output),baselineBytes);
    assert.deepEqual(await fs.readFile(beforeOutput),baselineBytes);
    await assert.rejects(()=>engine.request("detail-preview",{key:"photo",path:source,settings:{},x:2,y:.5,width:320,height:200,output,beforeOutput}),/inválido/);
    await assert.rejects(()=>engine.request("detail-preview",{key:"photo",path:source,settings:{},x:.5,y:.5,width:2048,height:200,output,beforeOutput}),/inválido/);
    await engine.request("detail-release",{key:"photo"});
    await inspect({denoise:30,denoiseDetail:70});
    const settings={sharpness:75,sharpenRadius:1.5,sharpenMasking:60,denoise:30,denoiseDetail:65,denoiseColor:40};
    const exported=await engine.request("export",{key:"photo",path:source,settings,output:path.join(out,"detail-export.jpg")});
    assert.equal(exported.diagnostics.settings.sharpenRadius,1.5);
    assert.equal(exported.diagnostics.settings.denoiseColor,40);
    for(const [key,kind,name] of [["raw","photo","synthetic.dng"],["video","video","clip.mp4"]]){
      const file=path.resolve("tests/fixtures",name);
      await engine.request("open",{key,kind,path:file});
      const r=await engine.request("detail-preview",{key,path:file,time:.1,x:.5,y:.5,width:320,height:200,settings,output,beforeOutput});
      assert(r.width<=320&&r.height<=200&&r.width>0&&r.fullWidth>=r.width);
    }
    console.log("Detalle nativo: recorte real de una foto 2200×1500, radio, NR de color, comparación, límites, liberación, RAW, video y exportación verificados.");
  }finally{engine.stop();}
})().catch(error=>{console.error(error);process.exitCode=1;});
