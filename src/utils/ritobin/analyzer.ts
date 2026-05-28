/* ──────────────────────────────────────────────────────────────────────────
   VFX analyzer (TypeScript) – walks parsed Ritobin AST and extracts:
     • catalog of blocks (top-level entries / emitters)
     • editable parameters per block (colors, scales, lifetimes, textures…)
   ────────────────────────────────────────────────────────────────────────── */
import type { FileNode, FieldNode, ValueNode, BodyNode, MapEntryNode } from "./parser";
import { findField, getEntries } from "./parser";

// ─── Enums (human-readable dropdowns for cryptic u8 codes) ───────────────
export const ENUMS: Record<string, Record<number | string, string>> = {
  blendMode: { 0:"Opaque", 1:"AlphaBlend", 2:"Add", 3:"Screen", 4:"Additive", 5:"Multiply", 6:"PremultipliedAlpha", 7:"SubAlpha" },
  distortionMode: { 0:"Refract", 1:"Screen", 2:"NormalMap" },
  uvMode: { 0:"Standard", 1:"Stretch", 2:"Scroll", 3:"Random", 4:"Spritesheet" },
  meshRenderFlags: { 0:"None", 1:"NoCullBackface", 2:"DoubleSided" },
  miscRenderFlags: { 0:"None", 1:"Glow", 2:"NoLighting" },
  colorLookUpTypeY: { 0:"Lifetime", 1:"Random", 2:"Speed", 3:"Distance" },
};

export type FieldCategory =
  | "color" | "scale" | "lifetime" | "rate" | "velocity" | "rotation" | "position"
  | "uv" | "texture" | "asset" | "rendering" | "alpha" | "erosion" | "distortion"
  | "reflection" | "weight" | "flag" | "audio" | "other";

export type FieldEditor = "color" | "float" | "vector" | "string" | "bool" | "int" | "enum";

export interface FieldClassification {
  category: FieldCategory;
  editor: FieldEditor;
  subtype?: string;
  dim?: 2 | 3;
  enum?: Record<number | string, string>;
  enumName?: string;
}

export interface EditableField {
  path: (string | number)[];
  name: string;
  label: string;
  type: string;
  valueRef: FieldNode;
  classification: FieldClassification;
  preview: string;
}

export interface EmitterInfo {
  index: number;
  name: string;
  node: ValueNode;
  className: string;
  primitiveKind: string | null; // "ArbitraryQuad", "Mesh", "Trail", etc.
  fields: EditableField[];
}

export interface BlockInfo {
  id: string;
  sourceIndex: number;
  sourceName: string;
  key: string;
  kind: string;
  displayName: string;
  ability: string;
  emitters: EmitterInfo[];
  topFields: EditableField[];
  entryRef: MapEntryNode;
  stats: { colors: number; scales: number; textures: number; emitterCount: number };
}

export interface CatalogSource { name: string; ast: FileNode; sourceText?: string; }

export interface Catalog {
  blocks: BlockInfo[];
  byKey: Record<string, BlockInfo>;
  sources: CatalogSource[];
}

// ─── Category classifier ─────────────────────────────────────────────────
export function categorize(name: string): FieldCategory {
  const n = name.toLowerCase();
  if (/color|tint|fresnel/.test(n))                                 return "color";
  if (/erosion/.test(n))                                            return "erosion";
  if (/distortion|distort/.test(n))                                 return "distortion";
  if (/reflection|reflect/.test(n))                                 return "reflection";
  if (/scale|size|width|radius/.test(n))                            return "scale";
  if (/velocity|drag|acceleration|orbital/.test(n))                 return "velocity";
  if (/rotation|rotate|spin/.test(n))                               return "rotation";
  if (/position|offset|emitoffset/.test(n))                         return "position";
  if (/lifetime|linger|duration|timebefore/.test(n))                return "lifetime";
  if (/rate|emission|spawn|emit(?!offset|rotation)/.test(n))        return "rate";
  if (/weight|bindweight/.test(n))                                  return "weight";
  if (/^uv|uvscale|uvscroll|uvrotation|uvoffset|texdiv|numframes|framerate|sprite/.test(n)) return "uv";
  if (/texture|normalmap|colortexture|colorramp|map$/.test(n))      return "texture";
  if (/mesh|simplemesh|skeleton|skin|anm$/.test(n))                 return "asset";
  if (/blend|^pass$|alpharef|depthbias|disablebackface|isgroundlayer|navmesh/.test(n)) return "rendering";
  if (/alpha|opacity|fresnel|softparticle|deltain/.test(n))         return "alpha";
  if (/^is[A-Z]|^has[A-Z]|^use[A-Z]|^disable[A-Z]|flag/i.test(name)) return "flag";
  return "other";
}

export function classifyField(name: string, typeSig: string, value: ValueNode | undefined | null): FieldClassification | null {
  const cat = categorize(name);

  // Color
  if (value && value.kind === "object" && value.className === "ValueColor") {
    return { category: "color", editor: "color", subtype: "valueColor" };
  }
  if (typeSig === "rgba") return { category: "color", editor: "color", subtype: "rgba" };
  if (typeSig === "vec4" && /color|tint|fresnel/i.test(name))
    return { category: "color", editor: "color", subtype: "vec4" };

  // Value wrappers
  if (value && value.kind === "object" && value.className === "ValueFloat")
    return { category: cat, editor: "float", subtype: "valueFloat" };
  if (value && value.kind === "object" && (value.className === "ValueVector3" || value.className === "ValueVector2")) {
    const dim: 2 | 3 = value.className === "ValueVector3" ? 3 : 2;
    return { category: cat, editor: "vector", dim, subtype: value.className };
  }

  if (typeSig === "option[f32]" || typeSig === "option[i32]")
    return { category: cat, editor: "float", subtype: "option" };

  if (typeSig === "f32") return { category: cat, editor: "float", subtype: "f32" };

  if (typeSig === "vec3" || typeSig === "vec2") {
    const dim: 2 | 3 = typeSig === "vec3" ? 3 : 2;
    return { category: cat, editor: "vector", dim, subtype: typeSig };
  }

  if (typeSig === "string") {
    const v = value && value.kind === "string" ? value.value : "";
    const looksLikePath = /\.(tex|dds|scb|sco|skn|skl|anm|png|wav)$/i.test(v) || v.includes("/");
    if (looksLikePath && cat !== "other") {
      return { category: cat, editor: "string", subtype: "path" };
    }
    if (/sound|voice|audio|name|tag|key/i.test(name)) {
      return { category: "audio", editor: "string", subtype: "name" };
    }
  }

  if (typeSig === "u8" || typeSig === "u16" || typeSig === "u32" || typeSig === "i16" || typeSig === "i32") {
    const enumKey = Object.keys(ENUMS).find(k => k.toLowerCase() === name.toLowerCase());
    if (enumKey) {
      return {
        category: cat === "other" ? "rendering" : cat,
        editor: "enum",
        subtype: typeSig,
        enum: ENUMS[enumKey],
        enumName: enumKey,
      };
    }
    if (/blend|mode|flag|pass|render|alpharef/.test(name.toLowerCase())) {
      return { category: cat === "other" ? "rendering" : cat, editor: "int", subtype: typeSig };
    }
    return { category: cat, editor: "int", subtype: typeSig };
  }

  if (typeSig === "flag" || typeSig === "bool")
    return { category: "flag", editor: "bool" };

  return null;
}

// ─── Catalog builder ─────────────────────────────────────────────────────
export function buildCatalog(astList: CatalogSource[]): Catalog {
  const catalog: Catalog = { blocks: [], byKey: {}, sources: astList };

  astList.forEach((src, srcIdx) => {
    const entries = getEntries(src.ast);
    entries.forEach((entry, entryIdx) => {
      const key = (entry.key as any).value as string;
      const cls = entry.value.kind === "object" ? entry.value.className : "(unknown)";
      let displayName = key.split("/").pop() || key;
      let emitters: EmitterInfo[] = [];

      if (cls === "VfxSystemDefinitionData" && entry.value.kind === "object") {
        const fields = entry.value.fields;
        const partNameF = findField(fields, "particleName");
        if (partNameF && partNameF.value.kind === "string") displayName = partNameF.value.value;

        const complexF = findField(fields, "complexEmitterDefinitionData");
        if (complexF && complexF.value.kind === "brace" && complexF.value.value.kind === "list") {
          emitters = complexF.value.value.items.map((emitterNode, idx) => {
            let emName = `emitter_${idx}`;
            let primitiveKind: string | null = null;
            if (emitterNode.kind === "object" && emitterNode.fields.kind === "fields") {
              const enF = findField(emitterNode.fields, "emitterName");
              if (enF && enF.value.kind === "string") emName = enF.value.value;
              const prim = findField(emitterNode.fields, "primitive");
              if (prim && prim.value.kind === "object") {
                primitiveKind = prim.value.className.replace(/^VfxPrimitive/, "");
              }
            }
            return {
              index: idx,
              name: emName,
              node: emitterNode,
              className: emitterNode.kind === "object" ? emitterNode.className : "?",
              primitiveKind,
              fields: extractEditableFields(emitterNode, []),
            };
          });
        }
      }

      const topFields = entry.value.kind === "object" ? extractEditableFields(entry.value, []) : [];
      const ability = guessAbility(displayName, key);

      const block: BlockInfo = {
        id: `${srcIdx}:${entryIdx}`,
        sourceIndex: srcIdx,
        sourceName: src.name,
        key,
        kind: cls,
        displayName,
        ability,
        emitters,
        topFields,
        entryRef: entry,
        stats: {
          colors:       emitters.reduce((s, e) => s + e.fields.filter(f => f.classification.category === "color").length, 0),
          scales:       emitters.reduce((s, e) => s + e.fields.filter(f => f.classification.category === "scale").length, 0),
          textures:     emitters.reduce((s, e) => s + e.fields.filter(f => f.classification.category === "texture").length, 0),
          emitterCount: emitters.length,
        },
      };
      catalog.blocks.push(block);
      catalog.byKey[key] = block;
    });
  });
  return catalog;
}

export function guessAbility(displayName: string, key: string): string {
  const s = (displayName + " " + key).toLowerCase();
  if (/(^|_)q(_|$)|alphastrike/.test(s))      return "Q";
  if (/(^|_)w(_|$)|meditate/.test(s))         return "W";
  if (/(^|_)e(_|$)|wuju|sword/.test(s))       return "E";
  if (/(^|_)r(_|$)|highlander/.test(s))       return "R";
  if (/(^|_)p(_|$)|passive/.test(s))          return "Passive";
  if (/ba[\d_]|basic|crit/.test(s))           return "BasicAttack";
  if (/recall|home/.test(s))                  return "Recall";
  if (/dance|joke|laugh|taunt|emote/.test(s)) return "Emote";
  if (/death/.test(s))                        return "Death";
  return "Other";
}

export function extractEditableFields(node: ValueNode, path: (string | number)[]): EditableField[] {
  const out: EditableField[] = [];
  function visitFields(fieldsBody: BodyNode, basePath: (string | number)[]) {
    if (!fieldsBody || fieldsBody.kind !== "fields") return;
    for (const f of fieldsBody.entries) {
      const fp = basePath.concat(f.name);
      const cls = classifyField(f.name, f.type, f.value);
      if (cls) {
        out.push({
          path: fp,
          name: f.name,
          label: prettyLabel(f.name),
          type: f.type,
          valueRef: f,
          classification: cls,
          preview: snapshotValue(f.value),
        });
      }
      if (f.value && f.value.kind === "object" && !/^Value(Float|Color|Vector\d|Vector)$/.test(f.value.className)) {
        visitFields(f.value.fields, fp);
      }
    }
  }
  if (node.kind === "object") visitFields(node.fields, path);
  return out;
}

export function prettyLabel(name: string): string {
  return name
    .replace(/[_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, c => c.toUpperCase());
}

export function snapshotValue(v: ValueNode | null | undefined): string {
  if (!v) return "";
  if (v.kind === "string") return v.value;
  if (v.kind === "number") return v.value;
  if (v.kind === "hex")    return v.value;
  if (v.kind === "bool")   return v.value ? "true" : "false";
  if (v.kind === "object") {
    if (v.className === "ValueColor") {
      const cv = findField(v.fields, "constantValue");
      if (cv && cv.value.kind === "brace" && cv.value.value.kind === "list") {
        return "rgba(" + cv.value.value.items.map(it => (it as any).value).join(", ") + ")";
      }
      return "ValueColor{…}";
    }
    if (v.className === "ValueFloat") {
      const cv = findField(v.fields, "constantValue");
      if (cv && cv.value.kind === "number") return cv.value.value;
      return "ValueFloat{dynamic}";
    }
    if (v.className && v.className.startsWith("ValueVector")) {
      const cv = findField(v.fields, "constantValue");
      if (cv && cv.value.kind === "brace" && cv.value.value.kind === "list") {
        return "(" + cv.value.value.items.map(it => (it as any).value).join(", ") + ")";
      }
      return v.className + "{dynamic}";
    }
  }
  if (v.kind === "brace" && v.value.kind === "list") {
    return "(" + v.value.items.slice(0, 4).map(it => (it as any).value).join(", ") + ")";
  }
  return JSON.stringify(v).slice(0, 40);
}

// ─── Mutation helpers ────────────────────────────────────────────────────
function roundTo(n: number | string, d: number): number {
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (!isFinite(num)) return 0;
  const f = Math.pow(10, d);
  return Math.round(num * f) / f;
}

export function setValueColor(field: EditableField, rgba: number[]): boolean {
  const v = field.valueRef.value;
  if (v.kind !== "object" || v.className !== "ValueColor") return false;
  const cv = findField(v.fields, "constantValue");
  if (cv && cv.value.kind === "brace" && cv.value.value.kind === "list") {
    cv.value.value.items = rgba.map(x => ({ kind: "number", value: String(roundTo(x, 4)) }));
    return true;
  }
  if (v.fields.kind === "fields") {
    v.fields.entries.unshift({
      name: "constantValue", type: "vec4",
      value: { kind: "brace", value: { kind: "list",
        items: rgba.map(x => ({ kind: "number", value: String(roundTo(x, 4)) })) } }
    });
  }
  return true;
}

export function setValueFloat(field: EditableField, val: number): boolean {
  const v = field.valueRef.value;
  if (v.kind === "object" && v.className === "ValueFloat") {
    const cv = findField(v.fields, "constantValue");
    if (cv && cv.value.kind === "number") { cv.value.value = String(roundTo(val, 6)); return true; }
    if (v.fields.kind === "fields") {
      v.fields.entries.unshift({
        name: "constantValue", type: "f32",
        value: { kind: "number", value: String(roundTo(val, 6)) }
      });
    }
    return true;
  }
  if (field.type === "option[f32]" && v.kind === "brace" && v.value.kind === "list") {
    if (v.value.items.length === 0) v.value.items.push({ kind: "number", value: "0" });
    (v.value.items[0] as any).value = String(roundTo(val, 6));
    return true;
  }
  if (v.kind === "number") { v.value = String(roundTo(val, 6)); return true; }
  return false;
}

export function setValueVector(field: EditableField, vals: number[]): boolean {
  const v = field.valueRef.value;
  if (v.kind === "object" && v.className && v.className.startsWith("ValueVector")) {
    const cv = findField(v.fields, "constantValue");
    if (cv && cv.value.kind === "brace" && cv.value.value.kind === "list") {
      cv.value.value.items = vals.map(x => ({ kind: "number", value: String(roundTo(x, 4)) }));
      return true;
    }
  }
  if (v.kind === "brace" && v.value.kind === "list") {
    v.value.items = vals.map(x => ({ kind: "number", value: String(roundTo(x, 4)) }));
    return true;
  }
  return false;
}

export function setString(field: EditableField, str: string): boolean {
  const v = field.valueRef.value;
  if (v.kind === "string") { v.value = str; return true; }
  return false;
}

export function setBool(field: EditableField, b: boolean): boolean {
  const v = field.valueRef.value;
  if (v.kind === "bool") { v.value = !!b; return true; }
  return false;
}

export function scaleBlockSizes(block: BlockInfo, factor: number): number {
  let count = 0;
  for (const em of block.emitters) {
    for (const f of em.fields) {
      if (f.classification.category !== "scale") continue;
      const v = f.valueRef.value;
      if (v.kind === "object" && v.className && v.className.startsWith("ValueVector")) {
        const cv = findField(v.fields, "constantValue");
        if (cv && cv.value.kind === "brace" && cv.value.value.kind === "list") {
          cv.value.value.items.forEach((it: any) => { it.value = String(roundTo(parseFloat(it.value) * factor, 4)); });
          count++;
        }
      } else if (v.kind === "object" && v.className === "ValueFloat") {
        const cv = findField(v.fields, "constantValue");
        if (cv && cv.value.kind === "number") {
          cv.value.value = String(roundTo(parseFloat(cv.value.value) * factor, 6));
          count++;
        }
      }
    }
  }
  return count;
}

// ─── Keyframe helpers (animated color dynamics) ──────────────────────────
export interface ColorKeyframes {
  times: number[];
  values: number[][];
  timesNode: { items: { kind: string; value: string }[] };
  valsNode:  { items: any[] };
}

export function getColorKeyframes(field: EditableField): ColorKeyframes | null {
  const v = field.valueRef.value;
  if (!v || v.kind !== "object") return null;
  const dyn = findField(v.fields, "dynamics");
  if (!dyn || dyn.value.kind !== "object" || dyn.value.className !== "VfxAnimatedColorVariableData") return null;
  const timesF = findField(dyn.value.fields, "times");
  const valsF  = findField(dyn.value.fields, "values");
  if (!timesF || !valsF) return null;
  if (timesF.value.kind !== "brace" || valsF.value.kind !== "brace") return null;
  if (timesF.value.value.kind !== "list" || valsF.value.value.kind !== "list") return null;

  const times = timesF.value.value.items.map((it: any) => parseFloat(it.value));
  const vals  = valsF.value.value.items.map((it: any) => {
    if (it.kind === "brace" && it.value.kind === "list") {
      return it.value.items.map((x: any) => parseFloat(x.value));
    }
    return [1, 1, 1, 1];
  });
  return {
    times,
    values: vals,
    timesNode: timesF.value.value as any,
    valsNode:  valsF.value.value as any,
  };
}

export function setColorKeyframe(field: EditableField, index: number, time: number, rgba: number[]): boolean {
  const kf = getColorKeyframes(field);
  if (!kf) return false;
  if (index < 0 || index >= kf.times.length) return false;
  kf.timesNode.items[index].value = String(roundTo(time, 4));
  const valItem = kf.valsNode.items[index];
  if (valItem.kind === "brace" && valItem.value.kind === "list") {
    valItem.value.items = rgba.map(x => ({ kind: "number", value: String(roundTo(x, 4)) }));
  }
  return true;
}

export function addColorKeyframe(field: EditableField, time: number, rgba: number[]): boolean {
  const kf = getColorKeyframes(field);
  if (!kf) return false;
  let insertAt = kf.times.findIndex(t => t > time);
  if (insertAt < 0) insertAt = kf.times.length;
  kf.timesNode.items.splice(insertAt, 0, { kind: "number", value: String(roundTo(time, 4)) });
  kf.valsNode.items.splice(insertAt, 0, {
    kind: "brace",
    value: { kind: "list", items: rgba.map(x => ({ kind: "number", value: String(roundTo(x, 4)) })) }
  });
  return true;
}

export function removeColorKeyframe(field: EditableField, index: number): boolean {
  const kf = getColorKeyframes(field);
  if (!kf) return false;
  if (kf.times.length <= 1) return false;
  kf.timesNode.items.splice(index, 1);
  kf.valsNode.items.splice(index, 1);
  return true;
}

export function fnv1a32(str: string): string {
  let h = 0x811c9dc5 >>> 0;
  const s = str.toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return "0x" + h.toString(16).padStart(8, "0");
}
