const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const ENGINE = "filmlab-pro-0.5-lc-d999e382-fc-6c3948a3";
const LEGACY_ENGINE = "filmlab-pro-0.1-lc-d999e382-fc-6c3948a3";
function validateProject(p) {
  if (
    !p ||
    p.schemaVersion !== 1 ||
    ![ENGINE,LEGACY_ENGINE,"filmlab-pro-0.4-lc-d999e382-fc-6c3948a3"].includes(p.engineVersion) ||
    !Array.isArray(p.files) ||
    p.files.length > 500
  )
    throw new Error("Proyecto incompatible con esta versión de Professional.");
  const ids = new Set();
  for (const f of p.files) {
    if (
      !f ||
      typeof f.id !== "string" ||
      ids.has(f.id) ||
      typeof f.path !== "string" ||
      !path.isAbsolute(f.path) ||
      !["photo", "video"].includes(f.kind) ||
      !f.settings ||
      typeof f.settings !== "object"
    )
      throw new Error("El proyecto contiene un archivo inválido.");
    ids.add(f.id);
  }
  return {...p,engineVersion:ENGINE};
}
async function atomicWrite(file, value) {
  const temp = file + "." + crypto.randomUUID() + ".tmp";
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    const handle = await fs.open(temp, "wx");
    try {
      await handle.writeFile(JSON.stringify(value, null, 2));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temp, file);
  } catch (e) {
    await fs.rm(temp, { force: true }).catch(() => {});
    throw e;
  }
}
class ProjectStore {
  constructor(recovery) {
    this.recovery = recovery;
    this.queue = Promise.resolve();
  }
  save(file, value) {
    const validated = validateProject(value);
    this.queue = this.queue
      .catch(() => {})
      .then(() => atomicWrite(file, validated));
    return this.queue;
  }
  async read(file) {
    const s = await fs.stat(file);
    if (s.size > 16 * 1024 * 1024)
      throw new Error("El proyecto supera el tamaño permitido.");
    const p = validateProject(JSON.parse(await fs.readFile(file, "utf8")));
    return {
      ...p,
      files: await Promise.all(
        p.files.map(async (f) => {
          try {
            const stat = await fs.stat(f.path);
            return {
              ...f,
              missing: !stat.isFile(),
              changed: f.identity
                ? stat.size !== f.identity.size ||
                  Math.abs(stat.mtimeMs - f.identity.mtimeMs) > 2
                : false,
            };
          } catch {
            return { ...f, missing: true };
          }
        }),
      ),
    };
  }
}
module.exports = { ProjectStore, validateProject, atomicWrite, ENGINE };
