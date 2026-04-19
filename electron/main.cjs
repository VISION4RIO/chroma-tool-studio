const { app, BrowserWindow, Menu, ipcMain, dialog, shell, session } = require("electron");
const fs = require("node:fs/promises");
const os = require("node:os");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { autoUpdater } = require("electron-updater");

const isDev = !app.isPackaged;
let mainWindow = null;
let updaterConfigured = false;

function getAdmZip() {
  // Lazy-load optional package to avoid boot crashes from legacy deps when feature is unused.
  // Build Skin intake currently targets .py flows and does not need this during startup.
  // eslint-disable-next-line global-require
  return require("adm-zip");
}

function getWadParser() {
  // Lazy-load optional package for Riot package extraction only when explicitly requested.
  // eslint-disable-next-line global-require
  return require("lol-wad-parser");
}

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

  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
}

function sendUpdaterEvent(type, payload = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("updater-event", { type, ...payload });
}

function formatReleaseNotes(notes) {
  if (Array.isArray(notes)) {
    return notes
      .map((item) => item?.note)
      .filter(Boolean)
      .join("\n\n");
  }
  return typeof notes === "string" ? notes : "";
}

function serializeUpdateInfo(info) {
  if (!info) return null;
  return {
    version: info.version,
    releaseName: info.releaseName || "",
    releaseDate: info.releaseDate || "",
    releaseNotes: formatReleaseNotes(info.releaseNotes),
  };
}

function setupAutoUpdater() {
  if (isDev || updaterConfigured) return;
  updaterConfigured = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    sendUpdaterEvent("checking");
  });

  autoUpdater.on("update-available", (info) => {
    sendUpdaterEvent("available", { info: serializeUpdateInfo(info) });
  });

  autoUpdater.on("update-not-available", (info) => {
    sendUpdaterEvent("not-available", { info: serializeUpdateInfo(info) });
  });

  autoUpdater.on("download-progress", (progress) => {
    sendUpdaterEvent("downloading", {
      percent: Math.round(progress.percent || 0),
      bytesPerSecond: Math.round(progress.bytesPerSecond || 0),
      transferred: Number(progress.transferred || 0),
      total: Number(progress.total || 0),
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    sendUpdaterEvent("downloaded", { info: serializeUpdateInfo(info) });
  });

  autoUpdater.on("error", (error) => {
    sendUpdaterEvent("error", { message: error?.message || "Auto-update failed." });
  });
}

async function checkForAppUpdates() {
  if (isDev) {
    sendUpdaterEvent("disabled", { message: "Auto-update is disabled in development mode." });
    return { ok: false, reason: "dev" };
  }
  try {
    setupAutoUpdater();
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (error) {
    sendUpdaterEvent("error", { message: error instanceof Error ? error.message : "Update check failed." });
    return { ok: false, error: error instanceof Error ? error.message : "Update check failed." };
  }
}

async function downloadLatestUpdate() {
  if (isDev) return { ok: false, reason: "dev" };
  try {
    setupAutoUpdater();
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (error) {
    sendUpdaterEvent("error", { message: error instanceof Error ? error.message : "Failed to download update." });
    return { ok: false, error: error instanceof Error ? error.message : "Failed to download update." };
  }
}

function installDownloadedUpdate() {
  if (isDev) return { ok: false, reason: "dev" };
  try {
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  } catch (error) {
    sendUpdaterEvent("error", { message: error instanceof Error ? error.message : "Failed to install update." });
    return { ok: false, error: error instanceof Error ? error.message : "Failed to install update." };
  }
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

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectFilesRecursive(rootDir, matcher) {
  const out = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(next);
        continue;
      }
      if (matcher(next)) out.push(next);
    }
  }
  return out;
}

function inferPythonKind(relativePath, content = "") {
  const normalized = relativePath.replace(/\\/g, "/").toLowerCase();
  if (/skins\/skin\d+\.py$/.test(normalized) || /\/skins\/base\//.test(normalized) || /skin\d+\.py$/.test(normalized)) {
    return "skin";
  }
  if (/skinmeshproperties|skincharacterdataproperties|championskinname\s*:\s*string/i.test(content)) {
    return "skin";
  }
  return "vfx";
}

async function extractZipToDir(inputPath, outputDir) {
  const AdmZip = getAdmZip();
  const zip = new AdmZip(inputPath);
  zip.extractAllTo(outputDir, true);
}

async function extractWadToDir(inputPath, outputDir) {
  const WadParser = getWadParser();
  const wad = new WadParser();
  await new Promise((resolve, reject) => {
    wad.extract(inputPath, outputDir, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function runRitobinConvert(targetDir) {
  const candidates = [
    { cmd: "ritobin-tools", args: ["convert", targetDir, "-r"] },
    { cmd: "ritobin_cli.exe", args: [targetDir] },
    { cmd: "ritobin-cli", args: [targetDir] },
  ];

  for (const candidate of candidates) {
    const result = await new Promise((resolve) => {
      const proc = spawn(candidate.cmd, candidate.args, {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stderr = "";
      proc.stderr.on("data", (chunk) => {
        stderr += String(chunk || "");
      });

      proc.on("error", () => resolve({ ok: false, error: `${candidate.cmd} not available` }));
      proc.on("close", (code) => {
        if (code === 0) {
          resolve({ ok: true });
        } else {
          resolve({ ok: false, error: stderr.trim() || `${candidate.cmd} failed with exit code ${code}.` });
        }
      });
    });

    if (result.ok) return result;
  }

  return { ok: false, error: "No BIN converter found. Install ritobin-tools or make ritobin_cli available in PATH." };
}

async function ingestRiotSourceToPythonRecords(inputPath) {
  const sourceExists = await pathExists(inputPath);
  if (!sourceExists) throw new Error("Selected source path does not exist.");

  const stats = await fs.stat(inputPath);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "chroma-riot-intake-"));
  const warnings = [];

  let workingDir = inputPath;
  let ownsWorkingDir = false;
  if (stats.isDirectory()) {
    workingDir = inputPath;
  } else {
    const lower = inputPath.toLowerCase();
    workingDir = path.join(tempRoot, "extracted");
    await fs.mkdir(workingDir, { recursive: true });
    ownsWorkingDir = true;

    if (lower.endsWith(".zip") || lower.endsWith(".fantome")) {
      await extractZipToDir(inputPath, workingDir);
    } else if (lower.endsWith(".wad") || lower.endsWith(".wad.client")) {
      await extractWadToDir(inputPath, workingDir);
    } else if (lower.endsWith(".py") || lower.endsWith(".bin")) {
      const dest = path.join(workingDir, path.basename(inputPath));
      await fs.copyFile(inputPath, dest);
    } else {
      throw new Error("Unsupported source format. Use folder, .zip, .fantome, .wad or .wad.client.");
    }
  }

  const binFiles = await collectFilesRecursive(workingDir, (filePath) => filePath.toLowerCase().endsWith(".bin"));
  if (binFiles.length > 0) {
    const convertResult = await runRitobinConvert(workingDir);
    if (!convertResult.ok) {
      warnings.push(`BIN conversion unavailable: ${convertResult.error}`);
    }
  }

  const pyFiles = await collectFilesRecursive(workingDir, (filePath) => filePath.toLowerCase().endsWith(".py"));
  const records = [];
  for (const pyPath of pyFiles) {
    let text = "";
    try {
      text = await fs.readFile(pyPath, "utf8");
    } catch {
      continue;
    }
    const relativePath = path.relative(workingDir, pyPath).replace(/\\/g, "/");
    records.push({
      name: path.basename(pyPath),
      relativePath,
      content: text,
      kind: inferPythonKind(relativePath, text),
    });
  }

  if (ownsWorkingDir) {
    fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }

  return { records, warnings };
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

ipcMain.handle("pick-riot-source", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile", "openDirectory"],
    title: "Select Riot source (folder, .zip, .fantome, .wad.client)",
    defaultPath: app.getPath("documents"),
    filters: [
      { name: "Riot Packages", extensions: ["zip", "fantome", "wad", "client", "py", "bin"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("ingest-riot-source", async (_event, payload) => {
  const sourcePath = payload?.sourcePath;
  if (!sourcePath || typeof sourcePath !== "string") {
    return { ok: false, error: "Missing sourcePath." };
  }
  try {
    const result = await ingestRiotSourceToPythonRecords(sourcePath);
    return { ok: true, files: result.records, warnings: result.warnings };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Riot source ingestion failed." };
  }
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

ipcMain.handle("updater-check", async () => {
  return checkForAppUpdates();
});

ipcMain.handle("updater-download", async () => {
  return downloadLatestUpdate();
});

ipcMain.handle("updater-install", () => {
  return installDownloadedUpdate();
});

ipcMain.handle("updater-app-version", () => {
  return app.getVersion();
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  hardenOfflineMode();
  setupAutoUpdater();
  createMainWindow();

  if (!isDev) {
    setTimeout(() => {
      checkForAppUpdates().catch(() => undefined);
    }, 1800);
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
