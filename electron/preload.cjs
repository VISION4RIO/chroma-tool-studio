const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopInfo", {
  app: "Chroma Tool Studio",
  credits: "VISION4RIO",
});

contextBridge.exposeInMainWorld("desktopBridge", {
  pickOutputFolder: () => ipcRenderer.invoke("pick-output-folder"),
  saveBinaryFile: (outputDir, relativePath, buffer) =>
    ipcRenderer.invoke("save-binary-file", { outputDir, relativePath, buffer }),
  saveTextFile: (outputDir, relativePath, content) =>
    ipcRenderer.invoke("save-text-file", { outputDir, relativePath, content }),
});
