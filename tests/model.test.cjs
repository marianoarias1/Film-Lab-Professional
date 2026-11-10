const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
async function model() {
  return import(
    "data:text/javascript;base64," +
      Buffer.from(await fs.readFile("ui/model.js")).toString("base64")
  );
}
test("Las marcas de Biblioteca sobreviven al proyecto y no alteran exportación ni ajustes", async () => {
  const m = await model();
  const a = m.newFile({ id: "a", kind: "photo", review: "picked" });
  const b = m.newFile({ id: "b", kind: "photo", review: "unknown" });
  const c = m.newFile({ id: "c", kind: "video" });
  b.selected = false;
  b.review = "rejected";
  b.settings.exposure = 1.5;
  const saved = m.projectSnapshot({ files: [a, b, c], activeId: "a" });
  assert.deepEqual(saved.files.map(f => f.review), ["picked", "rejected", "unreviewed"]);
  assert.deepEqual(m.selectedIds(saved.files), ["a", "c"]);
  assert.equal(saved.files[1].settings.exposure, 1.5);
  assert.equal(m.newFile({ review: "unknown" }).review, "unreviewed");
});

test("El avance en Sin revisar elige la siguiente foto del orden anterior al marcado", async () => {
  const m = await model();
  const files = [
    { id: "a", kind: "photo" },
    { id: "b", kind: "video" },
    { id: "c", kind: "photo", review: "picked" },
    { id: "d", kind: "photo" },
  ];
  const before = m.reviewFiles(files, "unreviewed");
  files[0].review = "rejected";
  assert.equal(m.nextReviewFile(before, "a").id, "d");
  assert.equal(m.nextReviewFile(before, "d"), undefined);
  assert.deepEqual(m.reviewFiles(files, "unreviewed").map(f => f.id), ["d"]);
  assert.deepEqual(m.reviewFiles(files, "picked").map(f => f.id), ["c"]);
  assert.deepEqual(m.reviewFiles(files, "rejected").map(f => f.id), ["a"]);
});

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

test("Copiar por grupo captura una versión independiente y conserva luz, máscaras y Laboratorio", async () => {
  const m = await model();
  const source = m.newFile({ id: "source" }), target = m.newFile({ id: "target" });
  source.settings.exposure = 2;
  source.settings.temperature = 12;
  source.settings.hsl[2][0] = 20;
  target.settings.exposure = -1;
  target.settings.masks = [{ id: 1 }];
  target.settings.lightLeak = 30;
  target.settings.labEffects.enabled = true;
  const patch = m.copyAdjustments(source.settings, ["color"]);
  source.settings.hsl[2][0] = 80;
  assert.equal(m.applyAdjustments([target], patch), 1);
  assert.equal(target.settings.temperature, 12);
  assert.equal(target.settings.hsl[2][0], 20);
  assert.equal(target.settings.exposure, -1);
  assert.deepEqual(target.settings.masks, [{ id: 1 }]);
  assert.equal(target.settings.lightLeak, 30);
  assert.equal(target.settings.labEffects.enabled, true);
  assert.equal(m.applyAdjustments([target], patch), 0);
  assert.equal(target.history.length, 1);
  target.settings.hsl[2][0] = 0;
  assert.equal(patch.hsl[2][0], 20);
});

test("Un solo deshacer y rehacer desde el origen modifica todo el lote, sin cambiar exportación", async () => {
  const m = await model();
  const a = m.newFile({ id: "a" }), b = m.newFile({ id: "b" }), c = m.newFile({ id: "c" });
  a.settings.grain = 16;
  b.selected = false;
  b.recipe = "golden";
  c.settings.grain = 33;
  const patch = m.copyAdjustments(a.settings, ["grain"]);
  assert.equal(m.applyAdjustments([b, c, b], patch, a), 2);
  assert.deepEqual([b.settings.grain, c.settings.grain], [16, 16]);
  assert.equal(m.undo(a), true);
  assert.deepEqual([a.settings.grain, b.settings.grain, c.settings.grain], [16, 0, 33]);
  assert.equal(b.recipe, "golden");
  assert.equal(m.redo(c), true);
  assert.deepEqual([b.settings.grain, c.settings.grain], [16, 16]);
  assert.deepEqual(m.selectedIds([a, b, c]), ["a", "c"]);
  const saved = m.projectSnapshot({ files: [a, b, c], activeId: "a" });
  assert.equal(saved.files[1].settings.grain, 16);
  assert.equal(saved.files[1].history, undefined);
});

test("Una edición posterior protege todo el lote y una nueva edición descarta el rehacer compartido", async () => {
  const m = await model();
  const a = m.newFile({ id: "a" }), b = m.newFile({ id: "b" }), c = m.newFile({ id: "c" });
  a.settings.exposure = 2;
  m.applyAdjustments([b, c], m.copyAdjustments(a.settings, ["light"]), a);
  const before = structuredClone(b.settings);
  b.settings.contrast = 18;
  m.commitEdit(b, before);
  assert.equal(m.historyBlocker(a, "undo"), b);
  assert.equal(m.undo(a), false);
  assert.equal(c.settings.exposure, 2);
  assert.equal(b.settings.contrast, 18);
  assert.equal(m.undo(b), true);
  assert.equal(m.undo(a), true);
  assert.deepEqual([b.settings.exposure, c.settings.exposure], [0, 0]);
  const old = structuredClone(c.settings);
  c.settings.grain = 12;
  m.commitEdit(c, old);
  assert.equal(m.redo(a), false);
  assert.equal(m.redo(b), false);
  assert.equal(b.settings.exposure, 0);
});
