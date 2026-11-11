export const effectLayerDefaults=()=>({enabled:true,mode:'motion',amount:70,distance:15,bandWidth:20,transition:30,sharpness:0,dissolve:0,particleSize:1,points:[[.3,.5],[.7,.5],[.5,.35]],windows:[],paths:[],strokes:[]});
export const effectDefaults=()=>({...effectLayerDefaults(),enabled:false,stack:true,layers:[]});
export function normalizeEffects(value){
 if(value?.stack)return {...effectDefaults(),...structuredClone(value),layers:(value.layers||[]).map(x=>({...effectLayerDefaults(),...structuredClone(x)}))};
 if(!value)return effectDefaults();
 const legacy={...effectLayerDefaults(),...structuredClone(value)};
 const baseline={...effectLayerDefaults(),enabled:false};
 const changed=Object.keys(baseline).some(k=>JSON.stringify(legacy[k])!==JSON.stringify(baseline[k]));
 return {...effectDefaults(),enabled:changed,layers:changed?[legacy]:[]};
}
export const ENGINE = "filmlab-pro-0.8-lc-d999e382-fc-6c3948a3";
export const defaults = () => ({
  masks: [],
  labEffects: effectDefaults(),
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  saturation: 0,
  vibrance: 0,
  texture: 0,
  clarity: 0,
  dehaze: 0,
  grain: 0,
  grainSize: 25,
  hsl: Array.from({length:8},()=>[0,0,0]),
  sharpness: 0,
  denoise: 0,
  vignette: 0,
  mono: false,
  curve: [],
  lightLeak: 0,
  leakX: 0.2,
  leakY: 0.3,
  leakSize: 0.4,
  leakTemperature: 60,
  shadowHue: 220,
  shadowAmount: 0,
  highlightHue: 40,
  highlightAmount: 0,
});
const legacyRecipes = [
  {
    id: "natural",
    name: "Natural",
    description: "Color limpio. Conserva el carácter de la toma.",
    sky: "#d4ddd1",
    earth: "#6f806b",
    settings: {},
  },
  {
    id: "golden",
    name: "Hora dorada",
    description: "Luz cálida, sombras abiertas y contraste suave.",
    sky: "#e7c897",
    earth: "#946b45",
    settings: {
      temperature: 14,
      highlights: -28,
      shadows: 16,
      contrast: 8,
      vibrance: 10,
      grain: 12,
    },
  },
  {
    id: "botanical",
    name: "Botánica · Pro",
    description: "Vegetación contenida, piel cálida y negros profundos.",
    sky: "#bec6a0",
    earth: "#38594b",
    settings: {
      temperature: 7,
      saturation: -10,
      vibrance: 12,
      blacks: -12,
      highlights: -24,
      clarity: 8,
      grain: 9,
      shadowHue: 155,
      shadowAmount: 6,
    },
  },
  {
    id: "silver",
    name: "Plata · Pro",
    description: "Blanco y negro firme, medios tonos definidos y grano fino.",
    sky: "#d7d5cc",
    earth: "#525958",
    settings: {
      mono: true,
      contrast: 22,
      highlights: -20,
      shadows: 10,
      blacks: -14,
      texture: 10,
      grain: 16,
    },
  },
  {
    id: "cinema",
    name: "Cine cálido / frío",
    description: "Sombras azuladas y luces cálidas con color contenido.",
    sky: "#c8d7cf",
    earth: "#456875",
    settings: {
      contrast: 12,
      saturation: -12,
      highlights: -16,
      shadowHue: 215,
      shadowAmount: 14,
      highlightHue: 40,
      highlightAmount: 14,
      grain: 8,
    },
  },
];
export let recipes = legacyRecipes;
export function installCatalog(catalog) {
  const web = structuredClone(catalog.recipes);
  recipes = [...web,...legacyRecipes.map(recipe=>({...recipe,hiddenFromCatalog:true,legacy:true}))];
}
export function settingValue(settings,key) {
  const at=(value)=>key.split('.').reduce((v,k)=>v?.[k],value);
  return at(settings) ?? at(defaults());
}
export function setSettingValue(settings,key,value) {
  const parts=key.split('.'), last=parts.pop();
  let target=settings;
  if(parts[0]==='hsl'&&!target.hsl)target.hsl=defaults().hsl;
  for(const part of parts)target=target[part];
  target[last]=value;
}
export function newFile(f) {
  return {
    ...f,
    settings: defaults(),
    recipe: null,
    selected: true,
    review: normalizeReview(f.review),
    versions: structuredClone(f.versions ?? []),
    history: [],
    future: [],
  };
}
export const adjustmentGroups = [
  { id: "light", label: "Luz", keys: ["exposure", "contrast", "highlights", "shadows", "whites", "blacks"] },
  { id: "color", label: "Color", keys: ["temperature", "tint", "saturation", "vibrance", "hsl", "mono"] },
  { id: "curve", label: "Curva", keys: ["curve"] },
  { id: "detail", label: "Textura y detalle", keys: ["texture", "clarity", "dehaze", "sharpness", "denoise", "vignette"] },
  { id: "grain", label: "Grano", keys: ["grain", "grainSize"] },
];

export function copyAdjustments(settings, groups) {
  const fallback = defaults();
  return Object.fromEntries(adjustmentGroups.filter(g => groups.includes(g.id)).flatMap(g =>
    g.keys.map(key => [key, structuredClone(settings[key] ?? fallback[key])])
  ));
}

// A batch is one shared entry in the histories of its targets and the active
// file that initiated it. History stays in memory and is never in a project.
const batchEntries = new WeakMap();
function removeEntry(list, entry) {
  const index = list.indexOf(entry);
  if (index !== -1) list.splice(index, 1);
}
function discardBatch(entry, records) {
  batchEntries.delete(entry);
  for (const file of records.keys()) {
    removeEntry(file.history, entry);
    const index = file.future.indexOf(entry);
    if (index === -1) continue;
    // Later redo snapshots include the batch and cannot replay without it.
    for (const dependent of file.future.splice(0, index + 1)) {
      const dependentRecords = batchEntries.get(dependent);
      if (dependentRecords) discardBatch(dependent, dependentRecords);
    }
  }
}
function clearFuture(file) {
  for (const entry of [...file.future]) {
    const records = batchEntries.get(entry);
    if (records) discardBatch(entry, records);
  }
  file.future = [];
}
function trimHistory(file) {
  while (file.history.length > 80) {
    const entry = file.history.shift(), records = batchEntries.get(entry);
    if (records) discardBatch(entry, records);
  }
}
export function forgetFileHistory(file) {
  for (const entry of [...file.history, ...file.future]) {
    const records = batchEntries.get(entry);
    if (!records) continue;
    records.delete(file);
    if (![...records.values()].some(Boolean)) discardBatch(entry, records);
  }
  file.history = [];
  file.future = [];
}
export function applyAdjustments(files, patch, anchor = null) {
  const records = new Map(), keys = adjustmentGroups.flatMap(g => g.keys)
    .filter(key => Object.hasOwn(patch, key));
  for (const file of new Set(files)) {
    const after = { ...file.settings };
    let changed = false;
    for (const key of keys) {
      if (JSON.stringify(after[key]) === JSON.stringify(patch[key])) continue;
      after[key] = structuredClone(patch[key]);
      changed = true;
    }
    if (changed) records.set(file, {
      before: structuredClone(file.settings), recipe: file.recipe, after: structuredClone(after),
    });
  }
  const count = records.size;
  if (!count) return 0;
  if (anchor && !records.has(anchor)) records.set(anchor, null);
  const entry = {};
  batchEntries.set(entry, records);
  for (const [file, change] of records) {
    clearFuture(file);
    if (change) {
      file.settings = structuredClone(change.after);
      file.recipe = null;
    }
    file.history.push(entry);
  }
  for (const file of records.keys()) trimHistory(file);
  return count;
}
export function historyBlocker(file, direction) {
  const list = direction === "redo" ? "future" : "history";
  const entry = file?.[list].at(-1), records = batchEntries.get(entry);
  if (!records) return null;
  for (const participant of records.keys())
    if (participant[list].at(-1) !== entry) return participant;
  return null;
}
export function commitEdit(file, before) {
  if (JSON.stringify(before) === JSON.stringify(file.settings)) return false;
  clearFuture(file);
  file.history.push(structuredClone(before));
  trimHistory(file);
  return true;
}
function stepHistory(file, direction) {
  const from = direction === "redo" ? "future" : "history";
  const to = direction === "redo" ? "history" : "future";
  if (!file?.[from].length || historyBlocker(file, direction)) return false;
  const entry = file[from].at(-1), records = batchEntries.get(entry);
  if (records) {
    for (const [participant, change] of records) {
      participant[from].pop();
      participant[to].push(entry);
      if (change) {
        participant.settings = structuredClone(direction === "redo" ? change.after : change.before);
        participant.recipe = direction === "redo" ? (change.afterRecipe ?? null) : change.recipe;
      }
    }
  } else {
    file[to].push(structuredClone(file.settings));
    file.settings = file[from].pop();
    file.recipe = null;
  }
  return true;
}
export const undo = file => stepHistory(file, "undo");
export const redo = file => stepHistory(file, "redo");
export function projectSnapshot(state) {
  return {
    schemaVersion: 1,
    engineVersion: ENGINE,
    name: state.name || "Sin título",
    savedAt: new Date().toISOString(),
    activeId: state.activeId,
    files: state.files.map(({ history, future, ...f }) => structuredClone(f)),
  };
}
export function selectedIds(files) {
  return files.filter((f) => f.selected).map((f) => f.id);
}

export function normalizeReview(value) {
  return value === "picked" || value === "rejected" ? value : "unreviewed";
}

export function reviewFiles(files, filter) {
  return files.filter(file => file.kind === "photo" &&
    (filter === "all" || normalizeReview(file.review) === filter));
}

export function exportBatch(files, source) {
  if (source !== "picked") return { items: files.filter(file => file.selected), unavailable: [] };
  const picks = reviewFiles(files, "picked");
  return {
    items: picks.filter(file => !file.missing),
    unavailable: picks.filter(file => file.missing),
  };
}

// Use the order before marking: the current item can disappear from a filter.
export function nextReviewFile(files, id, direction = 1) {
  const index = files.findIndex(file => file.id === id);
  return index < 0 ? files[0] : files[index + direction];
}

export function saveEditVersion(file, name, id, savedAt = new Date().toISOString()) {
  name = name.trim();
  if (!name || name.length > 80) throw new Error("Escribí un nombre de hasta 80 caracteres.");
  const versions = file.versions ?? [];
  if (versions.some(version => version.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
    throw new Error("Ya hay una versión con ese nombre en este archivo.");
  const version = {
    id, name, savedAt, settings: structuredClone(file.settings), recipe: file.recipe ?? null,
  };
  file.versions = [...versions, version];
  return version;
}

export function restoreEditVersion(file, id) {
  const version = file.versions?.find(item => item.id === id);
  if (!version) throw new Error("No se encontró esa versión en este archivo.");
  const after = { ...defaults(), ...structuredClone(version.settings) };
  const recipe = version.recipe ?? null;
  if (JSON.stringify(file.settings) === JSON.stringify(after) && file.recipe === recipe) return false;
  const change = {
    before: structuredClone(file.settings), recipe: file.recipe,
    after: structuredClone(after), afterRecipe: recipe,
  };
  clearFuture(file);
  const entry = {};
  batchEntries.set(entry, new Map([[file, change]]));
  file.settings = after;
  file.recipe = recipe;
  file.history.push(entry);
  trimHistory(file);
  return true;
}
