const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const tools=()=>fs.readFile('ui/curve-tools.js','utf8').then(s=>import('data:text/javascript;base64,'+Buffer.from(s).toString('base64')));
test('curve adds points in input order, rejects duplicate inputs and limits count',async()=>{
 const {addCurvePoint}=await tools();const src=[[0,0],[.5,.5],[1,1]];
 assert.deepEqual(addCurvePoint(src,.25,.8),{curve:[[0,0],[.25,.8],[.5,.5],[1,1]],index:1});
 assert.equal(addCurvePoint(src,.5,.9),null);assert.equal(addCurvePoint(src,NaN,0),null);
 assert.equal(addCurvePoint(Array.from({length:32},(_,i)=>[i/31,i/31]),.2,.8),null);
 assert.equal(src.length,3);
});
test('curve moves on both axes without crossing neighbors or changing endpoints',async()=>{
 const {moveCurvePoint}=await tools();const src=[[0,0],[.25,.25],[.5,.5],[1,1]];
 assert.deepEqual(moveCurvePoint(src,1,.4,.8)[1],[.4,.8]);
 assert(moveCurvePoint(src,1,.9,.5)[1][0]<.5);
 assert.deepEqual(moveCurvePoint(src,0,.4,-1)[0],[0,0]);
 assert.deepEqual(moveCurvePoint(src,3,.4,2)[3],[1,1]);
 assert.deepEqual(src[1],[.25,.25]);
});
test('very close imported curve points remain strictly ordered when dragged',async()=>{
 const {moveCurvePoint}=await tools();const src=[[0,0],[.4999,.4],[.5,.5],[.5001,.6],[1,1]];
 const out=moveCurvePoint(src,2,.9,.7);
 assert(out[1][0]<out[2][0]&&out[2][0]<out[3][0]);
});
test('photo delivery presets have safe defaults and omit video configuration',async()=>{
 const source=await fs.readFile('ui/delivery.js','utf8');const {deliveryPresets,deliveryDefaults}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 assert.equal(deliveryDefaults().width,0);assert.equal(deliveryDefaults().upscale,false);
 assert.deepEqual([deliveryPresets.reel.width,deliveryPresets.reel.height],[1080,1920]);
 for(const preset of Object.values(deliveryPresets))for(const key of ['fps','bitrateMbps','audioKbps'])assert.equal(key in preset,false);
});
