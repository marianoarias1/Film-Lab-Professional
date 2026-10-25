const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const vm=require('node:vm');
async function model(){const src=await fs.readFile('ui/model.js','utf8');return import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));}
test('masks retain independent per-file geometry and adjustments through undo, redo and project snapshots',async()=>{
 const {newFile,commitEdit,undo,redo,projectSnapshot}=await model();const a=newFile({id:'a'}),b=newFile({id:'b'});
 const old=structuredClone(a.settings);a.settings.masks.push({id:1,name:'Radial',visible:true,invert:false,components:[{shape:{kind:'radial',center:{x:.2,y:.4},rx:.3,ry:.2}}],adjust:{exposure:1,shadows:20}});commitEdit(a,old);assert.equal(b.settings.masks.length,0);
 assert(undo(a));assert.equal(a.settings.masks.length,0);assert(redo(a));assert.equal(a.settings.masks[0].adjust.shadows,20);
 const snap=projectSnapshot({name:'Masks',files:[a,b],activeId:'a'});assert.equal(snap.files[0].settings.masks[0].components[0].shape.center.x,.2);
 a.settings.masks[0].adjust.exposure=2;assert.equal(snap.files[0].settings.masks[0].adjust.exposure,1);
});
