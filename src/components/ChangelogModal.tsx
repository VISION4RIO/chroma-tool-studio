import { useI18n } from "../i18n";

interface Props { open: boolean; onClose: () => void; }

type ChangeType = "added" | "changed" | "fixed" | "removed";
type Item = { type: ChangeType; key: string };
type Release = { version: string; date: string; items: Item[] };

const CHANGELOG: Release[] = [
  {
    version: "2.0.0",
    date: "2026-05-28",
    items: [
      { type: "added",   key: "changelog.v2.vfxBlockEditor" },
      { type: "added",   key: "changelog.v2.i18n" },
      { type: "added",   key: "changelog.v2.helpSystem" },
      { type: "added",   key: "changelog.v2.splash" },
      { type: "added",   key: "changelog.v2.settings" },
      { type: "added",   key: "changelog.v2.changelog" },
      { type: "changed", key: "changelog.v2.headerCollapsed" },
      { type: "changed", key: "changelog.v2.tabsRedesigned" },
      { type: "changed", key: "changelog.v2.electronMoved" },
    ],
  },
  {
    version: "1.0.1",
    date: "2026-04-19",
    items: [
      { type: "added",   key: "changelog.v101.batch" },
      { type: "added",   key: "changelog.v101.errorReport" },
      { type: "added",   key: "changelog.v101.fullscreen" },
      { type: "added",   key: "changelog.v101.applyAll" },
      { type: "added",   key: "changelog.v101.presets" },
      { type: "added",   key: "changelog.v101.autoupdate" },
      { type: "changed", key: "changelog.v101.simplifiedExport" },
      { type: "changed", key: "changelog.v101.assetWorkflow" },
      { type: "fixed",   key: "changelog.v101.neutralFix" },
      { type: "fixed",   key: "changelog.v101.batchStability" },
      { type: "removed", key: "changelog.v101.buildSkinExperimental" },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-03-29",
    items: [
      { type: "added", key: "changelog.v100.initial" },
      { type: "added", key: "changelog.v100.ddsPipeline" },
      { type: "added", key: "changelog.v100.vfxPython" },
      { type: "added", key: "changelog.v100.installer" },
    ],
  },
];

const BADGE: Record<ChangeType, string> = {
  added:   "bg-emerald-400/15 text-emerald-300 border-emerald-400/40",
  changed: "bg-cyan-400/15 text-cyan-300 border-cyan-400/40",
  fixed:   "bg-amber-400/15 text-amber-300 border-amber-400/40",
  removed: "bg-red-400/15 text-red-300 border-red-400/40",
};

const TYPE_ORDER: ChangeType[] = ["added", "changed", "fixed", "removed"];

export function ChangelogModal({ open, onClose }: Props) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <div role="dialog" className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 bg-zinc-950 px-5 py-4">
          <h2 className="text-lg font-semibold text-zinc-100">📋 {t("topbar.changelog")}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100" aria-label={t("common.close")}>✕</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {CHANGELOG.map((release) => {
            // group items by type, preserving TYPE_ORDER
            const groups = TYPE_ORDER
              .map((type) => ({ type, items: release.items.filter((i) => i.type === type) }))
              .filter((g) => g.items.length > 0);

            return (
              <div key={release.version} className="mb-7 last:mb-0">
                <div className="mb-3 flex items-baseline gap-3 border-b border-white/10 pb-2">
                  <h3 className="text-xl font-bold text-cyan-300">v{release.version}</h3>
                  <span className="text-xs text-zinc-500">{release.date}</span>
                </div>

                {groups.map((g) => (
                  <div key={g.type} className="mb-4 last:mb-0">
                    <div className="mb-2 flex items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${BADGE[g.type]}`}>
                        {t(`changelog.types.${g.type}`)}
                      </span>
                      <span className="text-[10px] text-zinc-600">{g.items.length}</span>
                    </div>
                    <ul className="space-y-1.5 pl-1">
                      {g.items.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm leading-relaxed text-zinc-200">
                          <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-zinc-500" />
                          <span>{t(item.key)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 bg-zinc-950 px-5 py-3">
          <a
            href="https://github.com/VISION4RIO/chroma-tool-studio/blob/main/CHANGELOG.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-cyan-400 hover:text-cyan-300"
          >
            {t("changelog.viewOnGitHub")} →
          </a>
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-white/15 bg-white/5 px-4 text-sm text-zinc-200 transition hover:bg-white/10">
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}