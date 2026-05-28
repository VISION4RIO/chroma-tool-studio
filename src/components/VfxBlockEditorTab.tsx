import { useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { HelpButton } from "./HelpButton";
import { parse, serialize } from "../utils/ritobin/parser";
import {
  buildCatalog,
  getColorKeyframes, setColorKeyframe, addColorKeyframe, removeColorKeyframe,
  setValueColor, setValueFloat, setValueVector, setString, setBool, scaleBlockSizes,
} from "../utils/ritobin/analyzer";
import type { Catalog, BlockInfo, EditableField, CatalogSource } from "../utils/ritobin/analyzer";

/* ───────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                  */
/* ───────────────────────────────────────────────────────────────────────── */
const ABILITY_DOT: Record<string, string> = {
  Q: "bg-blue-500", W: "bg-emerald-500", E: "bg-purple-500", R: "bg-orange-500",
  Passive: "bg-amber-400", BasicAttack: "bg-slate-500", Recall: "bg-cyan-400",
  Emote: "bg-pink-500", Death: "bg-red-600", Other: "bg-slate-600",
};

const ALL_GROUPS = [
  "all","color","scale","lifetime","rate","velocity","position","rotation",
  "uv","texture","asset","rendering","alpha","erosion","distortion","reflection",
  "weight","flag","audio","other",
] as const;

function rgbaToHex(rgba: number[]) {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round((x || 0) * 255)));
  const [r,g,b] = [c(rgba[0]||0), c(rgba[1]||0), c(rgba[2]||0)];
  return "#" + [r,g,b].map(x => x.toString(16).padStart(2,"0")).join("");
}
function hexToRgba(hex: string, a = 1): number[] {
  const h = hex.replace("#","");
  return [
    parseInt(h.slice(0,2),16)/255,
    parseInt(h.slice(2,4),16)/255,
    parseInt(h.slice(4,6),16)/255,
    a,
  ];
}
function readColor(f: EditableField): number[] {
  const v = f.valueRef.value;
  if (v.kind === "object" && v.className === "ValueColor") {
    const cv = (v.fields.kind === "fields") ? v.fields.entries.find(e => e.name === "constantValue") : null;
    if (cv && cv.value.kind === "brace" && cv.value.value.kind === "list") {
      const arr = cv.value.value.items.map((it:any) => parseFloat(it.value) || 0);
      while (arr.length < 4) arr.push(1);
      return arr;
    }
  }
  return [1,1,1,1];
}
function readVector(f: EditableField): number[] {
  const v = f.valueRef.value;
  if (v.kind === "object" && v.className?.startsWith("ValueVector")) {
    const cv = (v.fields.kind === "fields") ? v.fields.entries.find(e => e.name === "constantValue") : null;
    if (cv && cv.value.kind === "brace" && cv.value.value.kind === "list") {
      return cv.value.value.items.map((it:any) => parseFloat(it.value) || 0);
    }
  }
  if (v.kind === "brace" && v.value.kind === "list") {
    return v.value.items.map((it:any) => parseFloat(it.value) || 0);
  }
  return [0,0,0];
}
function readFloat(f: EditableField): number {
  const v = f.valueRef.value;
  if (v.kind === "object" && v.className === "ValueFloat") {
    const cv = (v.fields.kind === "fields") ? v.fields.entries.find(e => e.name === "constantValue") : null;
    if (cv && cv.value.kind === "number") return parseFloat(cv.value.value) || 0;
  }
  if (f.type === "option[f32]" && v.kind === "brace" && v.value.kind === "list" && v.value.items[0]) {
    return parseFloat((v.value.items[0] as any).value) || 0;
  }
  if (v.kind === "number") return parseFloat(v.value) || 0;
  return 0;
}

/* ───────────────────────────────────────────────────────────────────────── */
/*  Main component                                                           */
/* ───────────────────────────────────────────────────────────────────────── */
interface LoadedSource extends CatalogSource { modified: boolean; }

export function VfxBlockEditorTab() {
  const { t } = useI18n();
  const [sources, setSources] = useState<LoadedSource[]>([]);
  const [filterAbility, setFilterAbility] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [group, setGroup] = useState<string>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0); // force re-render after mutating AST
  const [toast, setToast] = useState<string | null>(null);
  const [kfEditor, setKfEditor] = useState<{ field: EditableField; blockId: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const catalog: Catalog = useMemo(() => buildCatalog(sources), [sources, tick]);
  const block = useMemo(() => catalog.blocks.find((b: BlockInfo) => b.id === selectedBlockId) || null,
                        [catalog, selectedBlockId]);
  const modifiedCount = sources.filter((s: LoadedSource) => s.modified).length;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }
  function markModified(b: BlockInfo) {
    setSources((prev: LoadedSource[]) => prev.map((s: LoadedSource, i: number) => i === b.sourceIndex && !s.modified ? { ...s, modified: true } : s));
    setTick((x: number) => x + 1);
  }
  function force() { setTick((x: number) => x + 1); }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    const next: LoadedSource[] = [];
    let ok = 0, err = 0;
    for (const f of list) {
      try {
        const text = await f.text();
        const ast = parse(text);
        next.push({ name: f.name, sourceText: text, ast, modified: false });
        ok++;
      } catch (e) { console.error(e); err++; }
    }
    setSources((prev: LoadedSource[]) => [...prev, ...next]);
    showToast(err === 0 ? t("blockEditor.loadedFiles", { n: ok }) : t("blockEditor.loadedFilesErr", { ok, err }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function exportModified() {
    if (modifiedCount === 0) { showToast(t("blockEditor.exportNothing")); return; }
    sources.forEach((s: LoadedSource) => {
      if (!s.modified) return;
      const text = serialize(s.ast);
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = s.name.replace(/\.txt$/i, ".py");
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
    });
    showToast(t("blockEditor.exportApplied", { n: modifiedCount }));
  }

  function removeSource(idx: number) {
    setSources((prev: LoadedSource[]) => prev.filter((_: LoadedSource, i: number) => i !== idx));
    setSelectedBlockId(null);
  }

  const filteredBlocks = useMemo(() => {
    const q = search.toLowerCase();
    return catalog.blocks.filter(b => {
      if (filterAbility !== "All" && b.ability !== filterAbility) return false;
      if (q && !(b.displayName.toLowerCase().includes(q) || b.key.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [catalog, filterAbility, search]);

  const abilityCounts = useMemo(() => {
    const m: Record<string, number> = {};
    catalog.blocks.forEach(b => { m[b.ability] = (m[b.ability] || 0) + 1; });
    return m;
  }, [catalog]);

  /* ─── Render ─────────────────────────────────────────────────────── */
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 overflow-hidden text-zinc-100">
      {/* LEFT — file loader + block list */}
      <aside className="flex w-[340px] min-w-0 flex-col overflow-hidden border-r border-white/10 bg-zinc-950/50">

        {/* Drop zone */}
        <div className="border-b border-white/10 p-2">
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("ring-2","ring-cyan-400"); }}
            onDragLeave={(e) => e.currentTarget.classList.remove("ring-2","ring-cyan-400")}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("ring-2","ring-cyan-400");
              if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
            }}
            className="cursor-pointer truncate rounded-lg border-2 border-dashed border-white/15 px-4 py-3 text-center text-xs text-zinc-400 transition hover:border-cyan-400 hover:bg-cyan-400/5 hover:text-zinc-100"
          >
            {t("common.dropHere")}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".py,.txt"
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
        </div>

        {/* Loaded sources */}
        {sources.length > 0 && (
          <div className="max-h-[120px] overflow-y-auto border-b border-white/10 px-2 pb-2">
            {sources.map((s: LoadedSource, i: number) => {
              const n = catalog.blocks.filter(b => b.sourceIndex === i).length;
              return (
                <div key={i} className="mt-1 flex min-w-0 items-center gap-2 rounded bg-white/5 px-2 py-1 text-[11px]">
                  {s.modified && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-amber-400" title={t("common.modified")} />}
                  <span className="flex-1 min-w-0 truncate" title={s.name}>{s.name}</span>
                  <span className="flex-shrink-0 tabular-nums text-zinc-400">{n}</span>
                  <button
                    onClick={() => removeSource(i)}
                    className="flex-shrink-0 px-1 text-zinc-500 hover:text-red-400"
                    aria-label={t("common.remove")}
                  >×</button>
                </div>
              );
            })}
          </div>
        )}

        {/* Search */}
        <div className="border-b border-white/10 p-2">
          <input
            type="search"
            placeholder={t("common.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-400"
          />
        </div>

        {/* Ability chips */}
        {catalog.blocks.length > 0 && (
          <div className="flex max-h-[90px] flex-wrap gap-1 overflow-y-auto border-b border-white/10 px-2 py-2">
            {["All", ...Object.keys(abilityCounts).sort()].map(a => {
              const isOn = filterAbility === a;
              const cnt = a === "All" ? catalog.blocks.length : abilityCounts[a];
              return (
                <button
                  key={a}
                  onClick={() => setFilterAbility(a)}
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition ${
                    isOn ? "border-cyan-400 bg-white/10 text-zinc-100" : "border-white/15 bg-white/5 text-zinc-400 hover:text-zinc-100"
                  }`}
                >
                  {a !== "All" && <span className={`h-2 w-2 rounded-full ${ABILITY_DOT[a] || "bg-slate-500"}`} />}
                  {a === "All" ? t("common.all") : t(`abilities.${a}`)}
                  <small className="ml-0.5 opacity-60">{cnt}</small>
                </button>
              );
            })}
          </div>
        )}

        {/* Block list */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2">
          {catalog.blocks.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs italic text-zinc-500">{t("blockEditor.noBlocks")}</div>
          ) : filteredBlocks.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs italic text-zinc-500">{t("blockEditor.noMatch")}</div>
          ) : (
            <div className="flex flex-col gap-1">
              {filteredBlocks.map((b: BlockInfo) => {
                const sel = selectedBlockId === b.id;
                const stats = [];
                if (b.stats.emitterCount) stats.push(<span key="em" title="emitters">⚙ {b.stats.emitterCount}</span>);
                if (b.stats.colors)       stats.push(<span key="co" title="colors">🎨 {b.stats.colors}</span>);
                if (b.stats.scales)       stats.push(<span key="sc" title="sizes">↔ {b.stats.scales}</span>);
                if (b.stats.textures)     stats.push(<span key="tx" title="textures">🖼 {b.stats.textures}</span>);
                return (
                  <div
                    key={b.id}
                    onClick={() => setSelectedBlockId(b.id)}
                    className={`flex min-w-0 cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 transition ${
                      sel ? "border-cyan-400 bg-white/10" : "border-transparent bg-white/5 hover:border-white/10 hover:bg-white/10"
                    }`}
                  >
                    <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${ABILITY_DOT[b.ability] || "bg-slate-500"}`} />
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="truncate text-sm font-semibold text-zinc-100" title={b.displayName}>{b.displayName}</div>
                      {stats.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-zinc-400">{stats}</div>
                      )}
                      <div className="mt-0.5 truncate text-[10px] text-zinc-500" title={b.sourceName}>{b.sourceName}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* RIGHT — editor */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header row with export */}
        <div className="flex items-center gap-3 border-b border-white/10 bg-zinc-950/30 px-4 py-2">
          <span className="text-[11px] tabular-nums text-zinc-400">{sources.length} {t("common.sources")}</span>
          <span className="text-[11px] tabular-nums text-zinc-400">{catalog.blocks.length} {t("common.blocks")}</span>
          <span className="text-[11px] tabular-nums text-zinc-400">{modifiedCount} {t("common.modified")}</span>
          <span className="flex-1" />
          <button
            onClick={exportModified}
            disabled={modifiedCount === 0}
            className="h-8 rounded-lg bg-cyan-400 px-3 text-sm font-semibold text-zinc-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ⬇ {t("common.export")}
          </button>
        </div>

        {/* Empty state */}
        {!block && (
          <div className="flex flex-1 items-center justify-center px-8 text-center text-zinc-500">
            <div>
              <div className="text-sm italic">{t("blockEditor.rightPanelEmpty")}</div>
              <div className="mt-2 text-xs opacity-70">{t("blockEditor.rightPanelHint")}</div>
            </div>
          </div>
        )}

        {/* Block editor */}
        {block && <BlockEditor
          key={block.id}
          block={block}
          group={group}
          setGroup={setGroup}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          markModified={markModified}
          force={force}
          showToast={showToast}
          openKfEditor={(f) => setKfEditor({ field: f, blockId: block.id })}
        />}
      </main>

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed bottom-5 right-5 z-[2500] max-w-[60vw] truncate rounded-lg border border-white/20 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 shadow-2xl">
          {toast}
        </div>
      )}

      {/* Keyframe modal */}
      {kfEditor && (
        <KeyframeEditor
          field={kfEditor.field}
          onClose={() => setKfEditor(null)}
          onChange={() => {
            const b = catalog.blocks.find(bl => bl.id === kfEditor.blockId);
            if (b) markModified(b);
          }}
        />
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────── */
/*  Block editor (right panel content when a block is selected)              */
/* ───────────────────────────────────────────────────────────────────────── */
interface BEProps {
  block: BlockInfo;
  group: string;
  setGroup: (g: string) => void;
  collapsed: Set<string>;
  setCollapsed: (s: Set<string>) => void;
  markModified: (b: BlockInfo) => void;
  force: () => void;
  showToast: (m: string) => void;
  openKfEditor: (f: EditableField) => void;
}
function BlockEditor({ block, group, setGroup, collapsed, setCollapsed, markModified, force, showToast, openKfEditor }: BEProps) {
  const { t } = useI18n();
  const [quickColor, setQuickColor] = useState("#9b87f5");
  const [quickScale, setQuickScale] = useState("1.0");

  const presentGroups = useMemo(() => {
    const set = new Set<string>(["all"]);
    block.emitters.forEach(e => e.fields.forEach(f => set.add(f.classification.category)));
    block.topFields.forEach(f => set.add(f.classification.category));
    return ALL_GROUPS.filter((g: string) => set.has(g));
  }, [block]);

  function applyRecolor() {
    const rgba = hexToRgba(quickColor, 1);
    let n = 0;
    block.emitters.forEach(em => em.fields.forEach(f => {
      if (f.classification.category === "color" && f.classification.subtype === "valueColor") {
        if (setValueColor(f, rgba)) n++;
      }
    }));
    if (n > 0) markModified(block);
    showToast(n > 0
      ? t("blockEditor.quickRecolorApplied", { n })
      : t("blockEditor.quickRecolorNothing"));
  }
  function applyScale() {
    const f = parseFloat(quickScale) || 1;
    const n = scaleBlockSizes(block, f);
    if (n > 0) markModified(block);
    showToast(n > 0
      ? t("blockEditor.quickScaleApplied", { n, f })
      : t("blockEditor.quickScaleNothing"));
  }

  return (
    <>
      {/* Block header */}
      <div className="min-w-0 overflow-hidden border-b border-white/10 bg-zinc-950/40 px-4 py-3">
        <div className="truncate text-base font-semibold text-zinc-100" title={block.displayName}>
          {block.displayName}
        </div>
        <div className="truncate font-mono text-[11px] text-zinc-500" title={block.key}>{block.key}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px]`}>
            <span className={`h-2 w-2 rounded-full ${ABILITY_DOT[block.ability] || "bg-slate-500"}`} />
            {t(`abilities.${block.ability}`)}
          </span>
          <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-zinc-300">{block.kind}</span>
          <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-zinc-300">
            {block.emitters.length} {block.emitters.length === 1 ? t("common.emitter") : t("common.emitters")}
          </span>
          <span className="truncate rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-zinc-400" title={block.sourceName}>
            📄 {block.sourceName}
          </span>
        </div>
      </div>

      {/* Quick actions toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-zinc-950/30 px-4 py-2 text-xs">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">{t("blockEditor.quickRecolor")}</span>
        <input type="color" value={quickColor} onChange={(e) => setQuickColor(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-white/15 bg-transparent" />
        <button onClick={applyRecolor} className="h-7 rounded border border-white/15 bg-white/5 px-2 text-xs text-zinc-100 transition hover:bg-white/10">{t("common.apply")}</button>
        <HelpButton custom={{
          title: t("blockEditor.quickRecolor"),
          what: t("blockEditor.quickRecolorHelp"),
        }} />
        <span className="flex-1" />
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">{t("blockEditor.quickScale")}</span>
        <input type="number" value={quickScale} onChange={(e) => setQuickScale(e.target.value)} step="0.1" min="0.05" className="h-7 w-16 rounded border border-white/15 bg-zinc-900 px-2 text-xs text-zinc-100" />
        <button onClick={applyScale} className="h-7 rounded border border-white/15 bg-white/5 px-2 text-xs text-zinc-100 transition hover:bg-white/10">{t("common.apply")}</button>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1 border-b border-white/10 bg-zinc-950/30 px-4 py-2">
        {presentGroups.map((g: string) => (
          <button
            key={g}
            onClick={() => setGroup(g)}
            className={`rounded px-2 py-1 text-[11px] transition ${
              group === g ? "border border-white/15 bg-white/10 text-zinc-100" : "text-zinc-400 hover:text-zinc-100"
            }`}
          >
            {t(`categories.${g}`)}
          </button>
        ))}
      </div>

      {/* Emitters */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
        {block.topFields.length > 0 && (
          <EmitterSection
            key="__top__"
            title="(top-level)"
            blockId={block.id}
            sectionKey="top"
            fields={block.topFields}
            group={group}
            collapsed={collapsed}
            setCollapsed={setCollapsed}
            markModified={() => markModified(block)}
            force={force}
            openKfEditor={openKfEditor}
          />
        )}
        {block.emitters.map(em => (
          <EmitterSection
            key={em.index}
            title={em.primitiveKind ? `${em.name}  ·  ${em.primitiveKind}` : em.name}
            blockId={block.id}
            sectionKey={String(em.index)}
            fields={em.fields}
            group={group}
            collapsed={collapsed}
            setCollapsed={setCollapsed}
            markModified={() => markModified(block)}
            force={force}
            openKfEditor={openKfEditor}
          />
        ))}
      </div>
    </>
  );
}

/* ───────────────────────────────────────────────────────────────────────── */
/*  Emitter section                                                          */
/* ───────────────────────────────────────────────────────────────────────── */
interface ESProps {
  title: string;
  blockId: string;
  sectionKey: string;
  fields: EditableField[];
  group: string;
  collapsed: Set<string>;
  setCollapsed: (s: Set<string>) => void;
  markModified: () => void;
  force: () => void;
  openKfEditor: (f: EditableField) => void;
}
function EmitterSection({ title, blockId, sectionKey, fields, group, collapsed, setCollapsed, markModified, force, openKfEditor }: ESProps) {
  const { t } = useI18n();
  const key = `${blockId}:${sectionKey}`;
  const isCol = collapsed.has(key);
  const visible = fields.filter(f => group === "all" || f.classification.category === group);

  function toggle() {
    const n = new Set(collapsed);
    if (n.has(key)) n.delete(key); else n.add(key);
    setCollapsed(n);
  }

  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-white/10 bg-zinc-950/50">
      <div onClick={toggle} className="flex cursor-pointer items-center gap-2 border-b border-white/10 bg-zinc-900/50 px-4 py-2 text-xs font-semibold text-zinc-100 hover:bg-white/5">
        <span className={`text-[10px] text-zinc-400 transition ${isCol ? "rotate-[-90deg]" : ""}`}>▼</span>
        <span className="min-w-0 flex-1 truncate" title={title}>{title}</span>
        <span className="flex-shrink-0 text-[11px] font-normal text-zinc-400">
          {visible.length}{group !== "all" ? `/${fields.length}` : ""} {t("common.fields")}
        </span>
      </div>
      {!isCol && (
        <div className="px-3 py-2">
          {visible.length === 0 ? (
            <div className="px-2 py-3 text-center text-[11px] text-zinc-500">— No fields in this category —</div>
          ) : visible.map(f => (
            <FieldRow
              key={f.name + ":" + f.path.join(".")}
              field={f}
              markModified={markModified}
              force={force}
              openKfEditor={openKfEditor}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────── */
/*  Field row                                                                */
/* ───────────────────────────────────────────────────────────────────────── */
interface FRProps {
  field: EditableField;
  markModified: () => void;
  force: () => void;
  openKfEditor: (f: EditableField) => void;
}
function FieldRow({ field, markModified, force, openKfEditor }: FRProps) {
  const { t } = useI18n();
  const c = field.classification;

  function onColor(hex: string) {
    const cur = readColor(field);
    setValueColor(field, hexToRgba(hex, cur[3]));
    markModified();
  }
  function onAlpha(a: number) {
    const cur = readColor(field);
    setValueColor(field, [cur[0], cur[1], cur[2], a]);
    markModified();
  }
  function onFloat(v: number) { setValueFloat(field, v); markModified(); }
  function onVec(i: number, v: number) {
    const cur = readVector(field); cur[i] = v;
    setValueVector(field, cur); markModified();
  }
  function onString(s: string) { setString(field, s); markModified(); }
  function onBool(b: boolean) { setBool(field, b); markModified(); }
  function onEnum(v: string) { (field.valueRef.value as any).value = v; markModified(); }

  let ctrl: React.ReactNode = null;

  if (c.editor === "color") {
    const v = readColor(field);
    const kf = getColorKeyframes(field);
    ctrl = (
      <>
        <input type="color" value={rgbaToHex(v)} onChange={(e) => onColor(e.target.value)}
               className="h-7 w-9 cursor-pointer rounded border border-white/15 bg-transparent" />
        <input type="number" value={v[3].toFixed(2)} min={0} max={1} step={0.05}
               onChange={(e) => onAlpha(parseFloat(e.target.value) || 0)}
               className="w-16 rounded border border-white/15 bg-zinc-900 px-2 py-1 text-xs"
               title="alpha (0..1)" />
        <small className="truncate text-[10px] text-zinc-500">({v.map(x => x.toFixed(2)).join(", ")})</small>
        {kf && (
          <button type="button"
                  onClick={() => openKfEditor(field)}
                  className="cursor-pointer text-[10px] text-amber-400 underline hover:text-amber-300">
            {t("blockEditor.animatedHint", { n: kf.times.length })}
          </button>
        )}
      </>
    );
  } else if (c.editor === "enum") {
    const cur = String((field.valueRef.value as any).value);
    const curLabel = c.enum?.[cur] || "";
    ctrl = (
      <>
        <select value={cur} onChange={(e) => onEnum(e.target.value)}
                className="rounded border border-white/15 bg-zinc-900 px-2 py-1 text-xs text-zinc-100">
          {c.enum && Object.entries(c.enum).map(([k, lbl]) => (
            <option key={k} value={k}>{k} — {lbl}</option>
          ))}
        </select>
        {c.enumName && (
          <HelpButton enumName={c.enumName} enumValue={cur} enumValueLabel={curLabel} variant="enum" />
        )}
        <small className="text-[10px] text-zinc-500">{field.type}</small>
      </>
    );
  } else if (c.editor === "float") {
    const cur = readFloat(field);
    const max = cur > 1 ? Math.max(cur * 3, 5) : 5;
    const min = cur < 0 ? cur * 2 : 0;
    ctrl = (
      <>
        <input type="number" value={cur} step={0.1}
               onChange={(e) => onFloat(parseFloat(e.target.value) || 0)}
               className="w-20 rounded border border-white/15 bg-zinc-900 px-2 py-1 text-xs" />
        <input type="range" value={cur} min={min} max={max} step={0.01}
               onChange={(e) => onFloat(parseFloat(e.target.value))}
               className="min-w-[80px] flex-1 accent-cyan-400" />
        <small className="text-[10px] text-zinc-500">{field.type}</small>
      </>
    );
  } else if (c.editor === "vector") {
    const v = readVector(field);
    ctrl = (
      <div className="flex flex-wrap gap-1">
        {v.map((x, i) => (
          <input key={i} type="number" value={x} step={0.1}
                 onChange={(e) => onVec(i, parseFloat(e.target.value) || 0)}
                 className="w-16 rounded border border-white/15 bg-zinc-900 px-2 py-1 text-xs" />
        ))}
      </div>
    );
  } else if (c.editor === "string") {
    ctrl = (
      <input type="text" value={(field.valueRef.value as any).value || ""}
             onChange={(e) => onString(e.target.value)}
             className="min-w-0 flex-1 rounded border border-white/15 bg-zinc-900 px-2 py-1 text-xs" />
    );
  } else if (c.editor === "bool") {
    ctrl = (
      <input type="checkbox" checked={!!(field.valueRef.value as any).value}
             onChange={(e) => onBool(e.target.checked)}
             className="h-4 w-4 accent-cyan-400" />
    );
  } else if (c.editor === "int") {
    ctrl = (
      <input type="number" value={(field.valueRef.value as any).value}
             onChange={(e) => { (field.valueRef.value as any).value = e.target.value; markModified(); force(); }}
             step={1}
             className="w-20 rounded border border-white/15 bg-zinc-900 px-2 py-1 text-xs" />
    );
  }

  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-2 border-b border-white/5 py-1.5 last:border-b-0">
      <div className="flex min-w-0 items-center truncate text-[11px] text-zinc-400" title={field.label}>
        <span className="truncate">{field.label}</span>
        <HelpButton fieldName={field.name} classification={c} />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">{ctrl}</div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────── */
/*  Keyframe editor modal                                                    */
/* ───────────────────────────────────────────────────────────────────────── */
interface KFProps { field: EditableField; onClose: () => void; onChange: () => void; }
function KeyframeEditor({ field, onClose, onChange }: KFProps) {
  const { t } = useI18n();
  const [, setTick] = useState(0);
  const kf = getColorKeyframes(field);
  if (!kf) return null;
  const force = () => { setTick((x: number) => x + 1); onChange(); };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-white/15 bg-zinc-900 shadow-2xl"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-white/10 bg-zinc-950 px-5 py-3">
          <strong className="flex-1 text-sm text-cyan-300">🎨 {t("blockEditor.keyframeEditor.title", { label: field.label })}</strong>
          <button onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100">✕</button>
        </div>
        <div className="border-b border-white/10 px-5 py-2 text-[11px] text-zinc-400">
          {t("blockEditor.keyframeEditor.hint")}
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-5 py-3">
          {kf.times.map((time, i) => {
            const rgba = kf.values[i] || [1,1,1,1];
            while (rgba.length < 4) rgba.push(1);
            const hex = rgbaToHex(rgba);
            return (
              <div key={i} className="grid grid-cols-[60px_36px_30px_60px_60px_60px_60px_30px] items-center gap-1.5 border-b border-white/5 py-1.5 last:border-b-0">
                <input type="number" value={time} step={0.05} min={0} max={1}
                       onChange={(e) => { setColorKeyframe(field, i, parseFloat(e.target.value) || 0, rgba); force(); }}
                       className="rounded border border-white/15 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-100" />
                <input type="color" value={hex}
                       onChange={(e) => { const rgb = hexToRgba(e.target.value, rgba[3]); setColorKeyframe(field, i, time, [rgb[0],rgb[1],rgb[2],rgba[3]]); force(); }}
                       className="h-7 cursor-pointer rounded border border-white/15 bg-transparent" />
                <small className="text-center text-[10px] text-zinc-400">α</small>
                <input type="number" value={rgba[3].toFixed(3)} step={0.05} min={0} max={1}
                       onChange={(e) => { setColorKeyframe(field, i, time, [rgba[0],rgba[1],rgba[2], parseFloat(e.target.value) || 0]); force(); }}
                       className="rounded border border-white/15 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-100" />
                {(["r","g","b"] as const).map((ch, idx) => (
                  <input key={ch} type="number" value={rgba[idx].toFixed(3)} step={0.05} min={0}
                         onChange={(e) => { const arr = [...rgba]; arr[idx] = parseFloat(e.target.value) || 0; setColorKeyframe(field, i, time, arr); force(); }}
                         className="rounded border border-white/15 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-100" title={ch} />
                ))}
                <button onClick={() => { if (removeColorKeyframe(field, i)) force(); }}
                        className="rounded border border-red-300/30 bg-red-400/10 px-1 text-xs text-red-200 transition hover:bg-red-400/20">×</button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 border-t border-white/10 bg-zinc-950 px-5 py-3">
          <button onClick={() => { addColorKeyframe(field, 0.5, [1,1,1,1]); force(); }}
                  className="rounded border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-zinc-100 transition hover:bg-white/10">
            {t("blockEditor.keyframeEditor.addAt")}
          </button>
          <span className="flex-1" />
          <span className="text-[11px] text-zinc-400">{t("blockEditor.keyframeEditor.keyframesCount", { n: kf.times.length })}</span>
        </div>
      </div>
    </div>
  );
}
