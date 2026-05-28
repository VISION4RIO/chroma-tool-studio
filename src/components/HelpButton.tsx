import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { resolveFieldHelp, resolveEnumHelp } from "../i18n/fieldHelp";
import type { FieldClassification } from "../utils/ritobin/analyzer";

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
  const [pos, setPos] = useState<{ top: number; left: number; visible: boolean }>({ top: 0, left: 0, visible: false });
  const wrapRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  function clearTimers() {
    if (showTimer.current) { window.clearTimeout(showTimer.current); showTimer.current = null; }
    if (hideTimer.current) { window.clearTimeout(hideTimer.current); hideTimer.current = null; }
  }

  function handleEnter() {
    clearTimers();
    showTimer.current = window.setTimeout(() => {
      setPos((p) => ({ ...p, visible: false }));
      setOpen(true);
    }, 150);
  }
  function handleLeave() {
    clearTimers();
    hideTimer.current = window.setTimeout(() => setOpen(false), 200);
  }
  function handlePopEnter() { clearTimers(); }
  function handlePopLeave() {
    clearTimers();
    hideTimer.current = window.setTimeout(() => setOpen(false), 100);
  }

  // Measure popup AFTER render and reposition with actual size.
  useLayoutEffect(() => {
    if (!open || !popRef.current || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const popRect = popRef.current.getBoundingClientRect();
    const pw = popRect.width;
    const ph = popRect.height;
    const gap = 8;
    const margin = 10;
    let top = r.bottom + gap;
    let left = r.left;
    // flip up if no room below
    if (top + ph > window.innerHeight - margin) {
      const altTop = r.top - ph - gap;
      if (altTop >= margin) top = altTop;
      else top = Math.max(margin, window.innerHeight - ph - margin);
    }
    // clamp horizontally with real width
    if (left + pw > window.innerWidth - margin) left = window.innerWidth - pw - margin;
    if (left < margin) left = margin;
    setPos({ top, left, visible: true });
  }, [open]);

  useEffect(() => {
    function onScroll() { if (open) setOpen(false); }
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      clearTimers();
    };
  }, [open]);

  let title = "?"; let what, effect, example, tip;
  if (props.custom) { title = props.custom.title; what = props.custom.what; effect = props.custom.effect; example = props.custom.example; tip = props.custom.tip; }
  else if (props.enumName != null && props.enumValue != null) {
    title = `${props.enumName} = ${props.enumValue}${props.enumValueLabel ? ` (${props.enumValueLabel})` : ""}`;
    what = resolveEnumHelp(t, props.enumName, props.enumValue);
  } else if (props.fieldName) {
    const h = resolveFieldHelp(t, props.fieldName, props.classification);
    title = h.title; what = h.what; effect = h.effect; example = h.example; tip = h.tip;
  }
  const isEnum = props.variant === "enum" || props.enumName != null;

  return (
    <>
      <span
        ref={wrapRef}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onFocus={handleEnter}
        onBlur={handleLeave}
        tabIndex={0}
        className={`ml-1 inline-flex h-[14px] w-[14px] flex-shrink-0 cursor-help select-none items-center justify-center rounded-full border text-[10px] font-semibold leading-none transition ${
          isEnum
            ? "border-dashed border-zinc-500 text-zinc-400 hover:border-cyan-400 hover:bg-cyan-400 hover:text-zinc-950"
            : "border-zinc-600 text-zinc-400 hover:border-cyan-400 hover:bg-cyan-400 hover:text-zinc-950"
        }`}
        aria-label="help"
      >?</span>
      {open && (
        <div
          ref={popRef}
          onMouseEnter={handlePopEnter}
          onMouseLeave={handlePopLeave}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            visibility: pos.visible ? "visible" : "hidden",
            zIndex: 3000,
            minWidth: "260px",
            maxWidth: "min(440px, calc(100vw - 40px))",
            width: "max-content",
            wordBreak: "normal",
            overflowWrap: "anywhere",
            whiteSpace: "normal",
            background: "#18181b",
            border: "1px solid rgba(34,211,238,0.7)",
            borderRadius: "8px",
            color: "#f4f4f5",
            fontSize: "12px",
            lineHeight: "1.5",
            boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
            overflow: "hidden",
            pointerEvents: "auto",
          }}
        >
          <div style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(9,9,11,0.8)", padding: "8px 12px" }}>
            <strong style={{ fontSize: "13px", color: "#67e8f9" }}>{title}</strong>
          </div>
          <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {what && (
              <p style={{ margin: 0 }}>
                <span style={{ marginRight: "4px", fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#71717a" }}>{t("help.labels.whatIs")}</span>
                {what}
              </p>
            )}
            {effect && (
              <p style={{ margin: 0 }}>
                <span style={{ marginRight: "4px", fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#71717a" }}>{t("help.labels.effect")}</span>
                {effect}
              </p>
            )}
            {example && (
              <div style={{ borderLeft: "2px solid #22d3ee", background: "rgba(9,9,11,0.8)", padding: "6px 8px", borderRadius: "4px", fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: "11px", color: "#6ee7b7" }}>
                💡 {example}
              </div>
            )}
            {tip && (
              <div style={{ borderLeft: "2px solid #fbbf24", background: "rgba(251,191,36,0.1)", padding: "6px 8px", borderRadius: "4px", color: "#fde68a" }}>
                ⚠️ {tip}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}