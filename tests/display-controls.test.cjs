const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');
const display=fs.readFile('ui/display-controls.js','utf8').then(s=>import('data:text/javascript;base64,'+Buffer.from(s).toString('base64')));
test('draft and refined previews fit the same viewport without intrinsic-size shrink',async()=>{
 const {fittedPreview}=await display;const aspect=2/3;
 assert.deepEqual(fittedPreview(1200,900,aspect),{width:600,height:900});
 assert.deepEqual(fittedPreview(600,900,aspect),{width:600,height:900});
 assert.deepEqual(fittedPreview(600,900,3/2),{width:600,height:400});
 assert.equal(fittedPreview(0,900,aspect),null);
});
test('zoom panning follows drag and stops at photo edges',async()=>{
 const source=await fs.readFile('ui/display-controls.js','utf8');const {panPreview}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 assert.deepEqual(panPreview({x:0,y:0},50,-40,800,600,2,800,600),{x:50,y:-40});
 assert.deepEqual(panPreview({x:0,y:0},999,-999,800,600,2,800,600),{x:400,y:-300});
 assert.deepEqual(panPreview({x:0,y:0},20,20,400,300,1,800,600),{x:0,y:0});
});
