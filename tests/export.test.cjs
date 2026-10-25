const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {Engine}=require('../desktop/engine.cjs');
const {makeReport}=require('../desktop/export-report.cjs');
async function progress(){return import('data:text/javascript;base64,'+Buffer.from(await fs.readFile('ui/export-progress.js')).toString('base64'));}
test('progress never promises completion before the file is committed; unknown ETA stays unknown',async()=>{
 const {progressView,durationLabel}=await progress();
 assert.equal(progressView({fraction:1}).fraction,.99);
 assert.equal(progressView({fraction:1,committed:true}).fraction,1);
 assert.equal(progressView({fraction:NaN}).fraction,0);
 assert.match(progressView({phase:'finalizing'}).eta,/audio y contenedor/);
 assert.match(progressView({fileTotal:3,fileIndex:1}).headline,/Archivo 2 de 3/);
 assert.equal(durationLabel(null),'Calculando…');
 assert.equal(durationLabel(Infinity),'Calculando…');
 assert.equal(durationLabel(62.2),'1 min 3 s');
 assert.match(progressView({encoder:'CPU'}).encoder,/CPU/);
 assert.doesNotMatch(progressView({kind:'photo'}).encoder,/NVENC/);
});
test('cancel targets the pending export, not a preview or another request',()=>{
 const engine=new Engine('unused');let sent;
 engine.child={stdin:{write:value=>sent=JSON.parse(value)}};
 engine.pending.set(7,{op:'preview'});engine.pending.set(8,{op:'export'});
 engine.cancel();assert.deepEqual(sent,{op:'cancel',id:8});
 engine.pending.clear();sent=null;engine.cancel();assert.equal(sent,null);
});
test('diagnostic keeps timings and filenames without known source or temporary paths',()=>{
 const original='C:\\Users\\Mariano\\Photos\\photo.jpg';
 const report=makeReport({name:'photo.jpg',kind:'photo',status:'failed',error:'Cannot open '+original,result:{diagnostics:{error:'failed '+original,wallMs:20}},redact:[original]});
 assert.equal(report.fileName,'photo.jpg');assert.equal(report.export.wallMs,20);
 assert.ok(!JSON.stringify(report).includes('Mariano'));assert.match(report.error,/ruta local/);
 assert.ok(!JSON.stringify(report).includes('C:\\\\Users'));
});
