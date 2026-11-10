const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');
const display=fs.readFile('ui/display-controls.js','utf8').then(s=>import('data:text/javascript;base64,'+Buffer.from(s).toString('base64')));
test('draft and refined previews fit the same viewport without intrinsic-size shrink',async()=>{
 const {fittedPreview}=await display;const aspect=2/3;
 assert.deepEqual(fittedPreview(1200,900,aspect),{width:600,height:900});
 assert.deepEqual(fittedPreview(600,900,aspect),{width:600,height:900});
 assert.deepEqual(fittedPreview(600,900,3/2),{width:600,height:400});
 assert.equal(fittedPreview(0,900,aspect),null);
});
