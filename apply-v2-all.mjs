import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MAIN_TSX = path.join(ROOT, "src", "main.tsx");
const APP_TSX = path.join(ROOT, "src", "App.tsx");

function die(m){console.error("X "+m);process.exit(1);}
function ok(m){console.log("OK "+m);}
function info(m){console.log(".. "+m);}
function warn(m){console.log("WARN "+m);}
function loose(a){let e=a.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");e=e.replace(/[ \t]+/g,"[ \\t]+");e=e.replace(/\n/g,"\\s*\\n\\s*");return new RegExp(e);}
function hard(s,a,r,l){const i=s.indexOf(a);if(i>=0)return s.slice(0,i)+r+s.slice(i+a.length);const re=loose(a);const m=s.match(re);if(!m)die("Not found: "+l);return s.replace(re,r);}
function soft(s,a,r,l){const i=s.indexOf(a);if(i>=0)return s.slice(0,i)+r+s.slice(i+a.length);const re=loose(a);const reg=new RegExp(re.source,"g");const m=s.match(reg);if(!m){warn("skip: "+l);return s;}if(m.length>1){warn("multi skip: "+l);return s;}return s.replace(re,r);}

const required = ["src/i18n/index.tsx","src/components/SettingsModal.tsx","src/components/ChangelogModal.tsx","src/components/VfxBlockEditorTab.tsx"];
const miss = required.filter(p => !fs.existsSync(path.join(ROOT, p)));
if(miss.length>0) die("Missing files:\n  - "+miss.join("\n  - "));
ok("Support files present");

// main.tsx
{
  const raw = fs.readFileSync(MAIN_TSX,"utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  let s = raw.replace(/\r\n/g,"\n");
  if(s.includes("I18nProvider")) info("main.tsx already patched");
  else {
    fs.writeFileSync(MAIN_TSX+".bak", raw);
    s = hard(s,'import App from "./App";','import App from "./App";\nimport { I18nProvider } from "./i18n";',"main import");
    s = hard(s,"<StrictMode>\n    <App />\n  </StrictMode>","<StrictMode>\n    <I18nProvider>\n      <App />\n    </I18nProvider>\n  </StrictMode>","main wrap");
    fs.writeFileSync(MAIN_TSX, eol==="\r\n" ? s.replace(/\n/g,"\r\n") : s);
    ok("Patched main.tsx");
  }
}

// App.tsx
{
  const raw = fs.readFileSync(APP_TSX,"utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  let s = raw.replace(/\r\n/g,"\n");
  if(s.includes("VfxBlockEditorTab") && s.includes("splashOpen") && s.includes("ChangelogModal")) {
    info("App.tsx already fully patched");
  } else {
    fs.writeFileSync(APP_TSX+".bak", raw);

    if(!s.includes("VfxBlockEditorTab")) {
      s = hard(s,'import parseDds from "parse-dds";',
        'import parseDds from "parse-dds";\nimport { AnimatePresence } from "framer-motion";\nimport { useI18n } from "./i18n";\nimport { SettingsModal } from "./components/SettingsModal";\nimport { ChangelogModal } from "./components/ChangelogModal";\nimport { VfxBlockEditorTab } from "./components/VfxBlockEditorTab";',
        "imports");
    }

    s = hard(s,'type ActiveTab = "assets" | "vfxRecolor" | "vfxLibrary";','type ActiveTab = "assets" | "vfxRecolor" | "vfxLibrary" | "vfxBlockEditor";',"ActiveTab");

    if(!s.includes("splashOpen")) {
      const APP_VERSION = "2.0.1";
      s = hard(s,'const [activeTab, setActiveTab] = useState<ActiveTab>("assets");',
        'const [activeTab, setActiveTab] = useState<ActiveTab>("assets");\n  const { t } = useI18n();\n  const [settingsOpen, setSettingsOpen] = useState(false);\n  const [changelogOpen, setChangelogOpen] = useState(false);\n  const APP_VERSION = "'+APP_VERSION+'";\n  const [splashOpen, setSplashOpen] = useState(() => { try { return window.localStorage.getItem("cts.splashSeen") !== APP_VERSION; } catch { return true; } });\n  useEffect(() => { if (!splashOpen) return; const tm = window.setTimeout(() => { setSplashOpen(false); try { window.localStorage.setItem("cts.splashSeen", APP_VERSION); } catch {} }, 5000); return () => window.clearTimeout(tm); }, [splashOpen]);',
        "state");
    }

    s = soft(s,'<h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">Chroma Tool Studio</h1>\n          <p className="mt-3 max-w-3xl text-zinc-300">Per-file texture zone detection, individual recolor profiles, and robust VFX .py recolor.</p>\n          <p className="mt-3 text-xs uppercase tracking-[0.16em] text-zinc-400">Credits: VISION4RIO</p>',
      '<div className="flex items-center justify-between gap-4">\n            <div className="flex items-center gap-3">\n              <h1 className="text-lg font-semibold tracking-tight text-white">{t("topbar.appName")}</h1>\n              <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-200">v2.0</span>\n            </div>\n            <div className="flex items-center gap-2">\n              <button type="button" onClick={() => setChangelogOpen(true)} title={t("topbar.changelog")} className="flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-zinc-200 transition hover:bg-white/10">📋 {t("topbar.changelog")}</button>\n              <button type="button" onClick={() => setSettingsOpen(true)} title={t("topbar.settings")} className="flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-zinc-200 transition hover:bg-white/10">⚙ {t("topbar.settings")}</button>\n            </div>\n          </div>',
      "header");
    s = soft(s,'<div className="relative mx-auto w-full max-w-7xl px-6 py-9 lg:px-10">','<div className="relative mx-auto w-full max-w-7xl px-6 py-3 lg:px-10">',"shrink hdr");
    s = soft(s,'<main className="mx-auto grid w-full max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[1.28fr_0.72fr] lg:px-10">',
      '<main className={`mx-auto w-full px-6 py-4 lg:px-10 ${activeTab === "vfxBlockEditor" ? "max-w-[1800px]" : "grid max-w-7xl gap-8 lg:grid-cols-[1.28fr_0.72fr]"}`}>',
      "main wrapper");

    s = soft(s,'            <button\n              type="button"\n              onClick={() => setActiveTab("vfxRecolor")}\n              className={`h-10 rounded-lg px-4 text-sm transition ${\n                activeTab === "vfxRecolor" ? "bg-cyan-400 text-zinc-950" : "border border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"\n              }`}\n            >\n              VFX Recolor (.py)\n            </button>\n          </div>',
      '            <button\n              type="button"\n              onClick={() => setActiveTab("vfxRecolor")}\n              className={`h-10 rounded-lg px-4 text-sm transition ${\n                activeTab === "vfxRecolor" ? "bg-cyan-400 text-zinc-950" : "border border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"\n              }`}\n            >\n              {t("tabs.vfxRecolor")}\n            </button>\n            <button\n              type="button"\n              onClick={() => setActiveTab("vfxBlockEditor")}\n              className={`h-10 rounded-lg px-4 text-sm transition ${\n                activeTab === "vfxBlockEditor" ? "bg-cyan-400 text-zinc-950" : "border border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"\n              }`}\n            >\n              {t("tabs.vfxBlockEditor")}\n            </button>\n          </div>',
      "tab bar");
    s = soft(s,'              Assets (DDS)\n            </button>', '              {t("tabs.assets")}\n            </button>', "Assets label");
    s = soft(s,'{activeTab === "assets" ? "Asset Intake" : "VFX Recolor Intake"}',
      '{activeTab === "assets" ? t("app.assetIntake") : activeTab === "vfxBlockEditor" ? t("tabs.vfxBlockEditor") : t("app.vfxRecolorIntake")}',
      "H2");
    s = soft(s,'            {activeTab === "assets" ? (\n              <div className="mt-4 grid gap-3 sm:grid-cols-2">',
      '            {activeTab === "vfxBlockEditor" ? (\n              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/40" style={{ height: "calc(100vh - 220px)", minHeight: "600px" }}>\n                <VfxBlockEditorTab />\n              </div>\n            ) : activeTab === "assets" ? (\n              <div className="mt-4 grid gap-3 sm:grid-cols-2">',
      "render editor inline");
    s = soft(s,'        <motion.aside', '        {activeTab !== "vfxBlockEditor" && (\n        <motion.aside', "aside open");
    s = soft(s,'        </motion.aside>', '        </motion.aside>\n        )}', "aside close");

    if(!s.includes("SettingsModal open=")) {
      let tail = '      </main>\n    </div>\n  );\n}\n';
      if(!s.endsWith(tail)){const alt='      </main>\n    </div>\n  );\n}';if(!s.endsWith(alt))die("tail mismatch");tail=alt;}
      const nc = '      </main>\n      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />\n      <ChangelogModal open={changelogOpen} onClose={() => setChangelogOpen(false)} />\n      <AnimatePresence>\n        {splashOpen && (\n          <motion.div key="splash" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} onClick={() => { setSplashOpen(false); try { window.localStorage.setItem("cts.splashSeen", APP_VERSION); } catch {} }} className="fixed inset-0 z-[3000] flex cursor-pointer items-center justify-center bg-zinc-950">\n            <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_10%,rgba(56,189,248,0.3),transparent_42%),radial-gradient(circle_at_80%_15%,rgba(167,139,250,0.3),transparent_38%)]" />\n            <motion.div initial={{ opacity: 0, y: 30, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.7, ease: "easeOut" }} className="relative max-w-2xl px-8 text-center">\n              <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }} className="text-5xl font-bold tracking-tight text-white md:text-6xl">{t("topbar.appName")}</motion.h1>\n              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.5 }} className="mt-3 inline-block rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-1 text-sm font-semibold text-cyan-200">v2.0 — {t("tabs.vfxBlockEditor")}</motion.div>\n              <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.0, duration: 0.5 }} className="mt-6 text-lg text-zinc-300">{t("topbar.appTagline")}</motion.p>\n              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6, duration: 0.5 }} className="mt-8 text-xs uppercase tracking-[0.3em] text-zinc-500">{t("topbar.appCredits")}</motion.p>\n            </motion.div>\n          </motion.div>\n        )}\n      </AnimatePresence>\n    </div>\n  );\n}' + (tail.endsWith("\n") ? "\n" : "");
      s = s.slice(0, s.length - tail.length) + nc;
    }

    fs.writeFileSync(APP_TSX, eol==="\r\n" ? s.replace(/\n/g,"\r\n") : s);
    ok("Patched App.tsx");
  }
}

// Bump version
const PKG = path.join(ROOT,"package.json");
if(fs.existsSync(PKG)){
  const pkg = JSON.parse(fs.readFileSync(PKG,"utf8"));
  if(pkg.version === "2.0.1") info("package.json already 2.0.1");
  else {
    fs.writeFileSync(PKG+".bak", JSON.stringify(pkg,null,2));
    pkg.version = "2.0.1";
    fs.writeFileSync(PKG, JSON.stringify(pkg,null,2)+"\n");
    ok("Bumped package.json to 2.0.1");
  }
}
const EB = path.join(ROOT,"electron-builder.yml");
if(fs.existsSync(EB)){
  let y = fs.readFileSync(EB,"utf8");
  if(y.includes("Chroma Tool Studio 2.0.1")) info("electron-builder.yml already 2.0.1");
  else if(y.includes("Chroma Tool Studio")) {
    fs.writeFileSync(EB+".bak", y);
    y = y.replace(/Chroma Tool Studio \d+\.\d+\.\d+/, "Chroma Tool Studio 2.0.1");
    fs.writeFileSync(EB, y);
    ok("Bumped electron-builder.yml to 2.0.1");
  }
}

console.log("\nDone! Next:");
console.log("  rm -rf dist/ release/");
console.log("  npm run build");
console.log("  npx electron-builder --win");