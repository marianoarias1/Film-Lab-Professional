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
