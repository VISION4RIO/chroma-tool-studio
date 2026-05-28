import { useI18n } from "../i18n";

interface Props { open: boolean; onClose: () => void; }

export function SettingsModal({ open, onClose }: Props) {
  const { t, lang, setLang, langs } = useI18n();
  if (!open) return null;

  return (
    <div
      role="dialog"
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/15 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 bg-zinc-950 px-5 py-4">
          <h2 className="text-lg font-semibold text-zinc-100">⚙ {t("settings.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
            aria-label={t("common.close")}
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wide text-zinc-400">
              {t("settings.languageLabel")}
            </label>
            <div className="grid grid-cols-1 gap-2">
              {langs.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLang(l.code)}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition ${
                    l.code === lang
                      ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100"
                      : "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                  }`}
                >
                  <span className="text-lg">{l.flag}</span>
                  <span className="flex-1">{l.label}</span>
                  {l.code === lang && <span className="text-cyan-300">✓</span>}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500">{t("settings.languageHint")}</p>
          </div>
        </div>

        <div className="flex justify-end border-t border-white/10 bg-zinc-950 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-white/15 bg-white/5 px-4 text-sm text-zinc-200 transition hover:bg-white/10"
          >
            {t("settings.closeBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
