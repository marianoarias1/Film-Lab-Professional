const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  net,
  Menu,
  shell,
} = require("electron");
const path = require("node:path");
const { importPhotos, CLIENT_ID } = require("./google-photos.cjs");
let googleImport = null;
let googleSecret;
const fs = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
const crypto = require("node:crypto");
const { makeReport, keepReport } = require("./export-report.cjs");
const { performance } = require("node:perf_hooks");
const { PreviewMetrics } = require("./preview-metrics.cjs");
const previewMetrics = new PreviewMetrics();
const { Engine } = require("./engine.cjs");
const { ProjectStore, ENGINE } = require("./project-store.cjs");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "filmlab",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);
let win,
  engine,
  store,
  cache,
  projectPath = null,
  opened = null,
  dirty = false,
  closing = false;
const files = new Map(),
  mediaUrls = new Map();
let activeExport = null, lastReport = null, cancelExport = false;
let opQueue = Promise.resolve();
function serial(fn) {
  const job = opQueue.catch(() => {}).then(fn);
  opQueue = job;
  return job;
}
const photoExt = [
  "jpg",
  "jpeg",
  "png",
  "tif",
  "tiff",
  "webp",
  "arw",
  "dng",
  "nef",
  "cr2",
  "cr3",
  "raf",
  "rw2",
  "orf",
];
const videoExt = ["mp4", "mov", "m4v", "mkv", "webm", "avi"];
function ensureFile(id) {
  const f = files.get(id);
  if (!f) throw new Error("Archivo desconocido. Volvé a importarlo.");
  return f;
}
function mediaUrl(file) {
  const token = crypto.randomUUID();
  mediaUrls.set(token, file);
  return `filmlab://media/${token}`;
}
async function remember(p) {
  files.clear();
  for (const f of p.files) files.set(f.id, { ...f });
  opened = null;
  dirty = false;
  return p;
}
async function activate(id) {
  const f = ensureFile(id);
  if (f.missing)
    throw new Error(
      "El original no está en su ubicación. Usá Volver a vincular.",
    );
  if (opened !== id) {
    opened = null;
    const meta = await engine.request("open", {
      key: id,
      path: f.path,
      kind: f.kind,
    });
    Object.assign(f, meta);
    opened = id;
  }
  return f;
}
function snapshot(p) {
  return {
    ...p,
    schemaVersion: 1,
    engineVersion: ENGINE,
    files: p.files.map((f) => {
      const known = ensureFile(f.id);
      return {
        id: f.id,
        path: known.path,
        name: known.name,
        kind: known.kind,
        identity: known.identity,
        settings: f.settings,
        recipe: f.recipe || null,
        selected: f.selected !== false,
      };
    }),
  };
}
async function registerImports(paths) {
    const added = [];
    for (const file of paths) {
      const stat = await fs.stat(file);
      const id = crypto.randomUUID();
      const f = {
        id,
        path: file,
        name: path.basename(file),
        kind: videoExt.includes(path.extname(file).slice(1).toLowerCase())
          ? "video"
          : "photo",
        identity: { size: stat.size, mtimeMs: stat.mtimeMs },
      };
      files.set(id, f);
      added.push(f);
    }
    dirty = true;
    return added;
}
async function confirmReplace() {
  if (!dirty) return true;
  const r = await dialog.showMessageBox(win, {
    type: "question",
    message: "¿Cambiar de proyecto?",
    detail:
      "La sesión actual está recuperable en este equipo. Guardá el proyecto si querés conservarlo por separado.",
    buttons: ["Volver", "Continuar"],
    defaultId: 0,
    cancelId: 0,
  });
  return r.response === 1;
}
app.whenReady().then(async () => {
  cache = path.join(
    app.getPath("temp"),
    "filmlab-professional",
    crypto.randomUUID(),
  );
  await fs.mkdir(cache, { recursive: true });
  store = new ProjectStore(
    path.join(app.getPath("userData"), "recovery.flpro"),
  );
  const binary =
    process.env.FILMLAB_ENGINE ||
    (app.isPackaged
      ? path.join(
          process.resourcesPath,
          "engine",
          "filmlab-professional-engine.exe",
        )
      : path.join(
          __dirname,
          "..",
          "native",
          "target",
          "release",
          "filmlab-professional-engine" +
            (process.platform === "win32" ? ".exe" : ""),
        ));
  engine = new Engine(binary);
  engine.on("failure", (message) =>
    win?.webContents.send("progress", { error: message }),
  );
  engine.on("progress", (data) => win?.webContents.send("progress", { ...activeExport, ...data }));
  let hello, error;
  try {
    hello = await engine.start();
  } catch (e) {
    error = e.message;
  }
  protocol.handle("filmlab", (req) => {
    const u = new URL(req.url);
    const file = mediaUrls.get(u.pathname.slice(1));
    if (u.hostname !== "media" || !file)
      return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).href, { headers: req.headers });
  });
  ipcMain.handle("open-recipe-source",async(_,id)=>{
    const catalog=require("../ui/catalog/web-recipes.json");
    const recipe=catalog.recipes.find(r=>r.id===id);
    if(!recipe?.source)throw new Error("No hay una fuente enlazada.");
    const url=new URL(recipe.source);
    if(url.protocol!=="https:")throw new Error("La fuente debe utilizar HTTPS.");
    await shell.openExternal(url.href);return true;
  });
  ipcMain.handle("boot", () => ({
    hello,
    error,
    engineVersion: ENGINE,
    projectPath,
  }));
  ipcMain.handle("import", async () => {
    const result = await dialog.showOpenDialog(win, {
      title: "Agregar fotos y videos",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Fotos y videos", extensions: [...photoExt, ...videoExt] },
      ],
    });
    if (result.canceled) return [];
    return registerImports(result.filePaths);
  });
  ipcMain.handle("google-config",async()=>{
    const choice=await dialog.showOpenDialog(win,{title:"Elegí el JSON OAuth de aplicación de escritorio (solo se usa en esta sesión)",properties:["openFile"],filters:[{name:"JSON",extensions:["json"]}]});
    if(choice.canceled)return false;
    const data=JSON.parse(await fs.readFile(choice.filePaths[0],"utf8"));
    if(data.installed?.client_id!==CLIENT_ID || typeof data.installed?.client_secret!=="string")throw new Error("El JSON debe ser de escritorio y pertenecer al Client ID configurado.");
    googleSecret=data.installed.client_secret;return true;
  });
  ipcMain.handle("google-cancel",()=>{googleImport?.abort();return true;});
  ipcMain.handle("google-import",async()=>{
    if(googleImport)throw new Error("Ya hay una importación de Google Fotos en curso.");
    const choice=await dialog.showOpenDialog(win,{title:"Dónde guardar las copias de Google Fotos",properties:["openDirectory","createDirectory"]});
    if(choice.canceled)return {files:[],failures:[]};
    const controller=new AbortController();googleImport=controller;
    try{
      const result=await importPhotos({openExternal:url=>shell.openExternal(url),destination:choice.filePaths[0],signal:controller.signal,secret:googleSecret,onStatus:text=>win?.webContents.send("google-status",text)});
      return {...result,paths:undefined,files:await registerImports(result.paths)};
    }finally{googleImport=null;}
  });
  ipcMain.handle("preview", (_, m) => {
    const arrived = performance.now();
    return serial(async () => {
      const started = performance.now();
      const f = await activate(m.id);
      const openMs = performance.now()-started;
      const output = path.join(cache,crypto.randomUUID()+".png");
      const edge = m.draft ? 640 : 1500;
      const settings = m.original ? {} : m.settings;
      const result = await engine.request("preview",{
        key:f.id,settings,time:m.time || 0,edge,draft:!!m.draft,output,
      });
      const traceId = previewMetrics.add({fileName:f.name,kind:f.kind,quality:m.draft?"draft":"refined",original:!!m.original,
        timeSeconds:m.time || 0,edge,settings:structuredClone(settings),queueWaitMs:started-arrived,openMs,
        serviceMs:performance.now()-started,native:result.previewDiagnostics});
      const token = mediaUrl(output);
      const previews = [...mediaUrls].filter(([,p])=>p.endsWith(".png"));
      for(const [key,file] of previews.slice(0,-12)){
        mediaUrls.delete(key);await fs.rm(file,{force:true}).catch(()=>{});
      }
      return {...result,url:token,meta:f,traceId};
    });
  });
  ipcMain.handle("preview-metrics", (_, message) => previewMetrics.acknowledge(message));
  ipcMain.handle("save-preview-diagnostics", async () => {
    if(!previewMetrics.samples.length) throw new Error("Cargá una foto o video y probá algunos ajustes primero.");
    const result = await dialog.showSaveDialog(win,{title:"Guardar diagnóstico de respuesta",defaultPath:"FilmLab-preview-diagnostico.json",filters:[{name:"JSON",extensions:["json"]}]});
    if(result.canceled)return false;
    await keepReport(result.filePath,previewMetrics.report());return true;
  });
  ipcMain.handle("export", async (_, m) => {
    const encoding = m.encoding || "auto";
    if (!["auto", "cpu"].includes(encoding)) throw new Error("Modo de codificación desconocido.");
    const chosen = [...new Set(m.ids)].map(ensureFile);
    if (!chosen.length) throw new Error("Seleccioná al menos un archivo.");
    const r = m.proxy
      ? { filePaths: [cache] }
      : await dialog.showOpenDialog(win, {
          title: "Elegí la carpeta de exportación",
          properties: ["openDirectory", "createDirectory"],
        });
    if (r.canceled) return null;
    cancelExport = false;
    return serial(async () => {
      const results = [];
      for (const [fileIndex, f] of chosen.entries()) {
        if(cancelExport) throw new Error("Exportación cancelada. Los archivos ya guardados se conservan.");
        if (m.proxy && f.kind !== "video")
          throw new Error("La reproducción es para videos.");
        const settings = m.settings[f.id];
        if (!settings) throw new Error("Faltan los ajustes del archivo.");
        const started = performance.now();
        await activate(f.id);
        if(cancelExport) throw new Error("Exportación cancelada.");
        const openMs = performance.now() - started;
        activeExport = { fileName:f.name, fileIndex, fileTotal:chosen.length, kind:f.kind };
        win?.webContents.send("progress", {...activeExport, fraction:0, phase:"preparing", encoder:encoding === "cpu" ? "CPU" : "checking", elapsedSeconds:0});
        const ext =
          f.kind === "video" ? "mp4" : m.format === "jpg" ? "jpg" : "png";
        const name = m.proxy
          ? crypto.randomUUID()
          : path.parse(f.name).name + "-filmlab";
        let dest = path.join(r.filePaths[0], name + "." + ext);
        if (!m.proxy) {
          for (
            let n = 2;
            await fs.access(dest).then(
              () => true,
              () => false,
            );
            n++
          )
            dest = path.join(r.filePaths[0], name + "-" + n + "." + ext);
        }
        const temp = path.join(
          path.dirname(dest),
          "." + crypto.randomUUID() + "." + ext,
        );
        let nativeResult, reportWarning = null;
        async function recordExport(status, error = null, result = nativeResult) {
          if (m.proxy) return;
          lastReport = makeReport({name:f.name,kind:f.kind,result,status,error,openMs,wallMs:performance.now()-started,redact:[f.path,temp,dest,app.getPath("home")]});
          try {
            await keepReport(path.join(app.getPath("userData"), "last-export-diagnostics.json"), lastReport);
            if (m.saveReport && status === "completed") await fs.writeFile(dest + ".diagnostico.json", JSON.stringify(lastReport,null,2), {flag:"wx"});
          } catch (e) { reportWarning = "El archivo se exportó, pero no se pudo guardar el informe: " + e.message; }
        }
        try {
          nativeResult = await engine.request("export", {
            key: f.id,
            path: f.path,
            settings,
            output: temp,
            proxy: !!m.proxy,
            encoding,
          });
          if(cancelExport) throw new Error("Exportación cancelada.");
          await fs.rename(temp, dest);
          await recordExport("completed");
          win?.webContents.send("progress", {...activeExport, fraction:1, committed:true, elapsedSeconds:(performance.now()-started)/1000, encoder:nativeResult.diagnostics?.actualEncoder});
        } catch (e) {
          await recordExport(e.diagnostics?.status || "failed", e.message, {diagnostics:e.diagnostics});
          await fs.rm(temp, { force: true });
          throw e;
        } finally { activeExport = null; }
        results.push({
          id: f.id,
          path: dest,
          url: m.proxy ? mediaUrl(dest) : null,
          diagnostics:nativeResult?.diagnostics,
          reportWarning,
        });
      }
      return results;
    });
  });
  ipcMain.handle("save-diagnostics", async () => {
    let report = lastReport;
    if (!report) {
      try { report = JSON.parse(await fs.readFile(path.join(app.getPath("userData"), "last-export-diagnostics.json"), "utf8")); }
      catch { throw new Error("Primero exportá un archivo para generar el diagnóstico."); }
    }
    const result = await dialog.showSaveDialog(win, {title:"Guardar diagnóstico",defaultPath:"FilmLab-diagnostico.json",filters:[{name:"JSON",extensions:["json"]}]});
    if(result.canceled) return false;
    await keepReport(result.filePath, report);
    return true;
  });
  ipcMain.on("cancel", () => { cancelExport=true; engine.cancel(); });
  ipcMain.handle("autosave", async (_, p) => {
    const copy = snapshot(p);
    dirty = true;
    await store.save(store.recovery, copy);
    return { savedAt: new Date().toISOString() };
  });
  ipcMain.handle("save", async (_, p) => {
    let dest = projectPath;
    if (!dest) {
      const r = await dialog.showSaveDialog(win, {
        title: "Guardar proyecto local",
        defaultPath: "Sin título.flpro",
        filters: [{ name: "Film Lab Professional", extensions: ["flpro"] }],
      });
      if (r.canceled) return null;
      dest = r.filePath;
    }
    await store.save(dest, snapshot(p));
    projectPath = dest;
    dirty = false;
    return { path: dest };
  });
  ipcMain.handle("open-project", async () => {
    if (!(await confirmReplace())) return null;
    const r = await dialog.showOpenDialog(win, {
      filters: [{ name: "Film Lab Professional", extensions: ["flpro"] }],
      properties: ["openFile"],
    });
    if (r.canceled) return null;
    const p = await store.read(r.filePaths[0]);
    projectPath = r.filePaths[0];
    return remember(p);
  });
  ipcMain.handle("recover", async () => {
    try {
      return await remember(await store.read(store.recovery));
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  });
  ipcMain.handle("new-project", async () => {
    if (!(await confirmReplace())) return false;
    await serial(async () => {
      if (opened) await engine.request("release", { key: opened });
      files.clear();
      opened = null;
    });
    projectPath = null;
    dirty = false;
    await fs.rm(store.recovery, { force: true });
    return true;
  });
  ipcMain.handle("relink", async (_, id) => {
    const f = ensureFile(id);
    const r = await dialog.showOpenDialog(win, {
      title: `Ubicar ${f.name}`,
      properties: ["openFile"],
    });
    if (r.canceled) return null;
    const p = r.filePaths[0];
    const ext = path.extname(p).slice(1).toLowerCase();
    if (!(f.kind === "video" ? videoExt : photoExt).includes(ext))
      throw new Error("Elegí un archivo del mismo tipo.");
    const stat = await fs.stat(p);
    const confirm = await dialog.showMessageBox(win, {
      type: "question",
      message: "¿Vincular este original?",
      detail: `${p}\nLos ajustes se aplicarán a este archivo.`,
      buttons: ["Cancelar", "Vincular"],
      cancelId: 0,
    });
    if (confirm.response !== 1) return null;
    Object.assign(f, {
      path: p,
      name: path.basename(p),
      missing: false,
      identity: { size: stat.size, mtimeMs: stat.mtimeMs },
    });
    opened = null;
    dirty = true;
    return f;
  });
  win = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#f3f3eb",
    title: "Film Lab Professional",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e, url) => {
    if (
      url !== pathToFileURL(path.join(__dirname, "..", "ui", "index.html")).href
    )
      e.preventDefault();
  });
  win.on("close", (e) => {
    if (closing) return;
    e.preventDefault();
    win.webContents.send("progress", { closing: true });
  });
  ipcMain.handle("close-ready", async () => {
    await store.queue.catch(() => {});
    closing = true;
    win.close();
  }); // Renderer flushes recovery before acknowledging close.
  await win.loadFile(path.join(__dirname, "..", "ui", "index.html"));
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {googleImport?.abort();googleSecret=undefined;engine?.stop();});
app.on("will-quit", () => {
  fs.rm(cache, { recursive: true, force: true }).catch(() => {});
});
