import fs from "node:fs";
const APP = "src/App.tsx";
const o = fs.readFileSync(APP, "utf8");
const eol = o.includes("\r\n") ? "\r\n" : "\n";
let s = o.replace(/\r\n/g, "\n");

function die(m){console.error("X "+m);process.exit(1);}
function ok(m){console.log("OK "+m);}
function warn(m){console.log("WARN "+m);}
function loose(a){let e=a.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");e=e.replace(/[ \t]+/g,"[ \\t]+");e=e.replace(/\n/g,"\\s*\\n\\s*");return new RegExp(e);}
function hard(src,a,r,l){const i=src.indexOf(a);if(i>=0)return src.slice(0,i)+r+src.slice(i+a.length);const re=loose(a);const m=src.match(re);if(!m)die("Not found: "+l);return src.replace(re,r);}
function soft(src,a,r,l){const i=src.indexOf(a);if(i>=0)return src.slice(0,i)+r+src.slice(i+a.length);const re=loose(a);const reg=new RegExp(re.source,"g");const m=src.match(reg);if(!m){warn("skip: "+l);return src;}if(m.length>1){warn("multi skip: "+l);return src;}return src.replace(re,r);}

// 1) Imports — add useI18n + SettingsModal + ChangelogModal + VfxBlockEditorTab + AnimatePresence
if(!s.includes("VfxBlockEditorTab")) {
  s = hard(s, 'import parseDds from "parse-dds";',
    'import parseDds from "parse-dds";\nimport { AnimatePresence } from "framer-motion";\nimport { useI18n } from "./i18n";\nimport { SettingsModal } from "./components/SettingsModal";\nimport { ChangelogModal } from "./components/ChangelogModal";\nimport { VfxBlockEditorTab } from "./components/VfxBlockEditorTab";',
    "imports");
}

// 2) ActiveTab + state
s = hard(s, 'type ActiveTab = "assets" | "vfxRecolor" | "vfxLibrary";',
  'type ActiveTab = "assets" | "vfxRecolor" | "vfxLibrary" | "vfxBlockEditor";', "ActiveTab");

s = hard(s, 'const [activeTab, setActiveTab] = useState<ActiveTab>("assets");',
  'const [activeTab, setActiveTab] = useState<ActiveTab>("assets");\n  const { t } = useI18n();\n  const [settingsOpen, setSettingsOpen] = useState(false);\n  const [changelogOpen, setChangelogOpen] = useState(false);\n  const [splashOpen, setSplashOpen] = useState(() => { try { return window.localStorage.getItem("cts.splashSeenV2") !== "1"; } catch { return true; } });\n  useEffect(() => { if (!splashOpen) return; const tm = window.setTimeout(() => { setSplashOpen(false); try { window.localStorage.setItem("cts.splashSeenV2", "1"); } catch {} }, 5000); return () => window.clearTimeout(tm); }, [splashOpen]);',
  "state");

// 3) Header → thin bar with Changelog + Settings buttons
s = hard(s, '<h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">Chroma Tool Studio</h1>\n          <p className="mt-3 max-w-3xl text-zinc-300">Per-file texture zone detection, individual recolor profiles, and robust VFX .py recolor.</p>\n          <p className="mt-3 text-xs uppercase tracking-[0.16em] text-zinc-400">Credits: VISION4RIO</p>',
  '<div className="flex items-center justify-between gap-4">\n            <div className="flex items-center gap-3">\n              <h1 className="text-lg font-semibold tracking-tight text-white">{t("topbar.appName")}</h1>\n              <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-200">v2.0</span>\n            </div>\n            <div className="flex items-center gap-2">\n              <button type="button" onClick={() => setChangelogOpen(true)} title={t("topbar.changelog")} className="flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-zinc-200 transition hover:bg-white/10">📋 {t("topbar.changelog")}</button>\n              <button type="button" onClick={() => setSettingsOpen(true)} title={t("topbar.settings")} className="flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-zinc-200 transition hover:bg-white/10">⚙ {t("topbar.settings")}</button>\n            </div>\n          </div>',
  "header");
s = soft(s, '<div className="relative mx-auto w-full max-w-7xl px-6 py-9 lg:px-10">',
  '<div className="relative mx-auto w-full max-w-7xl px-6 py-3 lg:px-10">', "shrink hdr");

// 4) Main → wider + single column when on vfxBlockEditor
s = hard(s, '<main className="mx-auto grid w-full max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[1.28fr_0.72fr] lg:px-10">',
  '<main className={`mx-auto w-full px-6 py-4 lg:px-10 ${activeTab === "vfxBlockEditor" ? "max-w-[1800px]" : "grid max-w-7xl gap-8 lg:grid-cols-[1.28fr_0.72fr]"}`}>',
  "main wrapper");

// 5) Tab bar — 3rd tab
s = hard(s, '            <button\n              type="button"\n              onClick={() => setActiveTab("vfxRecolor")}\n              className={`h-10 rounded-lg px-4 text-sm transition ${\n                activeTab === "vfxRecolor" ? "bg-cyan-400 text-zinc-950" : "border border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"\n              }`}\n            >\n              VFX Recolor (.py)\n            </button>\n          </div>',
  '            <button\n              type="button"\n              onClick={() => setActiveTab("vfxRecolor")}\n              className={`h-10 rounded-lg px-4 text-sm transition ${\n                activeTab === "vfxRecolor" ? "bg-cyan-400 text-zinc-950" : "border border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"\n              }`}\n            >\n              {t("tabs.vfxRecolor")}\n            </button>\n            <button\n              type="button"\n              onClick={() => setActiveTab("vfxBlockEditor")}\n              className={`h-10 rounded-lg px-4 text-sm transition ${\n                activeTab === "vfxBlockEditor" ? "bg-cyan-400 text-zinc-950" : "border border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"\n              }`}\n            >\n              {t("tabs.vfxBlockEditor")}\n            </button>\n          </div>',
  "tab bar 3rd");

// 6) Title H2 + Assets label + Render VFX Block Editor inline (taking full inner card)
s = soft(s, '              Assets (DDS)\n            </button>', '              {t("tabs.assets")}\n            </button>', "Assets label");
s = soft(s, '{activeTab === "assets" ? "Asset Intake" : "VFX Recolor Intake"}',
  '{activeTab === "assets" ? t("app.assetIntake") : activeTab === "vfxBlockEditor" ? t("tabs.vfxBlockEditor") : t("app.vfxRecolorIntake")}',
  "H2");

s = soft(s, '            {activeTab === "assets" ? (\n              <div className="mt-4 grid gap-3 sm:grid-cols-2">',
  '            {activeTab === "vfxBlockEditor" ? (\n              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/40" style={{ height: "calc(100vh - 220px)", minHeight: "600px" }}>\n                <VfxBlockEditorTab />\n              </div>\n            ) : activeTab === "assets" ? (\n              <div className="mt-4 grid gap-3 sm:grid-cols-2">',
  "render block editor");

// 7) Hide aside on vfxBlockEditor
s = soft(s, '        <motion.aside', '        {activeTab !== "vfxBlockEditor" && (\n        <motion.aside', "aside open");
s = soft(s, '        </motion.aside>', '        </motion.aside>\n        )}', "aside close");

// 8) Translations — covers many strings (with newline tolerance via soft())
const tr = [
  ['>Selected Asset Sources<','>{t("app.selectedAssetSources")}<'],
  ['>No DDS files selected.<','>{t("app.noDdsFilesSelected")}<'],
  ['>DDS Profiles Per File<','>{t("app.ddsProfilesPerFile")}<'],
  ['>No DDS loaded</option>','>{t("app.noDdsLoaded")}</option>'],
  ['>No zones detected for this file yet.<','>{t("app.noZonesDetected")}<'],
  ['>Selected File Preview<','>{t("app.selectedFilePreview")}<'],
  ['>Original preview<','>{t("app.originalPreview")}<'],
  ['>Processed preview<','>{t("app.processedPreview")}<'],
  ['>Coverage<','>{t("app.coverage")}<'],
  ['>Uncovered heatmap<','>{t("app.uncoveredHeatmap")}<'],
  ['>Asset Processing Controls<','>{t("app.assetProcessingControls")}<'],
  ['>VFX Recolor Settings<','>{t("app.vfxRecolorSettings")}<'],
  ['>Selected Python File<','>{t("app.selectedPythonFile")}<'],
  ['>VFX Preview<','>{t("app.vfxPreview")}<'],
  ['>Status<','>{t("app.status")}<'],
  ['>Output<','>{t("app.output")}<'],
  ['>Target<','>{t("app.target")}<'],
  ['>Selected VFX Color<','>{t("app.selectedVfxColor")}<'],
  ['>Auto prompt on build<','>{t("app.autoPromptOnBuild")}<'],
  ['>VFX Parser Mode<','>{t("app.vfxParserMode")}<'],
  ['>Each DDS has its own isolated color zones. Edit one file without affecting the others.<','>{t("app.eachDdsHasZones")}<'],
  ['>DDS support:<','>{t("app.ddsSupport")}<'],
  ['>Safe (birthColor + color blocks only)</option>','>{t("app.vfxModeSafe")}</option>'],
  ['>Aggressive (all vec4 tuples)</option>','>{t("app.vfxModeAggressive")}</option>'],
  ['>No .py selected for recolor.<','>{t("app.noPySelected")}<'],
  ['>Selected file health check<','>{t("app.fileHealthCheck")}<'],
  ['>Built by VISION4RIO<','>{t("app.builtBy")}<'],
  ['>Side by Side<','>{t("app.sideBySide")}<'],
  ['>A/B Split<','>{t("app.abSplit")}<'],
  ['>Blink Compare<','>{t("app.blinkCompare")}<'],
  ['>Fullscreen<','>{t("app.fullscreen")}<'],
  ['>Ready<','>{t("app.ready")}<'],
  ['>None<','>{t("app.none")}<'],
  // text + newlines variants
  ['>Re-detect Selected<','>{t("app.reDetectSelected")}<'],
  ['>Apply Profile to All DDS<','>{t("app.applyProfileToAll")}<'],
  ['>Apply Preset to Enabled Zones<','>{t("app.applyPresetEnabled")}<'],
  ['>Apply Preset to All DDS Files<','>{t("app.applyPresetAllFiles")}<'],
  ['>Load DDS Folder<','>{t("app.loadDdsFolder")}<'],
  ['>Load DDS Files<','>{t("app.loadDdsFiles")}<'],
  ['>Load Single .py for VFX Recolor<','>{t("app.loadSingleVfx")}<'],
  ['>Loaded by file selection<','>{t("app.loadedByFile")}<'],
  ['>Hue Match<','>{t("app.hueMatch")}<'],
  ['>Saturation Match<','>{t("app.saturationMatch")}<'],
  ['>Value Match<','>{t("app.valueMatch")}<'],
  ['>Intensity<','>{t("app.intensity")}<'],
  ['>Saturation Boost<','>{t("app.saturationBoost")}<'],
  ['>Neutral Protection<','>{t("app.neutralProtection")}<'],
];
for(const[f,r] of tr) s = soft(s, f, r, "i18n " + f.slice(1, 40));

// 8b) Regex-based translation for hardcoded strings with whitespace (between > and <)
const wsFixes = [
  ["Re-detect Selected","app.reDetectSelected"],
  ["Apply Profile to All DDS","app.applyProfileToAll"],
  ["Apply Preset to Enabled Zones","app.applyPresetEnabled"],
  ["Apply Preset to All DDS Files","app.applyPresetAllFiles"],
  ["Load DDS Folder","app.loadDdsFolder"],
  ["Load DDS Files","app.loadDdsFiles"],
  ["Load Single .py for VFX Recolor","app.loadSingleVfx"],
  ["Loaded by file selection","app.loadedByFile"],
  ["Hue Match","app.hueMatch"],
  ["Saturation Match","app.saturationMatch"],
  ["Value Match","app.valueMatch"],
  ["VFX Parser Mode","app.vfxParserMode"],
  ["Build DDS Asset Output","app.buildDdsOutput"],
  ["Build VFX Recolor Output","app.buildVfxOutput"],
  ["Build Skin Output","app.buildSkinOutput"],
  ["Processing...","app.processing"],
  ["Load DDS assets or VFX files to begin.","app.loadAssetsToBegin"],
  ["Ready","app.ready"],
];
for (const [text, key] of wsFixes) {
  const esc = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`>(\\s*)${esc}(\\s*)<`, "g");
  if (re.test(s)) {
    s = s.replace(re, `>$1{t("${key}")}$2<`);
  }
}

// 9) Final: SettingsModal + ChangelogModal + Splash
if (!s.includes("SettingsModal open=")) {
  let tail = '      </main>\n    </div>\n  );\n}\n';
  if (!s.endsWith(tail)) { const alt = '      </main>\n    </div>\n  );\n}'; if (!s.endsWith(alt)) die("tail mismatch"); tail = alt; }
  const newTail = '      </main>\n      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />\n      <ChangelogModal open={changelogOpen} onClose={() => setChangelogOpen(false)} />\n      <AnimatePresence>\n        {splashOpen && (\n          <motion.div key="splash" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} onClick={() => { setSplashOpen(false); try { window.localStorage.setItem("cts.splashSeenV2", "1"); } catch {} }} className="fixed inset-0 z-[3000] flex cursor-pointer items-center justify-center bg-zinc-950">\n            <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_10%,rgba(56,189,248,0.3),transparent_42%),radial-gradient(circle_at_80%_15%,rgba(167,139,250,0.3),transparent_38%)]" />\n            <motion.div initial={{ opacity: 0, y: 30, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.7, ease: "easeOut" }} className="relative max-w-2xl px-8 text-center">\n              <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }} className="text-5xl font-bold tracking-tight text-white md:text-6xl">{t("topbar.appName")}</motion.h1>\n              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.5 }} className="mt-3 inline-block rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-1 text-sm font-semibold text-cyan-200">v2.0 — {t("tabs.vfxBlockEditor")}</motion.div>\n              <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.0, duration: 0.5 }} className="mt-6 text-lg text-zinc-300">{t("topbar.appTagline")}</motion.p>\n              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6, duration: 0.5 }} className="mt-8 text-xs uppercase tracking-[0.3em] text-zinc-500">{t("topbar.appCredits")}</motion.p>\n            </motion.div>\n          </motion.div>\n        )}\n      </AnimatePresence>\n    </div>\n  );\n}' + (tail.endsWith("\n") ? "\n" : "");
  s = s.slice(0, s.length - tail.length) + newTail;
}

fs.writeFileSync(APP, eol === "\r\n" ? s.replace(/\n/g, "\r\n") : s);
ok("App.tsx patched");
console.log("\nDone! Run:");
console.log("  rm -rf dist/ release/ && npm run build");