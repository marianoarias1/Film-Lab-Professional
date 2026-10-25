const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const {
  ProjectStore,
  ENGINE,
  validateProject,
} = require("../desktop/project-store.cjs");
const doc = (p) => ({
  schemaVersion: 1,
  engineVersion: ENGINE,
  name: "Test",
  files: [{ id: "a", path: p, kind: "photo", settings: { exposure: 1 } }],
});
test("Guardado atómico serializado recupera última revisión y reporta original faltante", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "flpro-test-"));
  try {
    const file = path.join(dir, "test.flpro"),
      store = new ProjectStore(file);
    await Promise.all([
      store.save(file, doc(path.join(dir, "gone.jpg"))),
      store.save(file, { ...doc(path.join(dir, "gone.jpg")), name: "Last" }),
    ]);
    const r = await store.read(file);
    assert.equal(r.name, "Last");
    assert.equal(r.files[0].missing, true);
    assert.deepEqual((await fs.readdir(dir)).sort(), ["test.flpro"]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("Rechaza proyectos de otro motor y referencias ambiguas", () => {
  assert.throws(() =>
    validateProject({ ...doc("/foo"), engineVersion: "other" }),
  );
  const p = doc("/foo");
  p.files.push({ ...p.files[0] });
  assert.throws(() => validateProject(p));
  assert.throws(() => validateProject(doc("../escape")));
});

test("Migra proyectos 0.1-0.3 sin modificar sus ajustes y marca el motor 0.4",()=>{
  const p=doc("/source/photo.jpg");p.engineVersion="filmlab-pro-0.1-lc-d999e382-fc-6c3948a3";
  p.files[0].settings={exposure:.3,grain:12,curve:[[0,0],[1,1]]};
  const upgraded=validateProject(p);assert.equal(upgraded.engineVersion,ENGINE);assert.deepEqual(upgraded.files[0].settings,p.files[0].settings);
  assert.notEqual(upgraded.engineVersion,p.engineVersion);
});
