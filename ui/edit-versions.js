import { saveEditVersion, restoreEditVersion } from "./model.js";

export function mountEditVersions({ $, current, isBusy, prepare, saved, restored, notify }) {
  let source = null, lastFile, lastVersions, lastBusy;
  const dialog = $("versionDialog");
  function draw() {
    const file = current(), busy = isBusy();
    $("saveVersion").disabled = !file || busy;
    if (file === lastFile && file?.versions === lastVersions && busy === lastBusy) return;
    lastFile = file;
    lastVersions = file?.versions;
    lastBusy = busy;
    const versions = file?.versions ?? [];
    $("versionsCount").textContent = versions.length;
    $("versionsEmpty").hidden = !!versions.length;
    $("versionsUndoHint").hidden = !versions.length;
    const rows = versions.map(version => {
      const row = document.createElement("div");
      row.className = "edit-version-row";
      const name = document.createElement("span");
      name.textContent = version.name;
      name.title = version.name;
      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "plain";
      restore.textContent = "Restaurar";
      restore.setAttribute("aria-label", "Restaurar " + version.name);
      restore.disabled = busy;
      restore.onclick = () => {
        if (isBusy() || current() !== file) return;
        prepare();
        if (restoreEditVersion(file, version.id)) {
          restored();
          notify("Versión restaurada. Podés deshacer este cambio.");
        } else notify("El archivo ya tiene los ajustes de esa versión.");
      };
      row.append(name, restore);
      return row;
    });
    $("versionsList").replaceChildren(...rows);
  }
  $("saveVersion").onclick = () => {
    if (!current() || isBusy()) return;
    prepare();
    source = current();
    $("versionFileName").textContent = source.name;
    $("versionName").value = "";
    $("versionNameError").hidden = true;
    dialog.showModal();
    $("versionName").focus();
  };
  for (const id of ["cancelVersion", "backVersion"]) $(id).onclick = () => dialog.close();
  dialog.addEventListener("close", () => { source = null; });
  $("versionName").oninput = () => { $("versionNameError").hidden = true; };
  $("versionForm").onsubmit = event => {
    event.preventDefault();
    if (isBusy() || !source || source !== current()) return;
    try {
      saveEditVersion(source, $("versionName").value, crypto.randomUUID());
    } catch (error) {
      $("versionNameError").textContent = error.message;
      $("versionNameError").hidden = false;
      $("versionName").focus();
      return;
    }
    dialog.close();
    draw();
    saved();
    notify("Versión guardada en el proyecto.");
  };
  return { draw };
}
