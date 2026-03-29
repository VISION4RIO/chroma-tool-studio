const { app, BrowserWindow, Menu, ipcMain, dialog, shell, session } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const isDev = !app.isPackaged;

function isAllowedRuntimeUrl(url) {
  if (!url) return false;
  if (url.startsWith("file:")) return true;
  if (url.startsWith("data:")) return true;
  if (url.startsWith("blob:")) return true;
  if (url.startsWith("devtools:")) return true;
  if (isDev && (url.startsWith("http://127.0.0.1:") || url.startsWith("http://localhost:"))) return true;
  return false;
}

function hardenOfflineMode() {
  if (isDev) return;

  // Block all remote network requests in production builds.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => {
    const blocked = /^https?:\/\//i.test(details.url) || /^wss?:\/\//i.test(details.url);
    callback({ cancel: blocked });
  });

  // Deny runtime permission popups (camera, mic, notifications, etc).
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1520,
    height: 920,
    minWidth: 1280,
    minHeight: 760,
    show: false,
    backgroundColor: "#09090b",
    autoHideMenuBar: true,
    title: "Chroma Tool Studio",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // Keep sandbox off so preload can expose the desktop bridge reliably.
      sandbox: false,
      spellcheck: false,
      devTools: isDev,
    },
  });

  // Hard-disable app menu so Alt/AltGr does not reveal browser-like menus.
  win.removeMenu();
  win.setMenuBarVisibility(false);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedRuntimeUrl(url)) {
      return { action: "allow" };
    }

    // In dev this can still open docs in the browser.
    if (isDev) {
      shell.openExternal(url).catch(() => undefined);
    }

    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedRuntimeUrl(url)) {
      event.preventDefault();
    }
  });

  if (isDev) {
    win.loadURL("http://127.0.0.1:5173");
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  win.once("ready-to-show", () => {
    win.maximize();
    win.show();
  });
}

function resolveSafeOutputPath(outputDir, relativePath) {
  const normalizedBase = path.resolve(outputDir);
  const normalizedRel = String(relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const candidate = path.resolve(normalizedBase, normalizedRel);
  if (!candidate.toLowerCase().startsWith(normalizedBase.toLowerCase())) {
    throw new Error("Invalid output path");
  }
  return candidate;
}

ipcMain.handle("pick-output-folder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
    title: "Select Output Folder",
    defaultPath: app.getPath("documents"),
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("save-binary-file", async (_event, payload) => {
  const { outputDir, relativePath, buffer } = payload || {};
  if (!outputDir || !relativePath || !buffer) return { ok: false, error: "Missing parameters" };
  try {
    const target = resolveSafeOutputPath(outputDir, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, Buffer.from(new Uint8Array(buffer)));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Write failed" };
  }
});

ipcMain.handle("save-text-file", async (_event, payload) => {
  const { outputDir, relativePath, content } = payload || {};
  if (!outputDir || !relativePath || typeof content !== "string") return { ok: false, error: "Missing parameters" };
  try {
    const target = resolveSafeOutputPath(outputDir, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Write failed" };
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  hardenOfflineMode();
  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
