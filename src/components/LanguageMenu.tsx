import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";

/**
 * Compact language dropdown for the top bar.
 * Click flag → menu with all langs → pick → instant change + persisted.
 */
export function LanguageMenu() {
  const { lang, setLang, langs, t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const current = langs.find((l) => l.code === lang) ?? langs[0];

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v: boolean) => !v)}
        title={t("common.language")}
        className="flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-zinc-200 transition hover:bg-white/10"
      >
        <span aria-hidden>{current.flag}</span>
        <span className="hidden sm:inline">{current.label}</span>
        <span className="text-xs opacity-60">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 min-w-[200px] overflow-hidden rounded-lg border border-white/15 bg-zinc-900 shadow-xl">
          {langs.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => { setLang(l.code); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-white/10 ${
                l.code === lang ? "bg-white/5 text-cyan-300" : "text-zinc-200"
              }`}
            >
              <span>{l.flag}</span>
              <span className="flex-1">{l.label}</span>
              {l.code === lang && <span className="text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
