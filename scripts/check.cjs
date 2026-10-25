const { spawnSync } = require("node:child_process");
const { readdirSync, readFileSync } = require("node:fs");
let failed = false;
for (const folder of ["desktop", "scripts", "ui"])
  for (const file of readdirSync(folder)) {
    if (!/\.(cjs|js)$/.test(file)) continue;
    const input = readFileSync(`${folder}/${file}`, "utf8");
    const r = spawnSync(
      process.execPath,
      ["--check", ...(file.endsWith(".js") ? ["--input-type=module"] : [])],
      { input, encoding: "utf8" },
    );
    if (r.status) {
      failed = true;
      console.error(folder + "/" + file, r.stderr);
    }
  }
if (failed) process.exit(1);
console.log("Sintaxis correcta.");
