const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const model=import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('ui/model.js','utf8')).toString('base64'));
test('Resplandor independiente por archivo, reversible y persistente',async()=>{const m=await model;const a=m.newFile({id:'a',name:'a.jpg'}),b=m.newFile({id:'b',name:'b.jpg'});const old=structuredClone(a.settings);a.settings.glow.enabled=true;a.settings.glow.amount=70;m.commitEdit(a,old);assert.equal(b.settings.glow.enabled,false);m.undo(a);assert.equal(a.settings.glow.enabled,false);m.redo(a);assert.equal(a.settings.glow.amount,70);const p=m.projectSnapshot({name:'Glow',files:[a,b],activeId:a.id});assert.equal(p.files[0].settings.glow.amount,70);});
test('Copiar resplandor no enlaza una máscara ajena del otro archivo',async()=>{const m=await model,s=m.defaults();s.glow.maskId=3;s.glow.enabled=true;const patch=m.copyAdjustments(s,['glow']);assert.equal(patch.glow.maskId,null);assert.equal(patch.glow.enabled,true);assert.equal(s.glow.maskId,3);});

test('Movimiento y suavidad se guardan en el historial sin cambiar otras fotos',async()=>{
 const m=await model,a=m.newFile({id:'a',name:'a.jpg'}),b=m.newFile({id:'b',name:'b.jpg'});
 const old=structuredClone(a.settings);a.settings.glow.style='motion';a.settings.glow.softness=12;a.settings.glow.angle=90;m.commitEdit(a,old);
 const patch=m.copyAdjustments(a.settings,['glow']);assert.equal(patch.glow.softness,12);
 m.undo(a);assert.equal(a.settings.glow.style,'soft');m.redo(a);assert.equal(a.settings.glow.softness,12);
 assert.equal(b.settings.glow.softness,50);
 assert.equal(m.settingValue({glow:{style:'directional'}},'glow.softness'),50);
});
