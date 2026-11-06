const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
async function model() {
  return import(
    "data:text/javascript;base64," +
      Buffer.from(await fs.readFile("ui/model.js")).toString("base64")
  );
}
test("Ajustes e historial independientes por archivo", async () => {
  const m = await model(),
    a = m.newFile({ id: "a" }),
    b = m.newFile({ id: "b" });
  const before = structuredClone(a.settings);
  a.settings.exposure = 1;
  m.commitEdit(a, before);
  assert.equal(b.settings.exposure, 0);
  assert.equal(a.history.length, 1);
  m.undo(a);
  assert.equal(a.settings.exposure, 0);
  m.redo(a);
  assert.equal(a.settings.exposure, 1);
  assert.equal(b.history.length, 0);
});
test("Un gesto equivale a un paso; una edición nueva invalida rehacer", async () => {
  const m = await model(),
    f = m.newFile({ id: "a" }),
    before = structuredClone(f.settings);
  for (let i = 0; i < 20; i++) f.settings.contrast = i;
  m.commitEdit(f, before);
  assert.equal(f.history.length, 1);
  m.undo(f);
  const last = structuredClone(f.settings);
  f.settings.temperature = 5;
  m.commitEdit(f, last);
  assert.equal(f.future.length, 0);
  assert.equal(m.redo(f), false);
});
test("Exportación respeta selección vacía y parcial", async () => {
  const m = await model();
  assert.deepEqual(
    m.selectedIds([
      { id: "a", selected: true },
      { id: "b", selected: false },
    ]),
    ["a"],
  );
  assert.deepEqual(m.selectedIds([{ id: "a", selected: false }]), []);
});
test("Snapshot versionado, sin historial efímero y sin alias de ajustes", async () => {
  const m = await model(),
    f = m.newFile({ id: "a", path: "test.jpg", kind: "photo" });
  f.history.push({ exposure: 1 });
  const p = m.projectSnapshot({ name: "Uno", activeId: "a", files: [f] });
  assert.equal(p.engineVersion, m.ENGINE);
  assert.equal(p.files[0].history, undefined);
  f.settings.curve.push([0, 0]);
  assert.equal(p.files[0].settings.curve.length, 0);
});
test('Desenfoque y ventanas conservan historial independiente y sobreviven al proyecto',async()=>{
 const m=await model(),a=m.newFile({id:'a'}),b=m.newFile({id:'b'}),before=structuredClone(a.settings);
 a.settings.labEffects.enabled=true;a.settings.labEffects.points[0]=[.1,.2];a.settings.labEffects.windows.push({x:.2,y:.2,width:.3,height:.4,feather:20,border:3});m.commitEdit(a,before);
 assert.equal(b.settings.labEffects.enabled,false);assert.equal(b.settings.labEffects.windows.length,0);m.undo(a);assert.equal(a.settings.labEffects.windows.length,0);m.redo(a);assert.equal(a.settings.labEffects.windows.length,1);
 const p=m.projectSnapshot({files:[a,b],activeId:'a'});assert.deepEqual(p.files[0].settings.labEffects,a.settings.labEffects);p.files[0].settings.labEffects.points[0][0]=.9;assert.equal(a.settings.labEffects.points[0][0],.1);
});
test('Migra el efecto 0.7 a una capa sin perder curvas ni ventanas y sin mutar el proyecto',async()=>{
 const m=await model(),legacy={enabled:true,mode:'path',amount:80,distance:60,points:[[.1,.2],[.8,.7],[.4,.2]],windows:[{x:.1,y:.2,width:.2,height:.3,feather:20,border:0}]},copy=structuredClone(legacy),stack=m.normalizeEffects(legacy);
 assert.equal(stack.stack,true);assert.equal(stack.layers.length,1);assert.deepEqual(stack.layers[0].points,legacy.points);assert.deepEqual(stack.layers[0].windows,legacy.windows);assert.deepEqual(legacy,copy);const again=m.normalizeEffects(stack);assert.deepEqual(again,stack);again.layers[0].points[0][0]=.7;assert.equal(stack.layers[0].points[0][0],.1);
});
test('Capas y pincel de nitidez usan un historial por archivo',async()=>{
 const m=await model(),a=m.newFile({id:'a'}),b=m.newFile({id:'b'}),before=structuredClone(a.settings);a.settings.labEffects.enabled=true;a.settings.labEffects.layers.push({...m.effectLayerDefaults(),mode:'path',paths:[{points:[[.1,.2],[.8,.7],[.4,.2]],distance:45,influence:55}],strokes:[{points:[[.4,.4],[.5,.5]],size:.2,feather:80,erase:false}]});m.commitEdit(a,before);assert.equal(b.settings.labEffects.layers.length,0);m.undo(a);assert.equal(a.settings.labEffects.layers.length,0);m.redo(a);assert.equal(a.settings.labEffects.layers[0].strokes.length,1);assert.equal(m.projectSnapshot({files:[a],activeId:'a'}).files[0].settings.labEffects.layers[0].paths.length,1);
});
