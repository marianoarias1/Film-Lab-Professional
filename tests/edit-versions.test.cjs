const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { ProjectStore, validateProject } = require("../desktop/project-store.cjs");

async function model() {
  return import("data:text/javascript;base64," +
    Buffer.from(await fs.readFile("ui/model.js")).toString("base64"));
}
test("A version captures every adjustment independently and restores in one undoable step", async () => {
  const m = await model(), a = m.newFile({ id: "a" }), b = m.newFile({ id: "b" });
  a.settings.exposure = 1.5;
  a.settings.masks = [{ id: 7, components: [{ shape: { kind: "radial" } }], adjust: { exposure: 1 } }];
  a.settings.labEffects.layers.push({ mode: "path", points: [[0,0],[1,1]] });
  a.settings.curve = [[0, 0.1], [1, 1]];
  a.recipe = "golden";
  a.selected = false;
  a.review = "picked";
  m.saveEditVersion(a, " Color cálido ", "v1");
  const saved = structuredClone(a.versions[0]);
  a.settings.masks[0].adjust.exposure = -2;
  a.settings.labEffects.layers[0].points[0][0] = 0.6;
  a.settings.exposure = -1;
  a.recipe = null;
  const before = structuredClone(a.settings);
  assert.equal(m.restoreEditVersion(a, "v1"), true);
  assert.deepEqual(a.settings, saved.settings);
  assert.equal(a.recipe, "golden");
  assert.equal(a.history.length, 1);
  assert.equal(m.undo(a), true);
  assert.deepEqual(a.settings, before);
  assert.equal(a.recipe, null);
  assert.equal(m.redo(a), true);
  assert.equal(a.recipe, "golden");
  a.settings.masks[0].adjust.exposure = 9;
  assert.equal(a.versions[0].settings.masks[0].adjust.exposure, 1);
  assert.equal(b.versions.length, 0);
  assert.equal(a.selected, false);
  assert.equal(a.review, "picked");
});

test("Version names are unique per file; restoring the current state adds no history", async () => {
  const m = await model(), a = m.newFile({ id: "a" }), b = m.newFile({ id: "b" });
  assert.throws(() => m.saveEditVersion(a, "   ", "v1"));
  assert.throws(() => m.saveEditVersion(a, "a".repeat(81), "v1"));
  m.saveEditVersion(a, "Verano", "v1");
  assert.throws(() => m.saveEditVersion(a, " verano ", "v2"), /nombre/);
  m.saveEditVersion(b, "Verano", "v2");
  assert.equal(m.restoreEditVersion(a, "v1"), false);
  assert.equal(a.history.length, 0);
  assert.throws(() => m.restoreEditVersion(b, "v1"), /en este archivo/);
});

test("Restoring a version preserves a prior shared batch and undo/redo ordering", async () => {
  const m = await model(), a = m.newFile({ id: "a" }), b = m.newFile({ id: "b" });
  m.saveEditVersion(b, "Original", "v1");
  a.settings.exposure = 2;
  m.applyAdjustments([b], m.copyAdjustments(a.settings, ["light"]), a);
  m.restoreEditVersion(b, "v1");
  assert.equal(m.undo(a), false);
  assert.equal(m.undo(b), true);
  assert.equal(b.settings.exposure, 2);
  assert.equal(m.undo(a), true);
  assert.equal(b.settings.exposure, 0);
  assert.equal(m.redo(a), true);
  assert.equal(b.settings.exposure, 2);
  assert.equal(m.redo(b), true);
  assert.equal(b.settings.exposure, 0);
});

test("Local projects and recovery retain versions; malformed versions and oversized writes cannot replace a good save", async () => {
  const m = await model(), dir = await fs.mkdtemp(path.join(os.tmpdir(), "filmlab-versions-"));
  try {
    const a = m.newFile({ id: "a", path: path.join(dir, "photo.jpg"), kind: "photo" });
    a.settings.exposure = 1;
    m.saveEditVersion(a, "Primera", "v1");
    const project = m.projectSnapshot({ files: [a], activeId: "a" });
    const file = path.join(dir, "project.flpro"), store = new ProjectStore(path.join(dir, "recovery.flpro"));
    await store.save(file, project);
    await store.save(store.recovery, project);
    const read = await store.read(file), recovered = await store.read(store.recovery);
    assert.deepEqual(read.files[0].versions, recovered.files[0].versions);
    const restored = { ...m.newFile(read.files[0]), settings: m.defaults() };
    assert.equal(m.restoreEditVersion(restored, "v1"), true);
    assert.equal(restored.settings.exposure, 1);
    const malformed = structuredClone(project);
    malformed.files[0].versions[0].settings = [];
    assert.throws(() => validateProject(malformed), /versión/);
    malformed.files[0].versions = [project.files[0].versions[0], project.files[0].versions[0]];
    assert.throws(() => validateProject(malformed), /versión/);
    const tooLarge = structuredClone(project);
    tooLarge.files[0].settings.tooLarge = "x".repeat(16 * 1024 * 1024);
    assert.throws(() => store.save(file, tooLarge), /16 MB/);
    assert.deepEqual((await store.read(file)).files[0].versions, read.files[0].versions);
    assert.equal(validateProject({ ...project, files: [{...project.files[0], versions:undefined}] }).files[0].versions, undefined);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
