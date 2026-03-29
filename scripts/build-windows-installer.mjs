import { spawn } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, ...env },
    });

    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with code ${code ?? -1}`));
    });
  });
}

async function readPackageJson() {
  const raw = await readFile(new URL("../package.json", import.meta.url), "utf8");
  return JSON.parse(raw);
}

async function writePackageJson(pkg) {
  const out = `${JSON.stringify(pkg, null, 2)}\n`;
  await writeFile(new URL("../package.json", import.meta.url), out, "utf8");
}

async function ensureElectronAsDevDependency() {
  const pkg = await readPackageJson();
  const deps = pkg.dependencies ?? {};
  const devDeps = pkg.devDependencies ?? {};

  const electronInDeps = typeof deps.electron === "string";
  const builderInDeps = typeof deps["electron-builder"] === "string";

  const electronVersion = deps.electron ?? devDeps.electron ?? "^41.1.0";
  const builderVersion = deps["electron-builder"] ?? devDeps["electron-builder"] ?? "^26.8.1";

  if (electronInDeps || builderInDeps || !devDeps.electron || !devDeps["electron-builder"]) {
    console.log("[preflight] Normalizing electron dependencies in package.json...");
    if (!pkg.devDependencies) pkg.devDependencies = {};
    pkg.devDependencies.electron = electronVersion;
    pkg.devDependencies["electron-builder"] = builderVersion;

    if (pkg.dependencies?.electron) delete pkg.dependencies.electron;
    if (pkg.dependencies?.["electron-builder"]) delete pkg.dependencies["electron-builder"];

    await writePackageJson(pkg);
  }

  await run("npm", ["install"]);
}

async function assertInstallerCreated() {
  const releasePath = path.resolve("release");
  const expected = path.join(releasePath, "builder-effective-config.yaml");
  try {
    await access(expected, fsConstants.F_OK);
  } catch {
    throw new Error("electron-builder finished without generating release artifacts. Check terminal output above.");
  }
}

async function main() {
  await ensureElectronAsDevDependency();

  console.log("[1/2] Building web app...");
  await run("npm", ["run", "build"]);

  console.log("[2/2] Building Windows installer (.exe)...");
  await run(
    "npm",
    ["exec", "--", "electron-builder", "--win", "nsis", "--publish", "never", "--config", "electron-builder.yml"],
    {
      CSC_IDENTITY_AUTO_DISCOVERY: "false",
      ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES: "true",
    },
  );

  await assertInstallerCreated();

  console.log("Installer generated in ./release");
}

main().catch((error) => {
  const text = error instanceof Error ? error.message : String(error);
  console.error(text);
  if (text.includes("Cannot create symbolic link") || text.includes("winCodeSign")) {
    console.error("Build failed due to Windows symlink permission while extracting winCodeSign cache.");
    console.error("Try: run terminal as Administrator and clear %LOCALAPPDATA%\\electron-builder\\Cache, then run again.");
  }
  process.exit(1);
});
