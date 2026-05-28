import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { resolveFieldHelp, resolveEnumHelp } from "../i18n/fieldHelp";
import type { FieldClassification } from "../utils/ritobin/analyzer";

/**
 * Generic "?" button next to a label. On click, opens a non-modal popup
 * positioned relative to itself. Closes on outside-click or ESC.
 *
 * Two modes:
 *   - field help:  <HelpButton fieldName="birthColor" classification={...} />
 *   - enum value:  <HelpButton enumName="blendMode" enumValue={4} />
 *   - custom:      <HelpButton custom={{ title, what, ... }} />
 */
type CustomHelp = { title: string; what?: string; effect?: string; example?: string; tip?: string };

interface Props {
  fieldName?: string;
  classification?: FieldClassification;
  enumName?: string;
  enumValue?: string | number;
  enumValueLabel?: string;
  custom?: CustomHelp;
  variant?: "field" | "enum";
}

export function HelpButton(props: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (popRef.current?.contains(target)) return;
      if (btnRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const pw = 340, ph = 220;
    let top = r.bottom + 6;
    let left = r.left;
    if (top + ph > window.innerHeight - 10) top = Math.max(10, r.top - ph - 6);
    if (left + pw > window.innerWidth - 10) left = window.innerWidth - pw - 10;
    if (left < 10) left = 10;
    setPos({ top, left });
    setOpen(true);
  }

  // Compute help payload
  let title = "?";
  let what: string | undefined;
  let effect: string | undefined;
  let example: string | undefined;
  let tip: string | undefined;

  if (props.custom) {
    title = props.custom.title;
    what  = props.custom.what;
    effect= props.custom.effect;
    example = props.custom.example;
    tip = props.custom.tip;
  } else if (props.enumName != null && props.enumValue != null) {
    const txt = resolveEnumHelp(t, props.enumName, props.enumValue);
    title = `${props.enumName} = ${props.enumValue}${props.enumValueLabel ? ` (${props.enumValueLabel})` : ""}`;
    what = txt;
  } else if (props.fieldName) {
    const h = resolveFieldHelp(t, props.fieldName, props.classification);
    title = h.title;
    what = h.what;
    effect = h.effect;
    example = h.example;
    tip = h.tip;
  }

  const isEnum = props.variant === "enum" || (props.enumName != null);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleClick}
        className={`ml-1 inline-flex h-[14px] w-[14px] flex-shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold leading-none transition ${
          isEnum
            ? "border-dashed border-zinc-500 text-zinc-400 hover:bg-cyan-400 hover:text-zinc-950 hover:border-cyan-400"
            : "border-zinc-600 text-zinc-400 hover:bg-cyan-400 hover:text-zinc-950 hover:border-cyan-400"
        }`}
        title={t("topbar.help")}
        aria-label="help"
      >
        ?
      </button>
      {open && pos && (
        <div
          ref={popRef}
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-[3000] max-w-[340px] min-w-[260px] overflow-hidden rounded-lg border border-cyan-400/70 bg-zinc-900 text-[12px] leading-[1.5] text-zinc-100 shadow-2xl"
        >
          <div className="flex items-center gap-2 border-b border-white/10 bg-zinc-950/80 px-3 py-2">
            <strong className="flex-1 text-[13px] text-cyan-300">{title}</strong>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-1 text-lg leading-none text-zinc-400 hover:text-zinc-100"
              aria-label={t("common.close")}
            >
              ×
            </button>
          </div>
          <div className="space-y-2 px-3 py-3">
            {what    && <p><span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{t("help.labels.whatIs")}</span>{what}</p>}
            {effect  && <p><span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{t("help.labels.effect")}</span>{effect}</p>}
            {example && (
              <div className="rounded border-l-2 border-cyan-400 bg-zinc-950/80 px-2 py-1.5 font-mono text-[11px] text-emerald-300">
                💡 {example}
              </div>
            )}
            {tip && (
              <div className="rounded border-l-2 border-amber-400 bg-amber-400/10 px-2 py-1.5 text-amber-200">
                ⚠️ {tip}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
