const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "filmLab",
  Object.freeze({
    recordPreviewMetrics: payload => ipcRenderer.invoke("preview-metrics", payload),
    savePreviewDiagnostics: () => ipcRenderer.invoke("save-preview-diagnostics"),
    openRecipeSource: id => ipcRenderer.invoke("open-recipe-source",id),
    googleImport: () => ipcRenderer.invoke("google-import"),
    googleCancel: () => ipcRenderer.invoke("google-cancel"),
    googleConfig: () => ipcRenderer.invoke("google-config"),
    removeFile: id => ipcRenderer.invoke("remove-file", id),
    onGoogleStatus: fn => {const cb=(_,text)=>fn(text);ipcRenderer.on("google-status",cb);return ()=>ipcRenderer.removeListener("google-status",cb);},
    boot: () => ipcRenderer.invoke("boot"),
    saveDiagnostics: () => ipcRenderer.invoke("save-diagnostics"),
    importFiles: () => ipcRenderer.invoke("import"),
    preview: (payload) => ipcRenderer.invoke("preview", payload),
    exportFiles: (payload) => ipcRenderer.invoke("export", payload),
    save: (payload) => ipcRenderer.invoke("save", payload),
    openProject: () => ipcRenderer.invoke("open-project"),
    recover: () => ipcRenderer.invoke("recover"),
    autosave: (payload) => ipcRenderer.invoke("autosave", payload),
    newProject: () => ipcRenderer.invoke("new-project"),
    relink: (id) => ipcRenderer.invoke("relink", id),
    closeReady: () => ipcRenderer.invoke("close-ready"),
    cancel: () => ipcRenderer.send("cancel"),
    onProgress: (fn) => {
      const cb = (_, data) => fn(data);
      ipcRenderer.on("progress", cb);
      return () => ipcRenderer.removeListener("progress", cb);
    },
  }),
);
