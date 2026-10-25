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
console.log("Fuentes listas. Ejecutá npm run build:engine y después npm start.");
