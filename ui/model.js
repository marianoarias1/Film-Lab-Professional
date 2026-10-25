export const ENGINE = "filmlab-pro-0.5-lc-d999e382-fc-6c3948a3";
export const defaults = () => ({
  masks: [],
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
    history: [],
    future: [],
  };
}
export function commitEdit(file, before) {
  if (JSON.stringify(before) === JSON.stringify(file.settings)) return false;
  file.history.push(structuredClone(before));
  if (file.history.length > 80) file.history.shift();
  file.future = [];
  return true;
}
export function undo(file) {
  if (!file?.history.length) return false;
  file.future.push(structuredClone(file.settings));
  file.settings = file.history.pop();
  file.recipe = null;
  return true;
}
export function redo(file) {
  if (!file?.future.length) return false;
  file.history.push(structuredClone(file.settings));
  file.settings = file.future.pop();
  file.recipe = null;
  return true;
}
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
