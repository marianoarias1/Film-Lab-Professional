import {fittedPreview, colorTrack} from "./display-controls.js";
import {clamp, createShape, linearGeometry, transformShape, shapeAlpha, brushAlpha, maskCoverage, maskPreview} from "./mask-geometry.js";
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
  $("workspaceFileCount").textContent = state.files.length;
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
    const remove=makeEl('button',{className:'remove-file',disabled:busy,title:'Quitar del proyecto'},'×');
    remove.setAttribute('aria-label','Quitar '+f.name+' del proyecto');
    remove.onclick=e=>{e.stopPropagation();removeFileId=f.id;$('removeFileName').textContent=f.name;$('removeFileDialog').showModal();};
    remove.onkeydown=e=>e.stopPropagation();item.append(remove);
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
  const track=colorTrack(key);if(track){input.style.background=track;input.classList.add("color-track");}
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
  endMask(true);
  maskPicker=null;hoverMask=null;
  pendingMask=null;toolOperation="new";$("maskType").value="";activeComponent=0;resetZoom();
  gesture = null;
  before = false;
  stopPlayback();
  state.activeId = id;
  previewRevision++;
  previewQueue.invalidate();
  originalUrl = null;
  previewUrl = null;
  previewAspect=null;
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
    previewAspect??=image.naturalWidth/image.naturalHeight;
    fitPreview();
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
      endMask(true);
      pendingMask=null;toolOperation="new";$("maskType").value="";
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
  endMask(true);pendingMask=null;toolOperation="new";$("maskType").value="";
  if (!busy && undo(current())) {
    drawControls();
    edited();
  }
};
$("redo").onclick = () => {
  endMask(true);pendingMask=null;toolOperation="new";$("maskType").value="";
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
  drawMaskOutline();
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
  drawMaskOutline();
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
  // Persist only the last completed gesture, never a half-drawn mask.
  if(maskDrag){const file=copy.files.find(f=>f.id===maskDrag.file);if(file)file.settings=structuredClone(maskDrag.before);}
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
  maskPicker=null;hoverMask=null;
  resetZoom();
  endMask(true);
  pendingMask=null;
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
  endMask();
  pendingMask=null;
  drawMaskOutline();
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
    endMask(true);
    cancelMaskTool();
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
function chosenComponent(){const m=chosenMask();activeComponent=Math.min(activeComponent,Math.max(0,(m?.components.length||1)-1));return m?.components[activeComponent];}
function chosenMask(){return current()?.settings.masks?.find(m=>m.id===activeMaskId);}
let activeComponent=0, toolOperation="new";
let maskPicker=null,hoverMask=null;
const collapsedMasks=new Set(),maskThumbCache=new Map();
let pendingMask=null, brushFlow=100, brushDensity=100, brushPointer=null, maskPaintFrame=0;
let overlayCache={key:null};
const brushRasterCache={};
function makeMask(shape) {
  const masks=current().settings.masks??=[],id=Math.max(0,...masks.map(m=>m.id))+1;
  const names={brush:'Pincel',radial:'Radial',linear:'Degradado lineal',luminanceRange:'Luminancia'};
  return {id,name:`Máscara ${id}`,visible:true,invert:false,
    components:[{op:'add',invert:false,shape}],adjust:{exposure:0,temp:0,tint:0,contrast:0,highlights:0,shadows:0,whites:0,blacks:0,saturation:0,texture:0,clarity:0,dehaze:0,sharpness:0,noise:0,amount:100}};
}
function cancelMaskTool(){maskPicker=null;hoverMask=null;pendingMask=null;toolOperation='new';$('maskType').value='';drawMasks();}
function startMaskTool(operation='new'){
  if(!current()||busy)return;
  endMask(true);
  const target=operation==='new'?null:chosenMask();
  if(target&&target.components.length>=16){toast('Máximo 16 zonas por máscara.');return;}
  if(!target&&(current().settings.masks?.length||0)>=32){toast('Podés crear hasta 32 máscaras por archivo.');return;}
  toolOperation=target?operation:'new';
  const type=$('maskType').value;
  if(['radial','linear','brush'].includes(type)){
    if(type==='brush')brushErase=false;
    pendingMask=type;if(toolOperation==='new')activeMaskId=-1;
    $('maskOutline').checked=true;drawMasks();return;
  }
  pendingMask=null;drawMasks();
}
$('maskType').onchange=()=>startMaskTool(toolOperation);
$('addMask').onclick=()=>{
  const type=$('maskType').value;if(!['shadows','midtones','lights'].includes(type))return;
  maskEdit(masks=>{
    const ranges={shadows:[0,.35],midtones:[.25,.75],lights:[.65,1]},[lo,hi]=ranges[type];
    const shape={kind:'luminanceRange',lo,hi,lo_feather:.15,hi_feather:.15};
    const target=toolOperation==='new'?null:chosenMask();
    if(target){if(target.components.length>=16)return;target.components.push({op:toolOperation,invert:false,shape});activeComponent=target.components.length-1;}
    else{if(masks.length>=32)return;const m=makeMask(shape);m.name={shadows:'Sombras',midtones:'Tonos medios',lights:'Luces'}[type]+' '+m.id;masks.push(m);activeMaskId=m.id;activeComponent=0;}
  });toolOperation='new';$('maskType').value='';drawMasks();
};

function openMaskPicker(op,maskId=null){
  endMask(true);pendingMask=null;hoverMask=null;toolOperation=op;
  if(maskId!==null)activeMaskId=maskId;
  maskPicker=maskPicker?.op===op&&maskPicker?.maskId===maskId?null:{op,maskId};
  drawMasks();
}
$('newMaskGroup').onclick=()=>openMaskPicker('new');
function maskToolPicker(op){
  const grid=makeEl('div',{className:'mask-tool-picker'});
  for(const [type,icon,label]of [['radial','◯','Radial'],['linear','▱','Lineal'],['brush','✎','Pincel'],['shadows','◕','Sombras'],['midtones','◐','Medios tonos'],['lights','◔','Luces']]){
    const b=makeEl('button',{className:'mask-tool-option',disabled:busy});b.setAttribute('aria-label',label);b.append(makeEl('span',{className:'mask-tool-icon'},icon),makeEl('span',{},label));
    b.onclick=()=>{maskPicker=null;$('maskType').value=type;startMaskTool(op);if(['shadows','midtones','lights'].includes(type))$('addMask').onclick();};grid.append(b);
  }
  return grid;
}
function previewMaskOnHover(maskId,index){hoverMask={maskId,index};drawMaskOutline();}
function clearMaskHover(){hoverMask=null;drawMaskOutline();}
function maskThumbnail(m,index=null){
  const view=maskPreview(m,index),f=current(),aspect=(f?.width||4)/(f?.height||3),w=aspect>=1?36:Math.max(1,Math.round(36*aspect)),h=aspect>=1?Math.max(1,Math.round(36/aspect)):36;
  const key=JSON.stringify([w,h,view.components,view.invert]);
  const canvas=makeEl('canvas',{className:'mask-thumb',width:40,height:40});canvas.setAttribute('aria-hidden','true');const ctx=canvas.getContext('2d');
  if(maskThumbCache.has(key)){ctx.putImageData(maskThumbCache.get(key),0,0);return canvas;}
  ctx.fillStyle='#25362d';ctx.fillRect(0,0,40,40);const alpha=maskCoverage(view,{width:w,height:h});
  if(alpha){const image=ctx.createImageData(w,h);for(let i=0;i<alpha.length;i++){image.data[i*4]=image.data[i*4+1]=image.data[i*4+2]=Math.round(25+alpha[i]*220);image.data[i*4+3]=255;}ctx.putImageData(image,Math.floor((40-w)/2),Math.floor((40-h)/2));}
  else{ctx.fillStyle='#dce9cc';ctx.font='22px sans-serif';ctx.fillText('◐',9,28);}
  if(maskThumbCache.size>=128)maskThumbCache.delete(maskThumbCache.keys().next().value);maskThumbCache.set(key,ctx.getImageData(0,0,40,40));return canvas;
}
function maskGroupCard(m){
  const key=current().id+':'+m.id,collapsed=collapsedMasks.has(key),active=m.id===activeMaskId;
  const card=makeEl('section',{className:'mask-group-card'+(active?' active':'')});card.dataset.maskId=m.id;
  card.setAttribute('aria-label',m.name);
  card.onpointerenter=()=>previewMaskOnHover(m.id,null);card.onpointerleave=clearMaskHover;
  const head=makeEl('div',{className:'mask-group-head'});
  const fold=makeEl('button',{className:'mask-fold',disabled:busy},collapsed?'▸':'▾');fold.setAttribute('aria-label',(collapsed?'Desplegar ':'Contraer ')+m.name);fold.setAttribute('aria-expanded',String(!collapsed));fold.onclick=()=>{if(collapsed)collapsedMasks.delete(key);else collapsedMasks.add(key);drawMasks();};
  const choose=makeEl('button',{className:'mask-group-select',disabled:busy});choose.append(maskThumbnail(m),makeEl('strong',{},m.name));choose.setAttribute('aria-pressed',String(active));
  choose.onclick=()=>{endMask(true);maskPicker=null;pendingMask=null;toolOperation='new';activeMaskId=m.id;activeComponent=0;drawMasks();};
  choose.onfocus=()=>previewMaskOnHover(m.id,null);choose.onblur=clearMaskHover;
  const eye=makeEl('button',{className:'mask-eye',disabled:busy},m.visible?'◉':'○');eye.setAttribute('aria-label',(m.visible?'Ocultar ':'Mostrar ')+m.name);eye.setAttribute('aria-pressed',String(m.visible));eye.onclick=()=>maskEdit(()=>m.visible=!m.visible);
  const menu=makeEl('details',{className:'mask-menu'});menu.append(makeEl('summary',{title:'Opciones de '+m.name},'⋯'));
  const duplicate=makeEl('button',{className:'plain',disabled:busy},'Duplicar');duplicate.onclick=()=>maskEdit(list=>{if(list.length>=32)return;const copy=structuredClone(m);copy.id=Math.max(...list.map(x=>x.id))+1;copy.name+=' · copia';list.push(copy);activeMaskId=copy.id;activeComponent=0;});
  const remove=makeEl('button',{className:'plain',disabled:busy},'Eliminar máscara');remove.onclick=()=>maskEdit(list=>list.splice(list.indexOf(m),1));menu.append(duplicate,remove);head.append(fold,choose,eye,menu);card.append(head);
  if(!collapsed){
    const children=makeEl('div',{className:'mask-group-zones'});
    m.components.forEach((c,i)=>{
      const row=makeEl('div',{className:'mask-child'+(active&&activeComponent===i?' active':'')});row.dataset.component=i;
      const names={radial:'Radial',linear:'Degradado lineal',brush:'Pincel',luminanceRange:'Luminosidad'};
      const button=makeEl('button',{className:'mask-child-select',disabled:busy});button.append(maskThumbnail(m,i),makeEl('span',{},names[c.shape.kind]+' '+(i+1)));
      const operation=makeEl('span',{className:'mask-operation'},({add:'+',subtract:'-',intersect:'∩'}[c.op||'add']));operation.title={add:'Añadir',subtract:'Restar',intersect:'Intersectar'}[c.op||'add'];if(c.op==='intersect')operation.innerHTML='<svg viewBox="0 0 18 18" width="14" height="14" aria-hidden="true"><path d="M4 15V8a5 5 0 0 1 10 0v7" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';button.append(operation);
      button.setAttribute('aria-pressed',String(active&&activeComponent===i));button.onclick=()=>{endMask(true);maskPicker=null;pendingMask=null;toolOperation='new';activeMaskId=m.id;activeComponent=i;drawMasks();};
      row.onpointerenter=e=>{e.stopPropagation();previewMaskOnHover(m.id,i);};row.onpointerleave=()=>previewMaskOnHover(m.id,null);button.onfocus=()=>previewMaskOnHover(m.id,i);button.onblur=clearMaskHover;
      row.append(button);
      const options=makeEl('details',{className:'mask-menu'});options.append(makeEl('summary',{title:'Opciones de zona '+(i+1)},'⋯'));
      if(i>0){const select=makeEl('select',{disabled:busy});select.setAttribute('aria-label','Operación de zona '+(i+1));for(const [v,t]of [['add','Añadir'],['subtract','Restar'],['intersect','Intersectar']])select.append(makeEl('option',{value:v,selected:(c.op||'add')===v},t));select.onchange=()=>maskEdit(()=>c.op=select.value);options.append(select);}
      if(m.components.length>1){const del=makeEl('button',{className:'plain',disabled:busy},'Eliminar zona');del.onclick=()=>maskEdit(()=>{m.components.splice(i,1);m.components[0].op='add';activeComponent=Math.min(activeComponent,m.components.length-1);});options.append(del);}
      if(options.children.length>1)row.append(options);children.append(row);
    });card.append(children);
    const actions=makeEl('div',{className:'mask-group-actions'});
    for(const [op,label]of [['add','Añadir'],['subtract','Restar'],['intersect','Intersectar']]){
      const b=makeEl('button',{className:'outline',disabled:busy||m.components.length>=16},label);b.onclick=()=>openMaskPicker(op,m.id);actions.append(b);
    }card.append(actions);
    if(maskPicker?.maskId===m.id&&maskPicker.op!=='new')card.append(maskToolPicker(maskPicker.op));
  }
  return card;
}
function drawMasks(){
  requestAnimationFrame(drawMaskOutline);
  const f=current(),masks=f?.settings.masks||[];
  $('addMask').disabled=!f||busy;$('maskType').disabled=!f||busy;
  $('addMask').hidden=true;
  $('addMask').textContent=toolOperation==='new'?'+ Crear máscara':'Aplicar rango a la máscara';
  if(activeMaskId!==-1&&!masks.some(m=>m.id===activeMaskId))activeMaskId=masks[0]?.id??null;
  hoverMask=null;
  $('newMaskGroup').disabled=!f||busy;
  $('newMaskTools').replaceChildren();
  if(maskPicker?.op==='new')$('newMaskTools').append(maskToolPicker('new'));
  $('maskList').replaceChildren(...masks.map(m=>maskGroupCard(m)));
  const global=makeEl('button',{className:'plain global-mask-action',disabled:!f||busy},'Película y color global');
  global.onclick=()=>{maskPicker=null;hoverMask=null;pendingMask=null;toolOperation='new';activeMaskId=-1;$('labPanel').querySelector('details.global-effects').open=true;drawMasks();};$('maskList').append(global);
  const box=$('maskControls');box.replaceChildren();
  if(pendingMask){
    const help=makeEl('div',{className:'mask-tool-hint'});
    help.append(makeEl('p',{},(toolOperation==='new'?'Nueva máscara. ':({add:'Añadir zona. ',subtract:'Restar zona. ',intersect:'Intersectar zona. '}[toolOperation]))+(pendingMask==='brush'?'Pintá sobre la fotografía.':'Hacé clic y arrastrá sobre la fotografía.')),makeEl('button',{className:'plain'},'Cancelar'));
    help.lastChild.onclick=cancelMaskTool;box.append(help);
    if(pendingMask==='brush')brushControls(box);
    return;
  }
  const m=chosenMask();if(!m)return;
  const name=makeEl('input',{type:'text',value:m.name,maxLength:160,disabled:busy});name.setAttribute('aria-label','Nombre de la máscara');name.onchange=()=>maskEdit(()=>m.name=name.value||'Máscara');box.append(name);
  const actions=makeEl('div',{className:'mask-actions'});
  for(const [label,key]of [['Invertir máscara','invert']]){
    const row=makeEl('label',{className:'help'}),check=makeEl('input',{type:'checkbox',checked:m[key],disabled:busy});
    check.onchange=()=>maskEdit(()=>m[key]=check.checked);row.append(check,document.createTextNode(' '+label));actions.append(row);
  }
  box.append(actions);
  function control(parent,target,key,label,min,max,step=1){
    const row=makeEl('div',{className:'control'}),text=makeEl('label',{},label),output=makeEl('output',{},format(target[key]??0,step));text.append(output);
    const input=makeEl('input',{type:'range',min,max,step,value:target[key]??0,disabled:busy});input.setAttribute('aria-label',label);const track=colorTrack(key);if(track){input.style.background=track;input.classList.add('color-track');}let old;
    input.oninput=()=>{
      if(!old)old=structuredClone(f.settings);target[key]=Number(input.value);
      if(key==='lo')target.lo=Math.min(target.lo,target.hi);if(key==='hi')target.hi=Math.max(target.hi,target.lo);
      input.value=target[key];output.textContent=format(target[key],step);drawMaskOutline();schedulePreview(true);
    };
    const finish=()=>{if(old){commitEdit(f,old);old=null;f.recipe=null;edited();}};
    input.onchange=finish;input.onpointerup=finish;input.onpointercancel=finish;input.onblur=finish;row.append(text,input);parent.append(row);
  }
  chosenComponent();
  if(m.components.some(c=>c.shape.kind==='luminanceRange'))box.append(makeEl('p',{className:'help'},'La luminosidad se calcula al revelar. Las guías muestran la zona activa; la superposición verde no se muestra en esta combinación.'));
  const shape=chosenComponent().shape;
  if(shape.kind==='radial')control(box,shape,'feather','Desvanecer',0,100);
  else if(shape.kind==='brush')brushControls(box);
  else if(shape.kind==='luminanceRange'){
    box.append(makeEl('p',{className:'help'},'Selección por luminosidad. La superposición verde se muestra en las máscaras dibujadas.'));
    for(const [key,label]of [['lo','Luminosidad mínima'],['hi','Luminosidad máxima'],['lo_feather','Transición inferior'],['hi_feather','Transición superior']])control(box,shape,key,label,0,1,.01);
  }
  else box.append(makeEl('p',{className:'help'},'Punto central: mover. Línea central: girar. Líneas exteriores: ampliar o comprimir la transición.'));
  control(box,m.adjust,'amount','Intensidad de la máscara',0,100);
  const groups=[
    ['Luz',[['exposure','Exposición',-5,5,.05],['contrast','Contraste'],['highlights','Altas luces'],['shadows','Sombras'],['whites','Blancos'],['blacks','Negros']]],
    ['Color',[['temp','Temperatura'],['tint','Matiz'],['hue','Tono',-180,180],['saturation','Saturación']]],
    ['Textura y efectos',[['texture','Textura'],['clarity','Claridad'],['dehaze','Borrar neblina']]],
    ['Detalle',[['sharpness','Nitidez',0,100],['noise','Reducción de ruido',0,100],['moire','Reducir moiré',0,100],['defringe','Eliminar halos de color',0,100]]]
  ];
  for(const [label,defs]of groups){
    const details=makeEl('details',{className:'mask-adjust-group',open:maskGroups.has(label)}),summary=makeEl('summary',{},label);details.append(summary);
    details.ontoggle=()=>{if(details.open)maskGroups.add(label);else maskGroups.delete(label);};
    for(const [key,title,min=-100,max=100,step=1]of defs)control(details,m.adjust,key,title,min,max,step);
    box.append(details);
  }
}
const maskGroups=new Set(['Luz']);
function brushControls(box){
  const group=makeEl('div',{className:'brush-controls'});
  for(const [label,min,max,step,get,set]of [
    ['Tamaño del pincel',.005,.3,.005,()=>brushSize,v=>brushSize=v],
    ['Desvanecer pincel',0,100,1,()=>brushFeather,v=>brushFeather=v],
    ['Flujo',1,100,1,()=>brushFlow,v=>brushFlow=v],
    ['Densidad',1,100,1,()=>brushDensity,v=>brushDensity=v]]){
    const row=makeEl('label',{},label),output=makeEl('output',{},label==='Tamaño del pincel'?Math.round(get()*1000):get());
    const input=makeEl('input',{type:'range',min,max,step,value:get(),disabled:busy});input.setAttribute('aria-label',label);
    input.oninput=()=>{set(Number(input.value));output.textContent=label==='Tamaño del pincel'?Math.round(get()*1000):get();drawBrushCursor();};
    row.append(output,input);group.append(row);
  }
  const erase=makeEl('button',{className:'outline',disabled:busy},brushErase?'Borrar pinceladas':'Pintar zona');erase.setAttribute('aria-pressed',String(brushErase));erase.onclick=()=>{brushErase=!brushErase;drawMasks();};group.append(erase);box.append(group);
}
function maskBox(){const b=$('preview').getBoundingClientRect(),w=$('imageWrap').getBoundingClientRect();return {x:(b.left-w.left)/viewZoom,y:(b.top-w.top)/viewZoom,width:b.width/viewZoom,height:b.height/viewZoom};}
function queueMaskPaint(){if(!maskPaintFrame)maskPaintFrame=requestAnimationFrame(()=>{maskPaintFrame=0;drawMaskOutline();});}
function drawMaskOutline(){
  const svg=$('maskOverlay'),canvas=$('maskTint'),selected=chosenMask(),hovered=hoverMask&&current()?.settings.masks?.find(m=>m.id===hoverMask.maskId),m=hovered||selected,img=$('preview');
  const hidden=tab!=='lab'||(!m&&!pendingMask)||img.hidden||before||!$('playback').hidden;
  svg.toggleAttribute('hidden',hidden);canvas.hidden=hidden;svg.replaceChildren();if(hidden)return;
  const b=maskBox();if(b.width<=0||b.height<=0)return;
  for(const el of [svg,canvas])Object.assign(el.style,{left:b.x+'px',top:b.y+'px',width:b.width+'px',height:b.height+'px'});
  svg.setAttribute('viewBox',`0 0 ${b.width} ${b.height}`);
  const component=hovered?m.components[hoverMask.index??0]:chosenComponent();
  const shape=component?.shape,show=$('maskOutline').checked||!!hovered;
  svg.style.pointerEvents=pendingMask||shape?.kind==='brush'?'auto':'none';
  svg.style.cursor=pendingMask==='brush'||(!pendingMask&&shape?.kind==='brush')?'none':pendingMask?'crosshair':'default';
  canvas.hidden=!show||!shape||!m.visible||(hovered&&hoverMask.index!==null?!['radial','linear','brush'].includes(shape.kind):m.components.some(c=>!['radial','linear','brush'].includes(c.shape.kind)));
  if(!canvas.hidden)paintMaskTint(canvas,maskPreview(m,hovered?hoverMask.index:null),b);
  const element=(name,attrs,action)=>{
    const el=document.createElementNS('http://www.w3.org/2000/svg',name);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);
    if(action){el.dataset.action=action;el.style.pointerEvents='all';el.style.cursor=action==='rotate'?rotateCursor:action==='center'?'move':resizeCursor(shape,b,action);const title=document.createElementNS(el.namespaceURI,'title');title.textContent=action==='rotate'?'Arrastrar para girar':action==='center'?'Arrastrar para mover':'Arrastrar para cambiar el tamaño';el.append(title);}
    svg.append(el);return el;
  };
  const pin=(x,y,action)=>element('circle',{cx:x,cy:y,r:6,fill:'#faf8f0',stroke:'#3f6551','stroke-width':2},action);
  const line=(a,z,action,dashed=false)=>{
    element('line',{x1:a.x,y1:a.y,x2:z.x,y2:z.y,stroke:'#163c2b','stroke-width':3,'stroke-opacity':.65,'pointer-events':'none'});
    element('line',{x1:a.x,y1:a.y,x2:z.x,y2:z.y,stroke:'#f5fff8','stroke-width':1,'stroke-dasharray':dashed?'5 4':'none','pointer-events':'none'});
    element('line',{x1:a.x,y1:a.y,x2:z.x,y2:z.y,stroke:'transparent','stroke-width':16},action);
  };
  if(show&&shape?.kind==='radial'){
    const x=shape.center.x*b.width,y=shape.center.y*b.height,long=Math.max(b.width,b.height),rx=shape.rx*long,ry=shape.ry*long,a=shape.angle*Math.PI/180;
    const attrs={cx:x,cy:y,rx,ry,transform:`rotate(${shape.angle} ${x} ${y})`,fill:'none'};
    element('ellipse',{...attrs,stroke:'#163c2b','stroke-width':3,'stroke-opacity':.65,'pointer-events':'none'});
    element('ellipse',{...attrs,stroke:'#f5fff8','stroke-width':1,'pointer-events':'none'});
    element('ellipse',{...attrs,stroke:'transparent','stroke-width':16},'rotate');
    const f=1-Math.max(.01,shape.feather/100);element('ellipse',{...attrs,rx:rx*f,ry:ry*f,stroke:'#f5fff8','stroke-width':1,'stroke-dasharray':'4 5','stroke-opacity':.7,'pointer-events':'none'});
    for(const sign of [-1,1]){pin(x+sign*Math.cos(a)*rx,y+sign*Math.sin(a)*rx,'rx');pin(x-sign*Math.sin(a)*ry,y+sign*Math.cos(a)*ry,'ry');}pin(x,y,'center');
  }else if(show&&shape?.kind==='linear'){
    const {center,n,half}=linearGeometry(shape,b),t={x:-n.y,y:n.x},length=Math.hypot(b.width,b.height)*2;
    for(const k of [-1,0,1]){
      const c={x:center.x+n.x*half*k,y:center.y+n.y*half*k};
      line({x:c.x-t.x*length,y:c.y-t.y*length},{x:c.x+t.x*length,y:c.y+t.y*length},k===0?'rotate':'spread',k!==0);
    }pin(center.x,center.y,'center');
  }
  // Cursor is a separate group, updated without rasterizing the overlay on hover.
  const cursor=element('g',{id:'brushCursor','pointer-events':'none'});
  for(const [r,stroke]of [[1,'#163c2b'],[1,'#fff'],[.5,'#fff']]){
    const c=document.createElementNS(cursor.namespaceURI,'circle');c.setAttribute('r',r);c.setAttribute('fill','none');c.setAttribute('stroke',stroke);c.setAttribute('stroke-width',stroke==='#163c2b'?3:1);cursor.append(c);
  }
  const cross=document.createElementNS(cursor.namespaceURI,'path');cross.setAttribute('d','M-4 0H4M0-4V4');cross.setAttribute('stroke','#fff');cursor.append(cross);drawBrushCursor();
}
const rotateCursor='url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'32\' height=\'32\' viewBox=\'0 0 32 32\'%3E%3Cpath d=\'M7 17a9 9 0 1 1 15 6M7 17V9M7 17h8\' fill=\'none\' stroke=\'white\' stroke-width=\'5\'/%3E%3Cpath d=\'M7 17a9 9 0 1 1 15 6M7 17V9M7 17h8\' fill=\'none\' stroke=\'%232c5140\' stroke-width=\'2\'/%3E%3C/svg%3E") 16 16, crosshair';
function resizeCursor(shape,b,action){
  const angle=shape?.kind==='linear'?Math.atan2((shape.end.y-shape.start.y)*b.height,(shape.end.x-shape.start.x)*b.width)*180/Math.PI:(shape?.angle||0)+(action==='ry'?90:0);
  return ['ew-resize','nwse-resize','ns-resize','nesw-resize'][((Math.round(angle/45)%4)+4)%4];
}
function drawBrushCursor(){
  const c=$('brushCursor'),svg=$('maskOverlay');if(!c)return;
  const enabled=pendingMask==='brush'||(!pendingMask&&chosenComponent()?.shape.kind==='brush');
  c.style.display=enabled&&brushPointer?'':'none';if(!brushPointer)return;
  const b=svg.getBoundingClientRect(),x=(brushPointer.x-b.left)/viewZoom,y=(brushPointer.y-b.top)/viewZoom,r=brushSize*Math.max(b.width,b.height)/viewZoom;
  c.setAttribute('transform',`translate(${x} ${y})`);[...c.querySelectorAll('circle')].forEach((circle,i)=>circle.setAttribute('r',i===2?r*(1-brushFeather/100):r));
}
function paintMaskTint(canvas,m,b){
  const scale=Math.min(1,384/Math.max(b.width,b.height)),w=Math.max(1,Math.round(b.width*scale)),h=Math.max(1,Math.round(b.height*scale));
  const key=JSON.stringify([w,h,m.components,m.invert]);
  if(overlayCache.key===key&&canvas.width===w&&canvas.height===h)return;
  const context=canvas.getContext('2d');canvas.width=w;canvas.height=h;
  const image=context.createImageData(w,h),coverage=maskCoverage(m,{width:w,height:h},brushRasterCache);
  if(!coverage)return;
  for(let i=0;i<coverage.length;i++){const p=i*4;image.data[p]=104;image.data[p+1]=168;image.data[p+2]=125;image.data[p+3]=Math.round(coverage[i]*90);}

  context.putImageData(image,0,0);overlayCache={key};
}
$('maskOutline').onchange=drawMaskOutline;
new ResizeObserver(()=>{fitPreview();queueMaskPaint();}).observe($('imageWrap'));
$('preview').addEventListener('load',()=>{fitPreview();queueMaskPaint();});
const svg=$('maskOverlay');
function eventPoint(e){const b=svg.getBoundingClientRect();return {x:clamp(e.clientX-b.left,0,b.width),y:clamp(e.clientY-b.top,0,b.height)};}
svg.onpointerdown=e=>{
  if(e.button!==0||maskDrag||!current()||busy||before)return;
  const f=current(),b=svg.getBoundingClientRect(),from=eventPoint(e),old=structuredClone(f.settings),previous=activeMaskId;
  if(pendingMask){
    const shape=pendingMask==='brush'?{kind:'brush',strokes:[]}:createShape(pendingMask,from,{x:from.x+1,y:from.y+1},b);
    const target=toolOperation==='new'?null:chosenMask();
    if(target){if(target.components.length>=16)return;target.components.push({op:toolOperation,invert:false,shape});activeComponent=target.components.length-1;}
    else{if((f.settings.masks?.length||0)>=32)return;const m=makeMask(shape);f.settings.masks??=[];f.settings.masks.push(m);activeMaskId=m.id;activeComponent=0;}
  }
  const m=chosenMask(),shape=chosenComponent()?.shape,action=e.target.closest('[data-action]')?.dataset.action;
  if(!shape||(!pendingMask&&shape.kind!=='brush'&&!action))return;
  if(shape.kind==='brush'&&(shape.strokes.length>=128||shape.strokes.reduce((sum,s)=>sum+s.points.length,0)>=10000)){
    toast('Límite de pinceladas alcanzado. Creá otra máscara para continuar.');return;
  }
  maskDrag={file:f.id,before:old,previous,previousComponent:activeComponent,creating:pendingMask,from,action,original:structuredClone(shape),shape};
  if(shape.kind==='brush'){
    const stroke={points:[],size:brushSize,feather:brushFeather,flow:brushFlow,density:brushDensity,erase:brushErase,auto_mask:false};
    shape.strokes.push(stroke);maskDrag.stroke=stroke;
  }
  svg.setPointerCapture(e.pointerId);moveMask(e);e.preventDefault();
};
function moveMask(e){
  brushPointer={x:e.clientX,y:e.clientY};drawBrushCursor();
  if(!maskDrag||maskDrag.file!==current()?.id)return;
  const d=maskDrag,b=svg.getBoundingClientRect(),point=eventPoint(e);
  d.distance=Math.hypot(point.x-d.from.x,point.y-d.from.y);
  if(d.stroke){
    const p={x:point.x/b.width,y:point.y/b.height},total=d.shape.strokes.reduce((sum,s)=>sum+s.points.length,0);
    if(total>=10000)return;
    const last=d.stroke.points.at(-1);if(last&&Math.hypot((last.x-p.x)*b.width,(last.y-p.y)*b.height)<1)return;d.stroke.points.push(p);
  }else{
    const next=d.creating?createShape(d.creating,d.from,point,b):transformShape(d.original,d.action,d.from,point,b);
    Object.assign(d.shape,next);
  }
  queueMaskPaint();
  if(!d.creating||d.creating==='brush'||d.distance>=4)schedulePreview(true);
}
svg.onpointermove=moveMask;
svg.onpointerenter=e=>{brushPointer={x:e.clientX,y:e.clientY};drawBrushCursor();};
svg.onpointerleave=()=>{brushPointer=null;drawBrushCursor();};
function endMask(cancel=false){
  if(!maskDrag)return;const d=maskDrag;maskDrag=null;
  const f=current();
  if(f?.id===d.file){
    const tooSmall=d.creating&&d.creating!=='brush'&&(d.distance||0)<4;
    if(cancel||tooSmall){f.settings=d.before;activeMaskId=d.previous;activeComponent=Math.min(activeComponent,(chosenMask()?.components.length||1)-1);schedulePreview();}
    else{pendingMask=null;toolOperation="new";$("maskType").value="";commitEdit(f,d.before);f.recipe=null;edited();}
  }
  drawMasks();
}
svg.onpointerup=()=>endMask();svg.onpointercancel=()=>endMask(true);svg.onlostpointercapture=()=>endMask(true);
svg.oncontextmenu=e=>e.preventDefault();
$('playback').addEventListener('play',()=>{pendingMask=null;drawMaskOutline();});

let removeFileId=null;
$('cancelRemoveFile').onclick=()=>{$('removeFileDialog').close();removeFileId=null;};
$('confirmRemoveFile').onclick=async()=>{
  if(busy)return;
  const index=state.files.findIndex(f=>f.id===removeFileId);$('removeFileDialog').close();removeFileId=null;
  if(index<0)return;
  endMask(true);cancelMaskTool();stopPlayback();
  previewQueue.invalidate();clearTimeout(renderTimer);previewRevision++;
  busy=true;updateButtons();
  try{
    const file=state.files[index];await api.removeFile(file.id);
    const wasActive=file.id===state.activeId;state.files.splice(index,1);busy=false;
    if(wasActive){if(state.files.length)activate(state.files[Math.min(index,state.files.length-1)].id);else{state.activeId=null;clearEditor();saveSoon();}}
    else{drawFiles();saveSoon();schedulePreview();}
    toast('Archivo quitado del proyecto. El original permanece en disco.');
  }catch(error){message('No se pudo quitar el archivo',error.message);}
  finally{busy=false;updateButtons();drawRecipes();}
};

let previewAspect=null;
function fitPreview(){
  const wrap=$('imageWrap'),size=fittedPreview(wrap.clientWidth,wrap.clientHeight,previewAspect);
  if(!size)return;
  $('preview').style.width=size.width+'px';$('preview').style.height=size.height+'px';
}
let viewZoom=1,viewPan={x:0,y:0};
function applyZoom(){
  $('imageWrap').style.transform=`translate(${viewPan.x}px, ${viewPan.y}px) scale(${viewZoom})`;
  $('zoomReset').textContent=Math.round(viewZoom*100)+'%';queueMaskPaint();
}
function resetZoom(){viewZoom=1;viewPan={x:0,y:0};applyZoom();}
$('zoomReset').onclick=resetZoom;
$('imageWrap').parentElement.addEventListener('wheel',e=>{
  if(!e.ctrlKey)return;e.preventDefault();
  if(!current()||maskDrag||busy)return;
  const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?300:1);
  const next=clamp(viewZoom*Math.exp(-delta*.002),1,8);if(next===viewZoom)return;
  const b=$('imageWrap').getBoundingClientRect(),ratio=next/viewZoom;
  viewPan.x+=(e.clientX-(b.left+b.width/2))*(1-ratio);viewPan.y+=(e.clientY-(b.top+b.height/2))*(1-ratio);
  viewZoom=next;if(viewZoom===1)viewPan={x:0,y:0};applyZoom();
},{passive:false});
let panelState={filters:false,files:false};
try{const saved=JSON.parse(localStorage.getItem('filmlab.workspace.panels'));if(saved)panelState={filters:saved.filters===true,files:saved.files===true};}catch{}
function drawWorkspace(){
  $('workspace').classList.toggle('filters-open',panelState.filters);$('filtersPanel').hidden=!panelState.filters;$('filesPanel').hidden=!panelState.files;
  $('toggleFilters').setAttribute('aria-expanded',String(panelState.filters));$('toggleFilters').title=panelState.filters?'Ocultar filtros':'Mostrar filtros';
  $('toggleFiles').setAttribute('aria-expanded',String(panelState.files));
  requestAnimationFrame(queueMaskPaint);
}
for(const [id,key]of [['toggleFilters','filters'],['toggleFiles','files']])$(id).onclick=()=>{panelState[key]=!panelState[key];drawWorkspace();try{localStorage.setItem('filmlab.workspace.panels',JSON.stringify(panelState));}catch{}};
drawWorkspace();
// Install tools before boot draws their initial state.
boot();
