/* ──────────────────────────────────────────────────────────────────────────
   Tiny i18n system — no dependencies, React Context based.
   Persists choice in localStorage. Falls back to English when key missing.
   Usage:
     // wrap your app:  <I18nProvider><App/></I18nProvider>
     const { t, lang, setLang, langs } = useI18n();
     <button>{t("common.export")}</button>
   ────────────────────────────────────────────────────────────────────────── */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import en from "./locales/en";
import ptBR from "./locales/pt-BR";
import es from "./locales/es";

export type LangCode = "en" | "pt-BR" | "es";

export interface LangMeta { code: LangCode; label: string; flag: string; }

export const LANGS: LangMeta[] = [
  { code: "en",    label: "English",            flag: "🇺🇸" },
  { code: "pt-BR", label: "Português (Brasil)", flag: "🇧🇷" },
  { code: "es",    label: "Español",            flag: "🇪🇸" },
];

type Dict = Record<string, any>;
const DICTS: Record<LangCode, Dict> = { en, "pt-BR": ptBR, es };

const STORAGE_KEY = "cts.lang";

function detectInitialLang(): LangCode {
  if (typeof window === "undefined") return "en";
  const saved = window.localStorage?.getItem(STORAGE_KEY) as LangCode | null;
  if (saved && DICTS[saved]) return saved;
  const nav = (window.navigator?.language || "en").toLowerCase();
  if (nav.startsWith("pt")) return "pt-BR";
  if (nav.startsWith("es")) return "es";
  return "en";
}

// Resolve a dotted key path against a dict
function lookup(dict: Dict, key: string): string | undefined {
  const parts = key.split(".");
  let cur: any = dict;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

// Substitute {placeholders} from the params object
function interpolate(str: string, params?: Record<string, string | number>): string {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`));
}

export type Translator = (key: string, params?: Record<string, string | number>) => string;

interface I18nCtx {
  lang: LangCode;
  setLang: (l: LangCode) => void;
  langs: LangMeta[];
  t: Translator;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(detectInitialLang);

  useEffect(() => {
    try { window.localStorage?.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
    document.documentElement.lang = lang;
  }, [lang]);

  const t: Translator = useMemo<Translator>(() => {
    return (key: string, params?: Record<string, string | number>) => {
      const dict: Dict = DICTS[lang as LangCode] ?? DICTS.en;
      const txt = lookup(dict, key) ?? lookup(DICTS.en, key) ?? key;
      return interpolate(txt, params);
    };
  }, [lang]);

  const value: I18nCtx = { lang, setLang: setLangState, langs: LANGS, t };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n must be called inside <I18nProvider>");
  return v;
}
