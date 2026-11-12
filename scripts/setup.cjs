const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const revisions = {
  lightcraft: "d999e382bafbb5d5c54482fdb1d11f6a63bfdf69",
  filmcraft: "6c3948a36c80e4996d924766ba7157eec4fca85e",
};
function git(args, quiet = false) {
  return spawnSync("git", args, { stdio: quiet ? "ignore" : "inherit" });
}
for (const [repo, revision] of Object.entries(revisions)) {
  const destination = path.join(root, "vendor", repo);
  if (!fs.existsSync(path.join(destination, "Cargo.toml"))) {
    fs.mkdirSync(destination, { recursive: true });
    for (const args of [
      ["init", destination],
      ["-C", destination, "remote", "add", "origin", `https://github.com/storytold/${repo}.git`],
      ["-C", destination, "fetch", "--depth", "1", "origin", revision],
      ["-C", destination, "checkout", "--detach", "FETCH_HEAD"],
    ]) {
      const result = git(args);
      if (result.status !== 0) process.exit(result.status || 1);
    }
  }
  console.log(`${repo}: fuentes disponibles (${revision})`);
}
const lightcraft = path.join(root, "vendor", "lightcraft");
const photoDetailPatch = path.join(root, "third-party", "patches", "lightcraft-photo-detail.patch");
// This extension supersedes lines from the radius patch. Checking each older
// patch in reverse against the final sources would falsely report a conflict.
if (git(["-C", lightcraft, "apply", "--reverse", "--check", photoDetailPatch], true).status === 0) {
  console.log("Detalle fotográfico y sus extensiones previas ya aplicados. Fuentes listas.");
  process.exit(0);
}
const patch = path.join(root, "third-party", "patches", "lightcraft-deep-export.patch");
if (git(["-C", lightcraft, "apply", "--reverse", "--check", patch], true).status === 0) {
  console.log("LightCraft: extensión de exportación ya aplicada.");
} else {
  if (git(["-C", lightcraft, "apply", "--check", patch], true).status !== 0) {
    console.error("La extensión de exportación no coincide con estas fuentes. Revisá la revisión de LightCraft antes de continuar.");
    process.exit(1);
  }
  const result = git(["-C", lightcraft, "apply", patch]);
  if (result.status !== 0) process.exit(result.status || 1);
  console.log("LightCraft: extensión de exportación aplicada.");
}
const detailPatch = path.join(root, "third-party", "patches", "lightcraft-detail-radius.patch");
if (git(["-C", lightcraft, "apply", "--reverse", "--check", detailPatch], true).status !== 0) {
  const result = git(["-C", lightcraft, "apply", detailPatch]);
  if (result.status !== 0) process.exit(result.status || 1);
}
const v2Patch = path.join(root, "third-party", "patches", "lightcraft-process-v2.patch");
if (git(["-C", lightcraft, "apply", "--reverse", "--check", v2Patch], true).status !== 0) {
  if (git(["-C", lightcraft, "apply", "--check", v2Patch], true).status !== 0) {
    console.error("La extensión V2 no coincide con las fuentes fijadas de LightCraft.");
    process.exit(1);
  }
  const result = git(["-C", lightcraft, "apply", v2Patch]);
  if (result.status !== 0) process.exit(result.status || 1);
}
const tonesPatch = path.join(root, "third-party", "patches", "lightcraft-photo-tones.patch");
if (git(["-C", lightcraft, "apply", "--reverse", "--check", tonesPatch], true).status !== 0) {
  if (git(["-C", lightcraft, "apply", "--check", tonesPatch], true).status !== 0) {
    console.error("La extensión de tonos no coincide con las fuentes fijadas.");
    process.exit(1);
  }
  const result = git(["-C", lightcraft, "apply", tonesPatch]);
  if (result.status !== 0) process.exit(result.status || 1);
}
if (git(["-C", lightcraft, "apply", "--reverse", "--check", photoDetailPatch], true).status !== 0) {
  if (git(["-C", lightcraft, "apply", "--check", photoDetailPatch], true).status !== 0) {
    console.error("La extensión de detalle fotográfico no coincide con las fuentes fijadas.");
    process.exit(1);
  }
  const result = git(["-C", lightcraft, "apply", photoDetailPatch]);
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log("Fuentes listas. Ejecutá npm run build:engine y después npm start.");
