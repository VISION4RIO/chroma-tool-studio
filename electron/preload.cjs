const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopInfo", {
  app: "Chroma Tool Studio",
  credits: "VISION4RIO",
});

contextBridge.exposeInMainWorld("desktopBridge", {
  pickOutputFolder: () => ipcRenderer.invoke("pick-output-folder"),
  pickRiotSource: () => ipcRenderer.invoke("pick-riot-source"),
  ingestRiotSource: (sourcePath) => ipcRenderer.invoke("ingest-riot-source", { sourcePath }),
  saveBinaryFile: (outputDir, relativePath, buffer) =>
    ipcRenderer.invoke("save-binary-file", { outputDir, relativePath, buffer }),
  saveTextFile: (outputDir, relativePath, content) =>
    ipcRenderer.invoke("save-text-file", { outputDir, relativePath, content }),
  updater: {
    checkForUpdates: () => ipcRenderer.invoke("updater-check"),
    downloadUpdate: () => ipcRenderer.invoke("updater-download"),
    installUpdate: () => ipcRenderer.invoke("updater-install"),
    getAppVersion: () => ipcRenderer.invoke("updater-app-version"),
    onEvent: (handler) => {
      const listener = (_event, payload) => {
        if (typeof handler === "function") handler(payload);
      };
      ipcRenderer.on("updater-event", listener);
      return () => {
        ipcRenderer.removeListener("updater-event", listener);
      };
    },
  },
});
