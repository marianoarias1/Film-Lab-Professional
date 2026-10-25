import webCatalog from "./catalog/web-recipes.js";
import {PreviewQueue} from "./preview-queue.js";
import {progressView} from "./export-progress.js";
let cancelPending = false;
import {
  defaults,
  installCatalog,
  settingValue,
  setSettingValue,
  recipes,
  newFile,
  commitEdit,
  undo,
  redo,
  projectSnapshot,
  selectedIds,
} from "./model.js";
installCatalog(webCatalog);
let mixerBand=0;
let activeMaskId=null, brushSize=.05, brushFeather=60, brushErase=false, maskDrag=null;
const $ = (id) => document.getElementById(id),
  api = window.filmLab;
const state = { name: "Sin título", files: [], activeId: null };
let busy = false,
  group = "light",
  tab = "edit",
  previewRevision = 0,
  saveTimer,
  savePromise = Promise.resolve(),
  renderTimer,
  before = false,
  originalUrl = null,
  previewUrl = null,
  gesture = null,
  curveDrag = null,
  closing = false,
  saveError = null,
  toastTimer;
const definitions = {
  light: [
    ["exposure", "Exposición", -5, 5, 0.05, " EV"],
    ["contrast", "Contraste"],
    ["highlights", "Altas luces"],
    ["shadows", "Sombras"],
    ["whites", "Blancos"],
    ["blacks", "Negros"],
  ],
  color: [
    ["temperature", "Temperatura"],
    ["tint", "Matiz"],
    ["vibrance", "Intensidad"],
    ["saturation", "Saturación"],
  ],
  detail: [
    ["texture", "Textura"],
    ["clarity", "Claridad"],
    ["dehaze", "Borrar neblina"],
    ["grain", "Grano", 0, 100],
    ["grainSize", "Tamaño del grano", 0, 100],
    ["sharpness", "Nitidez", 0, 100],
    ["denoise", "Reducir ruido", 0, 100],
    ["vignette", "Viñeta", 0, 100],
  ],
  lab: [
    ["lightLeak", "Fuga de luz", 0, 100],
    ["leakSize", "Difusión", 0.05, 1, 0.01],
    ["leakTemperature", "Temperatura de la fuga"],
    ["grain", "Grano", 0, 100],
    ["shadowHue", "Color de sombras", 0, 360, 1, "°"],
    ["shadowAmount", "Intensidad en sombras", 0, 100],
    ["highlightHue", "Color de luces", 0, 360, 1, "°"],
    ["highlightAmount", "Intensidad en luces", 0, 100],
  ],
};
const current = () => state.files.find((f) => f.id === state.activeId);
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 3500);
}
function message(title, text) {
  $("messageTitle").textContent = title;
  $("messageText").textContent = text;
  if (!$("messageDialog").open) $("messageDialog").showModal();
}
$("messageClose").onclick = () => $("messageDialog").close();
function makeEl(tag, attrs = {}, text) {
  const el = document.createElement(tag);
  Object.assign(el, attrs);
  if (text !== undefined) el.textContent = text;
  return el;
}
function stopPlayback() {
  const v = $("playback");
  v.pause();
  v.hidden = true;
  v.removeAttribute("src");
  v.load();
  if (previewUrl) {
    $("preview").hidden = false;
  }
}
function edited({ render = true } = {}) {
  stopPlayback();
  originalUrl = null;
  saveSoon();
  updateButtons();
  drawRecipes();
  if (render) schedulePreview();
}
function updateButtons() {
  const f = current(),
    enabled = !!f && !busy;
  for (const id of ["reset", "before", "resetCurve"]) $(id).disabled = !enabled;
  $("undo").disabled = !enabled || !f.history.length;
  $("redo").disabled = !enabled || !f.future.length;
  $("exportButton").disabled = busy || !selectedIds(state.files).length;
  $("selectedCount").textContent = selectedIds(state.files).length;
  $("fileCount").textContent = state.files.length;
  $("controlsEmpty").hidden = !!f;
  $("playProxy").disabled = busy || !f;
  $("importButton").disabled = busy;
  $("emptyImport").disabled = busy;
  $("projectButton").disabled = busy;
  $("scrub").disabled = busy;
  document
    .querySelectorAll(
      ".controls input,.controls button:not([data-tab]):not([data-group])",
    )
    .forEach((el) => {
      el.disabled = !enabled;
    });
  for (const id of ["undo", "redo"])
    $(id).disabled =
      !enabled || !(id === "undo" ? f?.history.length : f?.future.length);
}
function drawFiles() {
  const list = $("filmstrip");
  list.replaceChildren();
  for (const f of state.files) {
    const item = makeEl("div", {
      className: "file" + (f.id === state.activeId ? " active" : ""),
      tabIndex: 0,
      role: "button",
      title: f.path,
    });
    item.setAttribute("aria-label", `Editar ${f.name}`);
    const check = makeEl("input", {
      type: "checkbox",
      checked: !!f.selected,
      title: "Seleccionar para exportar",
    });
    check.setAttribute("aria-label", `Exportar ${f.name}`);
    check.onclick = (e) => e.stopPropagation();
    check.onchange = () => {
      f.selected = check.checked;
      updateButtons();
      saveSoon();
    };
    item.append(
      check,
      makeEl(
        "span",
        { className: "type" },
        f.kind === "video" ? "VIDEO" : f.name.split(".").pop().toUpperCase(),
      ),
      makeEl(
        "span",
        { className: "file-icon" },
        f.kind === "video" ? "▷" : "▧",
      ),
      makeEl("strong", {}, f.name),
      makeEl(
        "small",
        {},
        f.missing
          ? "Original no encontrado"
          : f.recipe
            ? recipes.find((r) => r.id === f.recipe)?.name || "Editada"
            : "Ajustes propios",
      ),
    );
    item.onclick = () => activate(f.id);
    item.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate(f.id);
      }
    };
    list.append(item);
  }
  updateButtons();
}
function drawRecipes() {
  const list = $("recipeList");
  list.replaceChildren();
  const term = $("search").value.toLowerCase();
  for (const r of recipes.filter((r) =>
    (!r.hiddenFromCatalog || r.id===current()?.recipe) &&
    (r.name + " " + (r.creator||"") + " " + r.description).toLowerCase().includes(term) &&
    ($("recipeScene").value==="all" || r.recommendation?.scenes.includes($("recipeScene").value)) &&
    ($("recipeLook").value==="all" || r.recommendation?.looks.includes($("recipeLook").value)),
  )) {
    const button = makeEl("button", {
      className: "recipe" + (current()?.recipe === r.id ? " active" : ""),
      disabled: !current() || busy,
    });
    button.dataset.recipe=r.id;
    button.setAttribute("aria-pressed", String(current()?.recipe === r.id));
    const swatch = makeEl("span", { className: "swatch" });
    swatch.style.setProperty("--sky", r.sky);
    swatch.style.setProperty("--earth", r.earth);
    const text = makeEl("span");
    text.append(makeEl("strong", {}, r.name), makeEl("p", {}, r.description));
    if(r.creator) text.append(makeEl("small",{className:"recipe-credit"},r.creator));
    if(r.adaptation) text.append(makeEl("small",{className:"recipe-credit"},"Adaptación Professional"));
    button.append(swatch, text);
    button.onclick = () => {
      const f = current();
      const old = structuredClone(f.settings);
      f.settings = { ...defaults(), ...structuredClone(r.settings), masks: structuredClone(f.settings.masks || []) };
      f.recipe = r.id;
      commitEdit(f, old);
      drawControls();
      drawFiles();
      edited();
    };
    const row=makeEl("div",{className:"recipe-row"});row.append(button);
    if(r.source){const source=makeEl("button",{className:"plain recipe-source"},"Ver fuente ↗");source.onclick=async()=>{try{await api.openRecipeSource(r.id);}catch(error){message("Fuente",error.message);}};row.append(source);}
    list.append(row);
  }
  if(!list.children.length)list.append(makeEl("p",{className:"help"},"No hay recetas para esa búsqueda."));
}
function format(v, step = 1, suffix = "") {
  return Number(v).toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0) + suffix;
}
function slider(def, scope = "") {
  const [key, label, min = -100, max = 100, step = 1, suffix = ""] = def;
  const el = makeEl("div", { className: "control" }),
    row = makeEl(
      "label",
      { htmlFor: "control-" + (scope === "lab" ? "lab-" : "") + key },
      label,
    ),
    output = makeEl(
      "output",
      {},
      format(settingValue(current()?.settings,key), step, suffix),
    );
  const input = makeEl("input", {
    id: "control-" + (scope === "lab" ? "lab-" : "") + key,
    type: "range",
    min,
    max,
    step,
    value: settingValue(current()?.settings,key),
    disabled: !current() || busy,
  });
  row.append(output);
  el.append(row, input);
  const start = () => {
    if (!gesture && current())
      gesture = {
        id: current().id,
        before: structuredClone(current().settings),
      };
  };
  input.onpointerdown = start;
  input.onkeydown = (e) => {
    if (
      e.key.startsWith("Arrow") ||
      ["Home", "End", "PageUp", "PageDown"].includes(e.key)
    )
      start();
  };
  input.oninput = () => {
    start();
    const f = current();
    if (!f || busy) return;
    setSettingValue(f.settings,key,Number(input.value));
    f.recipe = null;
    output.textContent = format(input.value, step, suffix);
    schedulePreview(true);
  };
  const finish = () => {
    const f = current();
    if (gesture && gesture.id === f?.id) {
      commitEdit(f, gesture.before);
      gesture = null;
      edited();
    }
  };
  input.onchange = finish;
  input.onpointerup = finish;
  input.onpointercancel = finish;
  input.onblur = finish;
  input.ondblclick = () => {
    const f = current();
    if (!f) return;
    const old = structuredClone(f.settings);
    setSettingValue(f.settings,key,settingValue(defaults(),key));
    commitEdit(f, old);
    drawControls();
    edited();
  };
  return el;
}
function drawControls() {
  const f = current();
  $("editPanel").hidden = tab !== "edit";
  $("labPanel").hidden = tab !== "lab";
  $("panelTitle").textContent = tab === "lab" ? "Laboratorio." : "A tu manera.";
  $("sliders").replaceChildren(
    ...(definitions[group] || []).map((def) => slider(def)),
  );
  $("labSliders").replaceChildren(
    ...definitions.lab.map((def) => slider(def, "lab")),
  );
  if(group==="color"){
    const box=makeEl("label",{className:"mixer-label"},"Mezclador de color");
    const select=makeEl("select",{disabled:!current()||busy});
    ["Rojo","Naranja","Amarillo","Verde","Aqua","Azul","Púrpura","Magenta"].forEach((name,i)=>select.append(makeEl("option",{value:i,selected:i===mixerBand},name)));
    select.onchange=()=>{mixerBand=Number(select.value);drawControls();};box.append(select);$("sliders").append(box);
    ["Tono","Saturación","Luminosidad"].forEach((name,i)=>$("sliders").append(slider([`hsl.${mixerBand}.${i}`,name,-100,100])));
  }
  $("sliders").hidden = group === "curve";
  $("curvePanel").hidden = group !== "curve";
  drawCurve();
  drawMasks();
  updateButtons();
}
function curveValues() {
  return current()?.settings.curve.length >= 2 && current()?.settings.curve.length <=32
    ? current().settings.curve
    : [
        [0, 0],
        [0.25, 0.25],
        [0.5, 0.5],
        [0.75, 0.75],
        [1, 1],
      ];
}
function drawCurve() {
  const pts = curveValues();
  $("curvePath").setAttribute(
    "d",
    pts
      .map((p, i) => `${i ? "L" : "M"}${p[0] * 300},${(1 - p[1]) * 240}`)
      .join(" "),
  );
  const points = $("curvePoints");
  points.replaceChildren();
  pts.forEach((p, i) => {
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", p[0] * 300);
    c.setAttribute("cy", (1 - p[1]) * 240);
    c.setAttribute("r", 5);
    c.dataset.index = i;
    points.append(c);
  });
  const fields = $("curveInputs");
  fields.classList.toggle("many-points",pts.length>5);
  fields.replaceChildren();
  pts.forEach((p, i) => {
    const label = makeEl(
      "label",
      {},
      pts.length===5 ? ["Negros", "Sombras", "Medios", "Luces", "Blancos"][i] : `Entrada ${Math.round(p[0]*100)}`,
    );
    const input = makeEl("input", {
      type: "number",
      min: 0,
      max: 100,
      step: 1,
      value: Math.round(p[1] * 100),
      disabled: !current() || busy,
    });
    input.onchange = () => {
      const f = current();
      if (!f) return;
      const old = structuredClone(f.settings),
        curve = structuredClone(curveValues());
      curve[i][1] = Math.max(0, Math.min(100, Number(input.value) || 0)) / 100;
      f.settings.curve = curve;
      f.recipe = null;
      commitEdit(f, old);
      drawCurve();
      edited();
    };
    label.append(input);
    fields.append(label);
  });
}
$("curveSvg").onpointerdown = (e) => {
  if (!current() || busy || e.target.tagName !== "circle") return;
  curveDrag = {
    i: Number(e.target.dataset.index),
    before: structuredClone(current().settings),
  };
  $("curveSvg").setPointerCapture(e.pointerId);
  e.preventDefault();
};
$("curveSvg").onpointermove = (e) => {
  if (!curveDrag) return;
  const box = $("curveSvg").getBoundingClientRect(),
    curve = structuredClone(curveValues());
  curve[curveDrag.i][1] = Math.max(
    0,
    Math.min(1, 1 - (e.clientY - box.top) / box.height),
  );
  current().settings.curve = curve;
  current().recipe = null;
  drawCurve();
  schedulePreview(true);
};
const endCurve = () => {
  if (!curveDrag) return;
  commitEdit(current(), curveDrag.before);
  curveDrag = null;
  edited();
};
$("curveSvg").onpointerup = endCurve;
$("curveSvg").onpointercancel = endCurve;
$("resetCurve").onclick = () => {
  const f = current(),
    old = structuredClone(f.settings);
  f.settings.curve = [];
  f.recipe = null;
  commitEdit(f, old);
  drawCurve();
  edited();
};
function activate(id) {
  if (busy) return;
  gesture = null;
  before = false;
  stopPlayback();
  state.activeId = id;
  previewRevision++;
  previewQueue.invalidate();
  originalUrl = null;
  previewUrl = null;
  $("preview").hidden = true;
  $("emptyState").hidden = true;
  $("renderTime").textContent = "";
  const f = current();
  $("fileName").textContent = f.name;
  $("fileKind").textContent =
    f.kind === "video"
      ? "VIDEO · PROCESAMIENTO POR FOTOGRAMA"
      : "FOTOGRAFÍA · REVELADO NO DESTRUCTIVO";
  $("videoControls").hidden = f.kind !== "video";
  $("scrub").value = 0;
  $("timecode").textContent = "0:00";
  $("warning").hidden = true;
  drawFiles();
  drawRecipes();
  drawControls();
  schedulePreview();
  saveSoon();
}
const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const previewQueue = new PreviewQueue({
  render: job => api.preview(job),
  onBusy: active => { $("renderStatus").hidden = !active; },
  onError: (error, job) => {
    if (job.id !== state.activeId) return;
    $("warning").textContent = error.message;
    $("warning").hidden = false;
    $("renderTime").textContent = "Error al revelar";
    if (current()?.missing) toast("Buscá el original desde Proyecto → Volver a vincular.");
  },
  present: async (result, job, isCurrent) => {
    // Decode before replacing the visible image, retaining the previous preview meanwhile.
    const image = new Image(); image.src = result.url;
    await image.decode();
    if (!isCurrent() || job.id !== state.activeId || busy) return false;
    previewUrl = result.url;
    $("preview").src = before && originalUrl ? originalUrl : result.url;
    $("preview").hidden = false;
    $("emptyState").hidden = true;
    $("renderTime").textContent = `${Math.round(result.ms)} ms${job.draft ? " · vista rápida" : ""}`;
    $("engineStatus").textContent = "CPU · float32 · preview reducida";
    const file = current();
    Object.assign(file, {width:result.meta.width,height:result.meta.height,duration:result.meta.duration,raw:result.meta.raw});
    $("precision").textContent = file.raw ? "RAW → 32 bits lineales" : "32 bits · color lineal";
    if (file.kind === "video") $("scrub").max = Math.max(0.01,(file.duration || 0)-0.04);
    $("warning").textContent = (result.meta.warnings || []).join(" ");
    $("warning").hidden = !$("warning").textContent;
    // Measure presentation without holding up the next native render for two frames.
    result.paintReady = nextPaint();
    return true;
  },
  onSample: sample => {
    if (!sample.result.traceId) return;
    const measuredAt = performance.now();
    void Promise.resolve(sample.result.paintReady).then(() => {
      const paintedAt = performance.now();
      const presented = sample.presented && sample.job.epoch === previewQueue.epoch &&
        sample.job.id === state.activeId;
      return api.recordPreviewMetrics({traceId:sample.result.traceId,presented,
        inputToPaintMs:presented ? paintedAt-sample.job.inputAt : null,
        ipcMs:sample.ipcMs,presentationMs:sample.presentationMs+paintedAt-measuredAt,
        coalescedInputs:sample.coalesced});
    }).catch(()=>{});

  },
});
function schedulePreview(draft = false) {
  clearTimeout(renderTimer);
  const file = current();
  if (!file || busy) return;
  const revision = ++previewRevision;
  const inputAt = performance.now();
  const job = {id:file.id,settings:structuredClone(file.settings),time:Number($("scrub").value),revision,inputAt};
  // Submit immediately: waiting for the user to pause starves continuous drags.
  previewQueue.request({...job,draft:true});
  if (!draft) renderTimer = setTimeout(() => {
    if(revision === previewRevision && file.id === state.activeId && !busy)
      previewQueue.request({...job,draft:false,inputAt:performance.now(),refinement:true});
  },180);
}
async function importFiles() {
  if (busy) return;
  try {
    const added = await api.importFiles();
    if (!added.length) return;
    state.files.push(...added.map(newFile));
    activate(added[0].id);
    toast(
      `${added.length} archivo(s) agregados. Los originales permanecen en disco.`,
    );
  } catch (e) {
    message("No se pudo importar", e.message);
  }
}
$("importButton").onclick = importFiles;
$("emptyImport").onclick = importFiles;
$("search").oninput = drawRecipes;
$("recipeScene").onchange = drawRecipes;
$("recipeLook").onchange = drawRecipes;
$("catalogCount").textContent = String(webCatalog.visibleCount);
document.querySelectorAll("[data-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      tab = b.dataset.tab;
      document
        .querySelectorAll("[data-tab]")
        .forEach((x) => x.classList.toggle("active", x === b));
      drawControls();
    }),
);
document.querySelectorAll("[data-group]").forEach(
  (b) =>
    (b.onclick = () => {
      group = b.dataset.group;
      document
        .querySelectorAll("[data-group]")
        .forEach((x) => x.classList.toggle("active", x === b));
      drawControls();
    }),
);
$("undo").onclick = () => {
  if (!busy && undo(current())) {
    drawControls();
    edited();
  }
};
$("redo").onclick = () => {
  if (!busy && redo(current())) {
    drawControls();
    edited();
  }
};
$("reset").onclick = () => {
  const f = current(),
    old = structuredClone(f.settings);
  f.settings = defaults();
  f.recipe = null;
  commitEdit(f, old);
  drawControls();
  edited();
};
$("scrub").oninput = () => {
  stopPlayback();
  originalUrl = null;
  $("timecode").textContent = timeLabel(Number($("scrub").value));
  schedulePreview(true);
};
$("scrub").onchange = () => schedulePreview();
function timeLabel(s) {
  return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
}
let beforeToken = 0;
$("before").onpointerdown = async (e) => {
  if (!current() || busy) return;
  e.preventDefault();
  $("before").setPointerCapture(e.pointerId);
  before = true;
  const token = ++beforeToken;
  $("before").textContent = "Original";
  const id = state.activeId;
  if (originalUrl) {
    $("preview").src = originalUrl;
    return;
  }
  try {
    const r = await api.preview({
      id,
      settings: {},
      original: true,
      time: Number($("scrub").value),
      draft: false,
    });
    if (token === beforeToken && id === state.activeId) {
      originalUrl = r.url;
      if (before) $("preview").src = r.url;
    }
  } catch (e) {
    toast(e.message);
  }
};
function endBefore() {
  before = false;
  beforeToken++;
  $("before").textContent = "Mantener para ver original";
  if (previewUrl) $("preview").src = previewUrl;
}
$("before").onpointerup = endBefore;
$("before").onpointercancel = endBefore;
$("before").onlostpointercapture = endBefore;
$("before").oncontextmenu = (e) => e.preventDefault();
let leakGesture = null;
$("preview").onpointerdown = (e) => {
  if (chosenMask() || tab !== "lab" || !current() || busy || current().settings.lightLeak === 0)
    return;
  leakGesture = structuredClone(current().settings);
  $("preview").setPointerCapture(e.pointerId);
  moveLeak(e);
  e.preventDefault();
};
function moveLeak(e) {
  if (!leakGesture) return;
  const box = $("preview").getBoundingClientRect();
  current().settings.leakX = Math.max(
    0,
    Math.min(1, (e.clientX - box.left) / box.width),
  );
  current().settings.leakY = Math.max(
    0,
    Math.min(1, (e.clientY - box.top) / box.height),
  );
  schedulePreview(true);
}
$("preview").onpointermove = moveLeak;
function endLeak() {
  if (leakGesture) {
    current().recipe = null;
    commitEdit(current(), leakGesture);
    leakGesture = null;
    edited();
  }
}
$("preview").onpointerup = endLeak;
$("preview").onpointercancel = endLeak;
function saveSoon() {
  clearTimeout(saveTimer);
  $("saveStatus").textContent = "Guardando recuperación…";
  saveTimer = setTimeout(flushSave, 500);
}
function flushSave() {
  clearTimeout(saveTimer);
  if (!api) return Promise.resolve();
  const copy = projectSnapshot(state);
  savePromise = savePromise
    .catch(() => {})
    .then(() => api.autosave(copy))
    .then(() => {
      saveError = null;
      $("saveStatus").textContent = "✓ Recuperación guardada en este equipo";
    })
    .catch((e) => {
      saveError = e;
      $("saveStatus").textContent = "⚠ No se pudo guardar la recuperación";
    });
  return savePromise;
}
$("selectAll").onclick = () => {
  state.files.forEach((f) => (f.selected = true));
  drawFiles();
  saveSoon();
};
$("selectNone").onclick = () => {
  state.files.forEach((f) => (f.selected = false));
  drawFiles();
  saveSoon();
};
function closeProject() {
  $("projectMenu").hidden = true;
}
$("projectButton").onclick = () =>
  ($("projectMenu").hidden = !$("projectMenu").hidden);
$("closeProject").onclick = closeProject;
document.addEventListener("pointerdown", (e) => {
  if (!e.target.closest("#projectMenu,#projectButton")) closeProject();
});
$("projectName").oninput = () => {
  state.name = $("projectName").value;
  saveSoon();
};
$("saveProject").onclick = async () => {
  try {
    await flushSave();
    const r = await api.save(projectSnapshot(state));
    if (r) {
      toast("Proyecto guardado en disco");
      closeProject();
    }
  } catch (e) {
    message("No se pudo guardar", e.message);
  }
};
async function restore(p) {
  if (!p) return;
  clearTimeout(saveTimer);
  state.name = p.name;
  state.files = p.files.map((f) => ({
    ...newFile(f),
    settings: { ...defaults(), ...f.settings },
    recipe: f.recipe,
    selected: f.selected !== false,
  }));
  state.activeId = null;
  $("projectName").value = state.name;
  if (state.files.length)
    activate(
      state.files.find((f) => f.id === p.activeId)?.id || state.files[0].id,
    );
  else clearEditor();
  closeProject();
  if (state.files.some((f) => f.missing || f.changed))
    message(
      "Revisá los originales",
      "Hay archivos movidos, eliminados o modificados desde que guardaste el proyecto. Hacé doble clic en su tarjeta para volver a vincularlos.",
    );
}
$("openProject").onclick = async () => {
  try {
    await flushSave();
    await restore(await api.openProject());
  } catch (e) {
    message("No se pudo abrir el proyecto", e.message);
  }
};
$("newProject").onclick = async () => {
  try {
    await flushSave();
    if (await api.newProject()) {
      state.files = [];
      state.activeId = null;
      state.name = "Sin título";
      $("projectName").value = state.name;
      clearEditor();
      closeProject();
    }
  } catch (e) {
    message("No se pudo crear el proyecto", e.message);
  }
};
$("filmstrip").ondblclick = async (e) => {
  const card = e.target.closest(".file");
  if (!card || busy) return;
  const i = [...$("filmstrip").children].indexOf(card);
  try {
    const f = state.files[i],
      updated = await api.relink(f.id);
    if (updated) {
      Object.assign(f, updated);
      activate(f.id);
    }
  } catch (e) {
    message("No se pudo vincular", e.message);
  }
};
function clearEditor() {
  previewRevision++;
  previewQueue.invalidate();
  clearTimeout(renderTimer);
  stopPlayback();
  previewUrl = null;
  originalUrl = null;
  $("preview").hidden = true;
  $("preview").removeAttribute("src");
  $("emptyState").hidden = false;
  $("fileName").textContent = "Empezá con una fotografía o un video";
  $("fileKind").textContent = "TU ESPACIO DE TRABAJO";
  $("videoControls").hidden = true;
  $("renderTime").textContent = "";
  $("warning").hidden = true;
  drawFiles();
  drawRecipes();
  drawControls();
}
$("exportButton").onclick = () => {
  $("exportSummary").textContent =
    `Vas a exportar ${selectedIds(state.files).length} archivo(s) seleccionados.`;
  $("exportDialog").showModal();
};
$("closeExport").onclick = () => $("exportDialog").close();
$("confirmExport").onclick = () => {
  $("exportDialog").close();
  doExport(false);
};
$("playProxy").onclick = () => doExport(true);
$("savePreviewDiagnostics").onclick = async () => {
  try { if(await api.savePreviewDiagnostics()) toast("Diagnóstico de respuesta guardado"); }
  catch(error) { message("Diagnóstico de respuesta",error.message); }
};
$("saveDiagnostics").onclick = async () => {
  try { if(await api.saveDiagnostics()) toast("Diagnóstico guardado"); }
  catch(e) { message("Diagnóstico",e.message); }
};
$("cancelExport").onclick = () => {
  cancelPending = true;
  api.cancel();
  $("cancelExport").disabled = true;
  $("progressText").textContent = "Cancelando…";
};
$("progressDialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  if (!cancelPending) $("cancelExport").click();
});
async function doExport(proxy) {
  if (busy) return;
  busy = true;
  cancelPending = false;
  previewQueue.invalidate();
  clearTimeout(renderTimer);
  previewRevision++;
  updateButtons();
  drawRecipes();
  closeProject();
  $("progressTitle").textContent = proxy
    ? "Preparando reproducción"
    : "Exportando archivos";
  $("progress").value = 0;
  $("progressText").textContent = "Preparando archivo…";
  for(const id of ["progressFile","progressEncoder","progressSpeed","progressEta","progressElapsed","progressFallback"]) $(id).textContent="";
  $("cancelExport").disabled = false;
  $("progressDialog").showModal();
  try {
    const ids = proxy ? [current().id] : selectedIds(state.files);
    const result = await api.exportFiles({
      ids,
      settings: Object.fromEntries(
        state.files.map((f) => [f.id, structuredClone(f.settings)]),
      ),
      format: $("photoFormat").value,
      encoding: $("videoEncoding").value,
      saveReport: $("saveExportReport").checked,
      proxy,
    });
    if (result?.length) {
      if (proxy) {
        $("preview").hidden = true;
        $("playback").hidden = false;
        $("playback").src = result[0].url;
        await $("playback").play();
      } else {
        toast(`${result.length} archivo(s) exportados.`);
        const warning=result.find(r=>r.reportWarning)?.reportWarning;
        if(warning) message("Exportación completada",warning);
      }
    }
  } catch (e) {
    message("No se completó la exportación", e.message);
  } finally {
    busy = false;
    $("progressDialog").close();
    updateButtons();
    drawRecipes();
  }
}
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeProject();
    endBefore();
  }
  if (e.ctrlKey || e.metaKey) {
    if (e.key.toLowerCase() === "s") {
      e.preventDefault();
      $("saveProject").click();
    }
    if (e.key.toLowerCase() === "z" && !e.target.matches("input,textarea")) {
      e.preventDefault();
      (e.shiftKey ? $("redo") : $("undo")).click();
    }
  }
});
async function boot() {
  drawFiles();
  drawRecipes();
  drawControls();
  if (!api) {
    $("engineError").hidden = false;
    $("engineError").textContent =
      "Abrí esta aplicación con npm start. El motor nativo no funciona desde un navegador.";
    return;
  }
  api.onProgress(async (p) => {
    if (p.closing && !closing) {
      closing = true;
      await flushSave();
      if (saveError) {
        closing = false;
        message(
          "No se pudo guardar la recuperación",
          saveError.message + "\nGuardá el proyecto antes de cerrar.",
        );
        return;
      }
      await api.closeReady();
    }
    if (p.error) {
      $("engineError").hidden = false;
      $("engineError").textContent = p.error;
    }
    if (p.fraction !== undefined) {
      const view = progressView(p);
      $("progress").value = view.fraction;
      if(!cancelPending) $("progressText").textContent = view.headline;
      for(const [id,key] of [["progressFile","filename"],["progressEncoder","encoder"],["progressSpeed","speed"],["progressEta","eta"],["progressElapsed","elapsed"],["progressFallback","fallback"]]) $(id).textContent = view[key];
    }
  });
  try {
    const b = await api.boot();
    if (b.error) {
      $("engineError").hidden = false;
      $("engineError").textContent = b.error;
      $("engineStatus").textContent = "Motor no disponible";
    } else
      $("engineStatus").textContent = "LightCraft + FilmCraft · CPU float32";
    const p = await api.recover();
    if (p) {
      await restore(p);
      toast("Sesión recuperada desde este equipo");
    }
  } catch (e) {
    message("No se pudo recuperar la sesión", e.message);
  }
}
boot();

let googleRunning=false;
$("googleButton").onclick=()=>{if(!busy)$("googleDialog").showModal();};
api.onGoogleStatus(text=>$("googleStatus").textContent=text);
$("googleConfig").onclick=async()=>{try{if(await api.googleConfig())$("googleStatus").textContent="Credenciales cargadas para esta sesión. Podés conectar.";}catch(e){$("googleStatus").textContent=e.message;}};
function closeGoogle(){if(googleRunning){api.googleCancel();$("googleStatus").textContent="Cancelando…";}else $("googleDialog").close();}
$("googleClose").onclick=closeGoogle;
$("googleDialog").addEventListener("cancel",e=>{e.preventDefault();closeGoogle();});
$("googleStart").onclick=async()=>{
  if(googleRunning || busy)return;
  googleRunning=true;$("googleStart").disabled=true;$("googleConfig").disabled=true;$("googleClose").textContent="Cancelar";
  try{
    const result=await api.googleImport();
    if(result.files.length){state.files.push(...result.files.map(newFile));activate(result.files[0].id);}
    $("googleStatus").textContent=`${result.files.length} archivo(s) importados en disco.`+(result.canceled?" Importación cancelada; se conservaron las descargas completas.":"")+(result.failures.length?" No se pudieron importar: "+result.failures.join("; "):"");
  }catch(e){$("googleStatus").textContent=e.message;}
  finally{googleRunning=false;$("googleStart").disabled=false;$("googleConfig").disabled=false;$("googleClose").textContent="Cerrar";}
};


function maskEdit(fn){const f=current();if(!f||busy)return;const old=structuredClone(f.settings);f.settings.masks??=[];fn(f.settings.masks);if(commitEdit(f,old)){f.recipe=null;edited();}drawMasks();}
function chosenMask(){return current()?.settings.masks?.find(m=>m.id===activeMaskId);}
$("addMask").onclick=()=>maskEdit(masks=>{
  if(masks.length>=32){toast("Podés crear hasta 32 máscaras por archivo.");return;}
  const type=$("maskType").value;
  let shape,name;
  if(type==="brush"){shape={kind:"brush",strokes:[]};name="Pincel";}
  else if(type==="radial"){shape={kind:"radial",center:{x:.5,y:.5},rx:.3,ry:.3,angle:0,feather:65,invert:false};name="Radial";}
  else if(["vertical","horizontal"].includes(type)){shape={kind:"linear",start:{x:type==="vertical"?.5:0,y:type==="vertical"?0:.5},end:{x:type==="vertical"?.5:1,y:type==="vertical"?1:.5}};name=type==="vertical"?"Degradado vertical":"Degradado horizontal";}
  else{const ranges={shadows:[0,.35],midtones:[.25,.75],lights:[.65,1]};const [lo,hi]=ranges[type];shape={kind:"luminanceRange",lo,hi,lo_feather:.15,hi_feather:.15};name={shadows:"Sombras",midtones:"Tonos medios",lights:"Luces"}[type];}
  activeMaskId=Math.max(0,...masks.map(m=>m.id))+1;
  masks.push({id:activeMaskId,name:name+" "+activeMaskId,visible:true,invert:false,components:[{op:"add",invert:false,shape}],adjust:{exposure:0,temp:0,tint:0,contrast:0,highlights:0,shadows:0,whites:0,blacks:0,saturation:0,texture:0,clarity:0,dehaze:0,amount:100}});
});
function drawMasks(){
  requestAnimationFrame(drawMaskOutline);
  const f=current(),masks=f?.settings.masks||[];
  $("addMask").disabled=!f||busy;$("maskType").disabled=!f||busy;
  if(activeMaskId!==-1&&!masks.some(m=>m.id===activeMaskId))activeMaskId=masks[0]?.id??null;
  $("maskList").replaceChildren(...masks.map(m=>{const b=makeEl("button",{className:"outline "+(m.id===activeMaskId?"active":""),disabled:busy},(m.visible?"◉ ":"○ ")+m.name);b.onclick=()=>{activeMaskId=m.id;drawMasks();};return b;}));
  const global=makeEl("button",{className:"plain",disabled:!f||busy},"Editar efectos globales");global.onclick=()=>{activeMaskId=-1;$("labPanel").querySelector("details").open=true;drawMasks();};$("maskList").append(global);
  const box=$("maskControls");box.replaceChildren();const m=chosenMask();if(!m)return;
  const name=makeEl("input",{type:"text",value:m.name,maxLength:160,disabled:busy});name.setAttribute("aria-label","Nombre de la máscara");name.onchange=()=>maskEdit(()=>m.name=name.value||"Máscara");box.append(name);
  for(const [label,key] of [["Mostrar efecto","visible"],["Invertir zona","invert"]]){const row=makeEl("label",{className:"help"});const check=makeEl("input",{type:"checkbox",checked:m[key],disabled:busy});check.onchange=()=>maskEdit(()=>m[key]=check.checked);row.append(check,document.createTextNode(" "+label));box.append(row);}
  const duplicate=makeEl("button",{className:"plain",disabled:busy},"Duplicar");duplicate.onclick=()=>maskEdit(list=>{if(list.length>=32)return;const copy=structuredClone(m);copy.id=Math.max(...list.map(m=>m.id))+1;copy.name+=" · copia";activeMaskId=copy.id;list.push(copy);});
  const remove=makeEl("button",{className:"plain",disabled:busy},"Eliminar máscara");remove.onclick=()=>maskEdit(list=>list.splice(list.indexOf(m),1));box.append(duplicate,remove);
  function control(target,key,label,min,max,step=1){
    const row=makeEl("div",{className:"control"});const text=makeEl("label",{},label),output=makeEl("output",{},String(target[key]));text.append(output);
    const input=makeEl("input",{type:"range",min,max,step,value:target[key],disabled:busy});input.setAttribute("aria-label",label);let old;
    const start=()=>{if(!old)old=structuredClone(f.settings);};
    input.oninput=()=>{start();target[key]=Number(input.value);if(key==="lo")target.hi=Math.max(target.hi,target.lo);if(key==="hi")target.lo=Math.min(target.lo,target.hi);output.textContent=input.value;drawMaskOutline();schedulePreview(true);};
    const finish=()=>{if(old){commitEdit(f,old);old=null;f.recipe=null;edited();}};
    input.onchange=finish;input.onpointerup=finish;input.onpointercancel=finish;input.onblur=finish;row.append(text,input);box.append(row);
  }
  const shape=m.components[0].shape;
  box.append(makeEl("h4",{},"Zona de aplicación"));
  if(shape.kind==="radial"){
    control(shape.center,"x","Centro horizontal",0,1,.01);control(shape.center,"y","Centro vertical",0,1,.01);control(shape,"rx","Radio horizontal",.01,1,.01);control(shape,"ry","Radio vertical",.01,1,.01);control(shape,"angle","Giro",-180,180);control(shape,"feather","Suavizado",0,100);
  }else if(shape.kind==="linear"){
    box.append(makeEl("p",{className:"help"},"El efecto es completo en Inicio y disminuye hasta Fin. Cambiá ambos puntos para inclinarlo."));
    for(const [key,label] of [["start","Inicio"],["end","Fin"]]){control(shape[key],"x",label+" horizontal",0,1,.01);control(shape[key],"y",label+" vertical",0,1,.01);}
  }else if(shape.kind==="brush"){
    box.append(makeEl("p",{className:"help"},"Pintá sobre la imagen. Borrar quita pinceladas de esta máscara; no modifica el original."));
    const size=makeEl("input",{type:"range",min:.005,max:.3,step:.005,value:brushSize});size.setAttribute("aria-label","Tamaño del pincel");size.oninput=()=>brushSize=Number(size.value);box.append(makeEl("label",{},"Tamaño del pincel"),size);
    const feather=makeEl("input",{type:"range",min:0,max:100,value:brushFeather});feather.setAttribute("aria-label","Suavizado del pincel");feather.oninput=()=>brushFeather=Number(feather.value);box.append(makeEl("label",{},"Suavizado del pincel"),feather);
    const erase=makeEl("button",{className:"outline"},brushErase?"Modo: borrar":"Modo: pintar");erase.onclick=()=>{brushErase=!brushErase;drawMasks();};box.append(erase);
  }else{
    box.append(makeEl("p",{className:"help"},"Selecciona por luminosidad: 0 representa negros y 1 blancos. Sombras y luces son ajustes dentro de esa zona."));
    control(shape,"lo","Luminosidad mínima",0,1,.01);control(shape,"hi","Luminosidad máxima",0,1,.01);control(shape,"lo_feather","Transición inferior",0,1,.01);control(shape,"hi_feather","Transición superior",0,1,.01);
  }
  box.append(makeEl("h4",{},"Luz y color de esta máscara"));
  control(m.adjust,"amount","Intensidad de la máscara",0,100);
  for(const [key,label,min,max,step] of [["exposure","Exposición",-5,5,.05],["contrast","Contraste"],["highlights","Altas luces"],["shadows","Sombras"],["whites","Blancos"],["blacks","Negros"],["temp","Temperatura"],["tint","Matiz"],["saturation","Saturación"],["texture","Textura"],["clarity","Claridad"],["dehaze","Borrar neblina"]])control(m.adjust,key,label,min??-100,max??100,step??1);
}

function maskBox(){const img=$("preview"),wrap=$("imageWrap");const b=img.getBoundingClientRect(),w=wrap.getBoundingClientRect();return {x:b.left-w.left,y:b.top-w.top,width:b.width,height:b.height};}
function drawMaskOutline(){
 const svg=$("maskOverlay"),m=chosenMask(),img=$("preview");svg.replaceChildren();
 svg.toggleAttribute("hidden",tab!=="lab"||!m||img.hidden||before||!$("playback").hidden);
 if(svg.hasAttribute("hidden"))return;
 const b=maskBox();if(b.width<=0||b.height<=0)return;
 Object.assign(svg.style,{left:b.x+"px",top:b.y+"px",width:b.width+"px",height:b.height+"px",pointerEvents:m.components[0].shape.kind==="brush"?"auto":"none",cursor:m.components[0].shape.kind==="brush"?"crosshair":"default"});svg.setAttribute("viewBox",`0 0 ${b.width} ${b.height}`);
 const shape=m.components[0].shape,long=Math.max(b.width,b.height),show=$("maskOutline").checked;
 const element=(name,attrs)=>{const el=document.createElementNS("http://www.w3.org/2000/svg",name);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);svg.append(el);return el;};
 function pin(x,y,action){const el=element("circle",{cx:x,cy:y,r:8,fill:"#faf8f0",stroke:"#243f33","stroke-width":2});el.style.pointerEvents="all";el.style.cursor="move";el.dataset.action=action;}
 if(!show)return;
 if(shape.kind==="radial"){
   const x=shape.center.x*b.width,y=shape.center.y*b.height;
   element("ellipse",{cx:x,cy:y,rx:shape.rx*long,ry:shape.ry*long,transform:`rotate(${shape.angle} ${x} ${y})`,fill:"none",stroke:"#f87d74","stroke-width":2,"stroke-dasharray":"6 4"});pin(x,y,"center");const a=shape.angle*Math.PI/180;pin(x+Math.cos(a)*shape.rx*long,y+Math.sin(a)*shape.rx*long,"rx");pin(x-Math.sin(a)*shape.ry*long,y+Math.cos(a)*shape.ry*long,"ry");
 }else if(shape.kind==="linear"){
   const x=shape.start.x*b.width,y=shape.start.y*b.height,ex=shape.end.x*b.width,ey=shape.end.y*b.height;
   element("line",{x1:x,y1:y,x2:ex,y2:ey,stroke:"#f87d74","stroke-width":3});pin(x,y,"start");pin(ex,ey,"end");
 }else if(shape.kind==="brush"){
   for(const stroke of shape.strokes){if(!stroke.points.length)continue;element("polyline",{points:stroke.points.map(p=>`${p.x*b.width},${p.y*b.height}`).join(" "),fill:"none",stroke:stroke.erase?"#96b8df":"#ed7772","stroke-opacity":.4,"stroke-width":stroke.size*long*2,"stroke-linecap":"round","stroke-linejoin":"round"});}
 }
}
$("maskOutline").onchange=drawMaskOutline;
new ResizeObserver(drawMaskOutline).observe($("imageWrap"));
$("preview").addEventListener("load",drawMaskOutline);
const svg=$("maskOverlay");
svg.onpointerdown=e=>{
 const f=current(),m=chosenMask();if(!f||!m||busy||before)return;
 const shape=m.components[0].shape;const action=e.target.dataset.action;
 if(shape.kind!=="brush"&&!action)return;
 if(shape.kind==="brush"&&shape.strokes.length>=128){toast("Límite de pinceladas alcanzado para esta máscara.");return;}
 maskDrag={file:f.id,before:structuredClone(f.settings),action,shape};
 if(shape.kind==="brush"){const stroke={points:[],size:brushSize,feather:brushFeather,flow:100,density:100,erase:brushErase,auto_mask:false};shape.strokes.push(stroke);maskDrag.stroke=stroke;}
 svg.setPointerCapture(e.pointerId);moveMask(e);e.preventDefault();
};
function moveMask(e){if(!maskDrag||maskDrag.file!==current()?.id)return;const b=svg.getBoundingClientRect();const point={x:Math.min(1,Math.max(0,(e.clientX-b.left)/b.width)),y:Math.min(1,Math.max(0,(e.clientY-b.top)/b.height))};
 if(maskDrag.stroke){const total=maskDrag.shape.strokes.reduce((sum,s)=>sum+s.points.length,0);if(total>=10000)return;const last=maskDrag.stroke.points.at(-1);if(last&&Math.hypot(last.x-point.x,last.y-point.y)<.003)return;maskDrag.stroke.points.push(point);}else if(["rx","ry"].includes(maskDrag.action)){
 const shape=maskDrag.shape,a=shape.angle*Math.PI/180,long=Math.max(b.width,b.height),dx=(point.x-shape.center.x)*b.width,dy=(point.y-shape.center.y)*b.height;
 shape[maskDrag.action]=Math.min(1,Math.max(.01,Math.abs(maskDrag.action==="rx"?dx*Math.cos(a)+dy*Math.sin(a):-dx*Math.sin(a)+dy*Math.cos(a))/long));
 }else{maskDrag.shape[maskDrag.action]=point;}
 drawMaskOutline();schedulePreview(true);
}
svg.onpointermove=moveMask;
function endMask(){if(!maskDrag)return;const f=current();if(f?.id===maskDrag.file){commitEdit(f,maskDrag.before);f.recipe=null;edited();}maskDrag=null;drawMasks();}
svg.onpointerup=endMask;svg.onpointercancel=endMask;svg.onlostpointercapture=endMask;

$("playback").addEventListener("play",()=>$("maskOverlay").setAttribute("hidden",""));
