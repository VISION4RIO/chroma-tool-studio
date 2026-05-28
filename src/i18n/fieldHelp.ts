/* ──────────────────────────────────────────────────────────────────────────
   Field-help resolver. Uses the i18n translator (`t`) to fetch:
     • exact field help (help.fields.<name>)
     • category fallback (help.categoryFallback.<cat>)
     • enum value explanation (help.enums.<enumName>.<value>)
   ────────────────────────────────────────────────────────────────────────── */
import type { Translator } from "./index";
import type { FieldClassification } from "../utils/ritobin/analyzer";

export interface HelpEntry {
  title: string;
  what?: string;
  effect?: string;
  example?: string;
  tip?: string;
}

// Helper: try a list of keys, return first one that resolves to a real translation
function tryKey(t: Translator, key: string): string | undefined {
  const v = t(key);
  // Convention: if translator returns the key itself, it means missing.
  return v === key ? undefined : v;
}

export function resolveFieldHelp(
  t: Translator,
  fieldName: string,
  classification?: FieldClassification
): HelpEntry {
  // 1) try exact field name
  const baseField = `help.fields.${fieldName}`;
  const title  = tryKey(t, `${baseField}.title`);
  if (title) {
    return {
      title,
      what:    tryKey(t, `${baseField}.what`),
      effect:  tryKey(t, `${baseField}.effect`),
      example: tryKey(t, `${baseField}.example`),
      tip:     tryKey(t, `${baseField}.tip`),
    };
  }

  // 2) fallback to category
  const cat = classification?.category || "other";
  const baseCat = `help.categoryFallback.${cat}`;
  const catTitle = tryKey(t, `${baseCat}.title`);
  if (catTitle) {
    return {
      title:   catTitle,
      what:    tryKey(t, `${baseCat}.what`),
      effect:  tryKey(t, `${baseCat}.effect`),
      example: tryKey(t, `${baseCat}.example`),
      tip:     tryKey(t, `${baseCat}.tip`),
    };
  }

  // 3) ultimate fallback
  return { title: fieldName };
}

export function resolveEnumHelp(t: Translator, enumName: string, value: string | number): string | undefined {
  const key = `help.enums.${enumName}.${value}`;
  return tryKey(t, key);
}

export function resolveLabel(t: Translator, ns: "abilities" | "categories", key: string): string {
  const v = tryKey(t, `${ns}.${key}`);
  return v ?? key;
}
