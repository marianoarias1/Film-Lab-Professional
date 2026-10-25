const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const catalog=require('../ui/catalog/web-recipes.json');
test('web catalog retains 30 active looks, retired references, authors and source settings',()=>{
 assert.equal(catalog.visibleCount,30);assert.equal(catalog.recipes.filter(r=>!r.hiddenFromCatalog).length,30);
 assert.equal(catalog.recipes.length,51);assert.equal(new Set(catalog.recipes.map(r=>r.id)).size,51);
 for(const r of catalog.recipes){assert(r.creator&&r.description);assert(r.webSettings);assert(r.adaptation.professionalVersion===1);assert.equal(r.settings.hsl.length,8);assert(r.settings.curve.length<=32);assert(r.settings.curve.every((p,i,a)=>p.every(Number.isFinite)&&(!i||p[0]>a[i-1][0])));}
 const fuji=catalog.recipes.filter(r=>r.id.startsWith('shado-'));assert.equal(fuji.length,5);assert(fuji.every(r=>r.original&&r.creator.includes('@shadovisuals')&&r.source.startsWith('https://')));
});
test('new recipe controls survive per-file editing, undo/redo and legacy projects',async()=>{
 const m=await import('data:text/javascript;base64,'+Buffer.from(await fs.readFile('ui/model.js')).toString('base64'));m.installCatalog(catalog);
 assert.equal(m.recipes.filter(r=>r.legacy).length,5);assert.equal(new Set(m.recipes.map(r=>r.id)).size,m.recipes.length);
 const a=m.newFile({id:'a'}),b=m.newFile({id:'b'}),old=structuredClone(a.settings);
 m.setSettingValue(a.settings,'hsl.5.1',-35);a.settings.grainSize=55;m.commitEdit(a,old);
 assert.equal(m.settingValue(b.settings,'hsl.5.1'),0);assert.equal(m.settingValue({},'grainSize'),25);
 m.undo(a);assert.equal(m.settingValue(a.settings,'hsl.5.1'),0);m.redo(a);assert.equal(m.settingValue(a.settings,'hsl.5.1'),-35);
 const p=m.projectSnapshot({name:'Test',files:[a],activeId:'a'});a.settings.hsl[5][1]=0;assert.equal(p.files[0].settings.hsl[5][1],-35);
});
