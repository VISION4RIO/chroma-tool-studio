import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import dxt from "dxt-js";
import parseDds from "parse-dds";
import { AnimatePresence } from "framer-motion";
import { useI18n } from "./i18n";
import { SettingsModal } from "./components/SettingsModal";
import { ChangelogModal } from "./components/ChangelogModal";
import { VfxBlockEditorTab } from "./components/VfxBlockEditorTab";

type RGB = [number, number, number];
type HSV = [number, number, number];

type Zone = {
  id: string;
  name: string;
  pixels: number;
  sourceRgb: RGB;
  sourceHsv: HSV;
  targetRgb: RGB;
  enabled: boolean;
  hueTolerance: number;
  satTolerance: number;
  valTolerance: number;
};

type ProcessingSettings = {
  intensity: number;
  saturationBoost: number;
  neutralProtection: number;
  alphaMin: number;
};

type RecolorStats = {
  eligiblePixels: number;
  recoloredPixels: number;
};

type VfxMode = "safe" | "aggressive";
type PythonKind = "vfx" | "skin" | "animation";

type ActiveTab = "assets" | "vfxRecolor" | "vfxLibrary" | "vfxBlockEditor";

type VfxSlot = {
  id: string;
  label: string;
  blockType: "birthColor" | "color";
  sourceRgb: RGB;
  targetRgb: RGB;
  scale: 1 | 255;
  hasFloatSuffix: boolean;
  alphaToken: string;
  start: number;
  end: number;
};

type VfxLibraryEntry = {
  id: string;
  name: string;
  baseKey: string;
  champion: string;
  skin: string;
  sourcePath: string;
  content: string;
  slotCount: number;
  blockCount: number;
  updatedAt: number;
};

type VfxBlock = {
  id: string;
  label: string;
  summary: string;
  systemPath: string;
  particleName: string;
  start: number;
  end: number;
  text: string;
};

type VfxFileMeta = {
  champion: string;
  skin: string;
  confidence: "high" | "medium" | "low";
  evidence: string[];
};

type VfxHealthReport = {
  warnings: string[];
  fixableWarnings: string[];
};

type VfxAutoFixResult = {
  text: string;
  appliedFixes: string[];
};

type Preset = {
  name: string;
  color: RGB;
  family: string;
};

type DdsFormat = "dxt1" | "dxt3" | "dxt5";

type Status = {
  label: string;
  detail: string;
  progress: number;
};

type PngAsset = {
  id: string;
  file: File;
  relativePath: string;
  zones: Zone[];
  analyzed: boolean;
  previewOriginal: string | null;
  previewProcessed: string | null;
};

type DesktopSaveResult = { ok: boolean; error?: string };
type UpdateResult = { ok: boolean; error?: string; reason?: string };
type UpdateInfo = {
  version: string;
  releaseName: string;
  releaseDate: string;
  releaseNotes: string;
};
type UpdaterEvent =
  | { type: "checking" }
  | { type: "disabled"; message?: string }
  | { type: "available"; info?: UpdateInfo | null }
  | { type: "not-available"; info?: UpdateInfo | null }
  | { type: "downloading"; percent?: number; bytesPerSecond?: number; transferred?: number; total?: number }
  | { type: "downloaded"; info?: UpdateInfo | null }
  | { type: "error"; message?: string };
type RiotIngestFile = {
  name: string;
  relativePath: string;
  content: string;
  kind: PythonKind;
};

type RiotIngestResult = {
  ok: boolean;
  files?: RiotIngestFile[];
  warnings?: string[];
  error?: string;
};

type OutputTarget = { kind: "desktop"; outputDir: string } | { kind: "web"; handle: FileSystemDirectoryHandle };

declare global {
  interface Window {
    desktopBridge?: {
      pickOutputFolder: () => Promise<string | null>;
      pickRiotSource: () => Promise<string | null>;
      ingestRiotSource: (sourcePath: string) => Promise<RiotIngestResult>;
      saveBinaryFile: (outputDir: string, relativePath: string, buffer: ArrayBuffer) => Promise<DesktopSaveResult>;
      saveTextFile: (outputDir: string, relativePath: string, content: string) => Promise<DesktopSaveResult>;
      updater?: {
        checkForUpdates: () => Promise<UpdateResult>;
        downloadUpdate: () => Promise<UpdateResult>;
        installUpdate: () => Promise<UpdateResult>;
        getAppVersion: () => Promise<string>;
        onEvent: (handler: (event: UpdaterEvent) => void) => () => void;
      };
    };
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite"; startIn?: string | FileSystemHandle }) => Promise<FileSystemDirectoryHandle>;
  }
}

const DEFAULT_SETTINGS: ProcessingSettings = {
  intensity: 0.96,
  saturationBoost: 1.12,
  neutralProtection: 0.45,
  alphaMin: 10,
};

const CORE_PRESET_LIBRARY: Preset[] = [
  { name: "Abyss", color: [30, 75, 170], family: "Blue" },
  { name: "Afterglow", color: [255, 120, 78], family: "Warm" },
  { name: "Amethyst", color: [147, 105, 255], family: "Purple" },
  { name: "Arcane", color: [64, 126, 255], family: "Blue" },
  { name: "Arctic", color: [166, 232, 255], family: "Cyan" },
  { name: "Ashen", color: [155, 160, 176], family: "Neutral" },
  { name: "Aurora", color: [70, 255, 196], family: "Green" },
  { name: "Azure", color: [28, 140, 255], family: "Blue" },
  { name: "Blood Moon", color: [196, 30, 58], family: "Red" },
  { name: "Blossom", color: [245, 118, 192], family: "Pink" },
  { name: "Celestial", color: [120, 181, 255], family: "Blue" },
  { name: "Cinder", color: [255, 92, 46], family: "Warm" },
  { name: "Citrine", color: [255, 208, 74], family: "Gold" },
  { name: "Coral", color: [255, 131, 112], family: "Warm" },
  { name: "Cosmic", color: [116, 90, 255], family: "Purple" },
  { name: "Crimson", color: [220, 40, 52], family: "Red" },
  { name: "Cyber", color: [57, 255, 184], family: "Green" },
  { name: "Dawn", color: [255, 173, 100], family: "Warm" },
  { name: "Deep Sea", color: [37, 92, 174], family: "Blue" },
  { name: "Dream", color: [140, 118, 255], family: "Purple" },
  { name: "Eclipse", color: [89, 64, 148], family: "Purple" },
  { name: "Electric", color: [0, 219, 255], family: "Cyan" },
  { name: "Emerald", color: [0, 181, 105], family: "Green" },
  { name: "Ember", color: [255, 100, 38], family: "Warm" },
  { name: "Frost", color: [165, 236, 255], family: "Cyan" },
  { name: "Fuchsia", color: [227, 55, 210], family: "Pink" },
  { name: "Galaxy", color: [93, 116, 255], family: "Blue" },
  { name: "Garnet", color: [153, 16, 44], family: "Red" },
  { name: "Glacier", color: [114, 210, 255], family: "Cyan" },
  { name: "Gold", color: [255, 194, 64], family: "Gold" },
  { name: "Hazard", color: [247, 180, 37], family: "Gold" },
  { name: "Helix", color: [41, 183, 255], family: "Cyan" },
  { name: "Infernal", color: [255, 73, 34], family: "Warm" },
  { name: "Ivory", color: [233, 230, 221], family: "Neutral" },
  { name: "Jade", color: [26, 189, 125], family: "Green" },
  { name: "Lavender", color: [190, 152, 255], family: "Purple" },
  { name: "Lilac", color: [211, 154, 255], family: "Purple" },
  { name: "Lime Burst", color: [153, 255, 37], family: "Green" },
  { name: "Magma", color: [255, 69, 20], family: "Warm" },
  { name: "Marine", color: [0, 122, 214], family: "Blue" },
  { name: "Mint", color: [99, 235, 183], family: "Green" },
  { name: "Moonlight", color: [166, 173, 255], family: "Blue" },
  { name: "Nebula", color: [112, 68, 255], family: "Purple" },
  { name: "Neon Green", color: [85, 255, 85], family: "Green" },
  { name: "Neon Pink", color: [255, 56, 179], family: "Pink" },
  { name: "Neon Sky", color: [40, 232, 255], family: "Cyan" },
  { name: "Obsidian", color: [43, 46, 58], family: "Neutral" },
  { name: "Ocean", color: [0, 142, 204], family: "Blue" },
  { name: "Onyx", color: [26, 28, 34], family: "Neutral" },
  { name: "Opal", color: [102, 255, 223], family: "Green" },
  { name: "Orchid", color: [194, 82, 255], family: "Purple" },
  { name: "Pearl", color: [219, 229, 255], family: "Neutral" },
  { name: "Phantom", color: [90, 108, 168], family: "Blue" },
  { name: "Plasma", color: [135, 85, 255], family: "Purple" },
  { name: "Poison", color: [113, 232, 38], family: "Green" },
  { name: "Quartz", color: [182, 173, 214], family: "Neutral" },
  { name: "Radiant", color: [255, 234, 145], family: "Gold" },
  { name: "Rose", color: [255, 102, 148], family: "Pink" },
  { name: "Royal", color: [86, 74, 212], family: "Purple" },
  { name: "Ruby", color: [214, 33, 72], family: "Red" },
  { name: "Saffron", color: [255, 170, 44], family: "Gold" },
  { name: "Sakura", color: [255, 145, 196], family: "Pink" },
  { name: "Sapphire", color: [34, 102, 255], family: "Blue" },
  { name: "Scarlet", color: [231, 39, 39], family: "Red" },
  { name: "Seafoam", color: [93, 242, 196], family: "Green" },
  { name: "Shadow", color: [73, 79, 104], family: "Neutral" },
  { name: "Solar", color: [255, 188, 72], family: "Gold" },
  { name: "Spectral", color: [80, 217, 255], family: "Cyan" },
  { name: "Storm", color: [90, 128, 199], family: "Blue" },
  { name: "Sunset", color: [255, 114, 83], family: "Warm" },
  { name: "Teal", color: [26, 201, 187], family: "Cyan" },
  { name: "Topaz", color: [255, 196, 85], family: "Gold" },
  { name: "Toxic", color: [153, 255, 0], family: "Green" },
  { name: "Twilight", color: [111, 89, 214], family: "Purple" },
  { name: "Ultraviolet", color: [109, 42, 255], family: "Purple" },
  { name: "Verdant", color: [57, 190, 88], family: "Green" },
  { name: "Void", color: [65, 44, 128], family: "Purple" },
  { name: "Volt", color: [122, 248, 72], family: "Green" },
  { name: "Winter", color: [139, 222, 255], family: "Cyan" },
  { name: "Wisteria", color: [168, 118, 255], family: "Purple" },
  { name: "Zephyr", color: [113, 247, 255], family: "Cyan" },
];

const PRESET_LIBRARY: Preset[] = buildExtendedPresetLibrary(CORE_PRESET_LIBRARY);

function buildExtendedPresetLibrary(core: Preset[]): Preset[] {
  const hueFamilies: Array<{ family: string; label: string; h: number }> = [
    { family: "Red", label: "Crimson", h: 0 / 360 },
    { family: "Warm", label: "Ember", h: 18 / 360 },
    { family: "Gold", label: "Amber", h: 42 / 360 },
    { family: "Green", label: "Verdant", h: 95 / 360 },
    { family: "Green", label: "Jade", h: 132 / 360 },
    { family: "Cyan", label: "Aqua", h: 178 / 360 },
    { family: "Blue", label: "Azure", h: 214 / 360 },
    { family: "Blue", label: "Sapphire", h: 228 / 360 },
    { family: "Purple", label: "Violet", h: 258 / 360 },
    { family: "Purple", label: "Amethyst", h: 276 / 360 },
    { family: "Pink", label: "Rose", h: 320 / 360 },
    { family: "Red", label: "Ruby", h: 348 / 360 },
  ];

  const toneStops: Array<{ name: string; s: number; v: number }> = [
    { name: "Mist", s: 0.32, v: 0.95 },
    { name: "Frost", s: 0.4, v: 0.92 },
    { name: "Soft", s: 0.5, v: 0.88 },
    { name: "Pure", s: 0.62, v: 0.92 },
    { name: "Classic", s: 0.72, v: 0.86 },
    { name: "Core", s: 0.82, v: 0.82 },
    { name: "Deep", s: 0.88, v: 0.7 },
    { name: "Night", s: 0.78, v: 0.55 },
    { name: "Neon", s: 0.95, v: 0.98 },
    { name: "Shadow", s: 0.62, v: 0.42 },
  ];

  const generated: Preset[] = [];
  for (const family of hueFamilies) {
    for (const tone of toneStops) {
      generated.push({
        name: `${family.label} ${tone.name}`,
        family: family.family,
        color: hsvToRgb([family.h, tone.s, tone.v]),
      });
    }
  }

  const neutrals: Preset[] = [
    { name: "Neutral Snow", family: "Neutral", color: [245, 245, 245] },
    { name: "Neutral Cloud", family: "Neutral", color: [220, 220, 220] },
    { name: "Neutral Silver", family: "Neutral", color: [190, 190, 190] },
    { name: "Neutral Slate", family: "Neutral", color: [155, 155, 155] },
    { name: "Neutral Steel", family: "Neutral", color: [120, 120, 120] },
    { name: "Neutral Graphite", family: "Neutral", color: [92, 92, 92] },
    { name: "Neutral Coal", family: "Neutral", color: [60, 60, 60] },
    { name: "Neutral Obsidian", family: "Neutral", color: [30, 30, 30] },
  ];

  const all = [...core, ...generated, ...neutrals];
  const seen = new Set<string>();
  const deduped: Preset[] = [];
  for (const preset of all) {
    const key = `${preset.family}|${preset.name}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(preset);
  }
  return deduped;
}

const MAX_ZONES = 18;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function rgbToHex([r, g, b]: RGB): string {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function hexToRgb(hex: string): RGB {
  const raw = hex.replace("#", "");
  const value = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const num = Number.parseInt(value, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHsv([r, g, b]: RGB): HSV {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

function hsvToRgb([h, s, v]: HSV): RGB {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const mod = i % 6;
  const [r, g, b] =
    mod === 0
      ? [v, t, p]
      : mod === 1
        ? [q, v, p]
        : mod === 2
          ? [p, v, t]
          : mod === 3
            ? [p, q, v]
            : mod === 4
              ? [t, p, v]
              : [v, p, q];
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function srgbToLin(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linToSrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(clamp01(v) * 255);
}

function rgbLin(rgb: RGB): RGB {
  return [srgbToLin(rgb[0]), srgbToLin(rgb[1]), srgbToLin(rgb[2])];
}

function luminanceLin(rgb: RGB): number {
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return d > 0.5 ? 1 - d : d;
}

function hueName(h: number): string {
  const deg = h * 360;
  if (deg < 20 || deg >= 345) return "Red";
  if (deg < 45) return "Orange";
  if (deg < 70) return "Gold";
  if (deg < 95) return "Lime";
  if (deg < 150) return "Green";
  if (deg < 190) return "Teal";
  if (deg < 230) return "Blue";
  if (deg < 270) return "Indigo";
  if (deg < 305) return "Purple";
  return "Magenta";
}

function fileKey(file: File, index: number): string {
  const rel = file.webkitRelativePath || file.name;
  return `${rel}__${file.lastModified}__${file.size}__${index}`;
}

async function fileToImageData(file: File, opts?: { maxDimension?: number }): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  const maxDim = opts?.maxDimension;
  const scale = maxDim ? Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height)) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context not available.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function ddsFormatToFlags(format: DdsFormat): number {
  if (format === "dxt1") return dxt.flags.DXT1;
  if (format === "dxt3") return dxt.flags.DXT3;
  return dxt.flags.DXT5;
}

function ddsFormatLabel(format: string): string {
  return format.toUpperCase();
}

function pickBestDdsMip(images: Array<{ shape: [number, number] }>, maxDimension?: number): number {
  if (!maxDimension) return 0;
  for (let i = 0; i < images.length; i += 1) {
    const [w, h] = images[i].shape;
    if (Math.max(w, h) <= maxDimension) return i;
  }
  return images.length - 1;
}

function decodeDdsImage(arrayBuffer: ArrayBuffer, opts?: { maxDimension?: number }): ImageData {
  const info = parseDds(arrayBuffer);
  if (info.format === "rgba32f") {
    throw new Error("DDS RGBA32F is not supported in this recolor pipeline.");
  }

  const format = info.format as DdsFormat;
  const mipIndex = pickBestDdsMip(info.images, opts?.maxDimension);
  const image = info.images[mipIndex];
  const [width, height] = image.shape;
  const source = new Uint8Array(arrayBuffer, image.offset, image.length);
  const decompressed = dxt.decompress(source, width, height, ddsFormatToFlags(format));
  const pixels = new Uint8ClampedArray(decompressed);
  return new ImageData(pixels, width, height);
}

async function assetFileToImageData(file: File, opts?: { maxDimension?: number }): Promise<ImageData> {
  const ext = file.name.toLowerCase();
  if (ext.endsWith(".dds")) {
    return decodeDdsImage(await file.arrayBuffer(), opts);
  }

  return fileToImageData(file, opts);
}

async function recolorDdsBlob(file: File, zones: Zone[], settings: ProcessingSettings): Promise<Blob> {
  const sourceBuffer = await file.arrayBuffer();
  const info = parseDds(sourceBuffer);
  if (info.format === "rgba32f") {
    throw new Error("DDS RGBA32F is not supported for output recolor.");
  }

  const format = info.format as DdsFormat;
  const flags = ddsFormatToFlags(format);
  const qualityFlags = dxt.flags.ColourClusterFit | dxt.flags.ColourMetricPerceptual;
  const outputBytes = new Uint8Array(sourceBuffer.slice(0));

  for (const image of info.images) {
    const [width, height] = image.shape;
    const source = new Uint8Array(sourceBuffer, image.offset, image.length);
    const decoded = dxt.decompress(source, width, height, flags);
    const decodedCopy = new Uint8ClampedArray(decoded);
    const recolored = recolorImageData(new ImageData(decodedCopy, width, height), zones, settings);
    const compressed = dxt.compress(new Uint8Array(recolored.data), width, height, flags | qualityFlags);

    if (compressed.length !== image.length) {
      throw new Error(
        `DDS recompression size mismatch (${file.name}, ${ddsFormatLabel(format)}, ${width}x${height}).`,
      );
    }
    outputBytes.set(new Uint8Array(compressed), image.offset);
  }

  return new Blob([outputBytes], { type: "application/octet-stream" });
}

async function recolorAssetToBlob(file: File, zones: Zone[], settings: ProcessingSettings): Promise<Blob> {
  if (file.name.toLowerCase().endsWith(".dds")) {
    return recolorDdsBlob(file, zones, settings);
  }

  const source = await fileToImageData(file);
  const recolored = recolorImageData(source, zones, settings);
  return imageDataToBlob(recolored);
}

function detectZones(imageData: ImageData, alphaMin: number): Zone[] {
  type Bin = { count: number; rgb: RGB; hsv: HSV };
  const bins = new Map<string, Bin>();
  const data = imageData.data;
  const step = Math.max(1, Math.floor(Math.sqrt((imageData.width * imageData.height) / 320_000)));

  for (let y = 0; y < imageData.height; y += step) {
    for (let x = 0; x < imageData.width; x += step) {
      const idx = (y * imageData.width + x) * 4;
      const a = data[idx + 3];
      if (a < alphaMin) continue;

      const rgb: RGB = [data[idx], data[idx + 1], data[idx + 2]];
      const hsv = rgbToHsv(rgb);
      if (hsv[2] < 0.01) continue;
      if (hsv[1] < 0.025 && hsv[2] < 0.14) continue;

      const hBin = Math.floor(hsv[0] * 36);
      const sBin = Math.floor(hsv[1] * 8);
      const vBin = Math.floor(hsv[2] * 6);
      const key = `${hBin}-${sBin}-${vBin}`;
      const found = bins.get(key);
      if (!found) {
        bins.set(key, { count: 1, rgb: [...rgb], hsv: [...hsv] });
      } else {
        found.count += 1;
        found.rgb = [found.rgb[0] + rgb[0], found.rgb[1] + rgb[1], found.rgb[2] + rgb[2]];
        found.hsv = [found.hsv[0] + hsv[0], found.hsv[1] + hsv[1], found.hsv[2] + hsv[2]];
      }
    }
  }

  const minimumCount = Math.max(10, Math.floor((imageData.width * imageData.height) / 22_000));
  const ranked = [...bins.values()]
    .filter((bin) => bin.count >= minimumCount)
    .map((bin) => ({
      count: bin.count,
      rgb: [Math.round(bin.rgb[0] / bin.count), Math.round(bin.rgb[1] / bin.count), Math.round(bin.rgb[2] / bin.count)] as RGB,
      hsv: [bin.hsv[0] / bin.count, bin.hsv[1] / bin.count, bin.hsv[2] / bin.count] as HSV,
    }))
    .sort((a, b) => b.count - a.count);

  const merged: typeof ranked = [];
  for (const candidate of ranked) {
    const near = merged.find(
      (item) =>
        hueDistance(item.hsv[0], candidate.hsv[0]) < 0.032 &&
        Math.abs(item.hsv[1] - candidate.hsv[1]) < 0.15 &&
        Math.abs(item.hsv[2] - candidate.hsv[2]) < 0.13,
    );
    if (!near) {
      merged.push(candidate);
      continue;
    }
    const total = near.count + candidate.count;
    near.rgb = [
      Math.round((near.rgb[0] * near.count + candidate.rgb[0] * candidate.count) / total),
      Math.round((near.rgb[1] * near.count + candidate.rgb[1] * candidate.count) / total),
      Math.round((near.rgb[2] * near.count + candidate.rgb[2] * candidate.count) / total),
    ];
    near.hsv = [
      (near.hsv[0] * near.count + candidate.hsv[0] * candidate.count) / total,
      (near.hsv[1] * near.count + candidate.hsv[1] * candidate.count) / total,
      (near.hsv[2] * near.count + candidate.hsv[2] * candidate.count) / total,
    ];
    near.count = total;
  }

  return merged.slice(0, MAX_ZONES).map((bin, index) => ({
    id: `zone-${index}`,
    name: `${hueName(bin.hsv[0])} ${index + 1}`,
    pixels: bin.count,
    sourceRgb: bin.rgb,
    sourceHsv: bin.hsv,
    targetRgb: bin.rgb,
    enabled: true,
    hueTolerance: 0.17,
    satTolerance: 0.92,
    valTolerance: 1.0,
  }));
}

function zoneStrength(zone: Zone, hsv: HSV): number {
  const hueNorm = hueDistance(hsv[0], zone.sourceHsv[0]) / Math.max(0.001, zone.hueTolerance);
  const satNorm = Math.abs(hsv[1] - zone.sourceHsv[1]) / Math.max(0.001, zone.satTolerance + 0.34 * (1 - zone.sourceHsv[1]));
  const valNorm = Math.abs(hsv[2] - zone.sourceHsv[2]) / Math.max(0.001, zone.valTolerance + 0.4);
  const score = Math.exp(-(hueNorm * hueNorm * 1.18 + satNorm * satNorm * 0.56 + valNorm * valNorm * 0.3));
  const shadowBoost = hsv[2] < 0.24 ? 1.2 : 1;
  return clamp01(score * shadowBoost);
}

function recolorImageDataDetailed(imageData: ImageData, zones: Zone[], settings: ProcessingSettings): {
  imageData: ImageData;
  stats: RecolorStats;
  uncoveredMap: ImageData;
} {
  const out = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  const data = out.data;
  const uncoveredMap = new ImageData(imageData.width, imageData.height);
  const uncovered = uncoveredMap.data;
  const prepared = zones
    .filter((zone) => zone.enabled)
    .map((zone) => {
      const targetLin = rgbLin(zone.targetRgb);
      return { ...zone, targetLin, targetLum: Math.max(1e-6, luminanceLin(targetLin)) };
    });

  if (prepared.length === 0) {
    return {
      imageData: out,
      stats: { eligiblePixels: 0, recoloredPixels: 0 },
      uncoveredMap,
    };
  }

  let eligiblePixels = 0;
  let recoloredPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < settings.alphaMin) continue;

    const rgb: RGB = [data[i], data[i + 1], data[i + 2]];
    const hsv = rgbToHsv(rgb);

    let bestZone = prepared[0];
    let best = 0;
    for (const zone of prepared) {
      const s = zoneStrength(zone, hsv);
      if (s > best) {
        best = s;
        bestZone = zone;
      }
    }

    if (best < 0.015) {
      for (const zone of prepared) {
        const broadHue = 1 - hueDistance(hsv[0], zone.sourceHsv[0]) / Math.max(0.08, zone.hueTolerance * 1.9);
        const broadVal = 1 - Math.abs(hsv[2] - zone.sourceHsv[2]) / Math.max(0.2, zone.valTolerance * 1.25);
        const fallbackScore = clamp01(broadHue * 0.7 + broadVal * 0.3);
        if (fallbackScore > best) {
          best = fallbackScore;
          bestZone = zone;
        }
      }
      if (best < 0.08) continue;
      best *= 0.65;
    }

    if (best > 0.12) {
      eligiblePixels += 1;
    } else {
      // Heatmap for regions that likely belong to a material but were not recolored.
      if (hsv[1] > 0.18 || hsv[2] > 0.2) {
        uncovered[i] = 255;
        uncovered[i + 1] = 70;
        uncovered[i + 2] = 20;
        uncovered[i + 3] = 150;
      }
      continue;
    }

    const neutralFactor = mix(1 - settings.neutralProtection, 1, hsv[1]);
    const strength = clamp01(best * settings.intensity * neutralFactor);
    if (strength <= 0) continue;

    const origLin = rgbLin(rgb);
    const origLum = Math.max(1e-6, luminanceLin(origLin));
    const scale = origLum / bestZone.targetLum;
    const outLin: RGB = [
      mix(origLin[0], bestZone.targetLin[0] * scale, strength),
      mix(origLin[1], bestZone.targetLin[1] * scale, strength),
      mix(origLin[2], bestZone.targetLin[2] * scale, strength),
    ];

    let outRgb: RGB = [linToSrgb(outLin[0]), linToSrgb(outLin[1]), linToSrgb(outLin[2])];
    if (settings.saturationBoost !== 1) {
      const nextHsv = rgbToHsv(outRgb);
      nextHsv[1] = clamp01(nextHsv[1] * settings.saturationBoost);
      outRgb = hsvToRgb(nextHsv);
    }

    data[i] = outRgb[0];
    data[i + 1] = outRgb[1];
    data[i + 2] = outRgb[2];
    recoloredPixels += 1;
  }

  return {
    imageData: out,
    stats: { eligiblePixels, recoloredPixels },
    uncoveredMap,
  };
}

function recolorImageData(imageData: ImageData, zones: Zone[], settings: ProcessingSettings): ImageData {
  return recolorImageDataDetailed(imageData, zones, settings).imageData;
}

function imageDataToDataUrl(imageData: ImageData): string {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context not available.");
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

function imageDataToBlob(imageData: ImageData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context not available.");
  ctx.putImageData(imageData, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("Image export failed."));
      else resolve(blob);
    }, "image/png");
  });
}

function recolorVfxText(content: string, targetColor: RGB, mode: VfxMode): { text: string; changes: number } {
  return mode === "aggressive" ? recolorVfxTextAggressive(content, targetColor) : recolorVfxTextSafe(content, targetColor);
}

function recolorVfxRgb(sourceRgb: RGB, targetColor: RGB): RGB {
  const sourceHsv = rgbToHsv(sourceRgb);
  const targetHsv = rgbToHsv(targetColor);

  // Neutral targets (black/gray/white) should remain truly neutral in vec4 recolor.
  if (targetHsv[1] < 0.04) {
    const neutralValue = clamp01(sourceHsv[2] * targetHsv[2]);
    return hsvToRgb([0, 0, neutralValue]);
  }

  const sat = clamp01(sourceHsv[1] * 0.22 + targetHsv[1] * 0.78);
  const val = clamp01(sourceHsv[2] * (0.6 + targetHsv[2] * 0.4));
  return hsvToRgb([targetHsv[0], sat, val]);
}

function findMatchingBrace(text: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function recolorVfxTextSafe(content: string, targetColor: RGB): { text: string; changes: number } {
  const num = String.raw`[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?f?`;
  const startRegex = /(birthColor|color)\s*:\s*embed\s*=\s*ValueColor\s*\{/g;
  const vec4Regex = new RegExp(String.raw`\{\s*(${num})\s*,\s*(${num})\s*,\s*(${num})\s*,\s*(${num})\s*\}`, "g");

  const parseToken = (token: string): number => Number.parseFloat(token.replace(/f$/i, ""));
  const formatComponent = (value01: number, scale: 1 | 255, hasFloatSuffix: boolean): string => {
    if (scale === 255) return `${Math.round(clamp01(value01) * 255)}`;
    const base = clamp01(value01).toFixed(4);
    return hasFloatSuffix ? `${base}f` : base;
  };

  let cursor = 0;
  let out = "";
  let changes = 0;
  let match: RegExpExecArray | null;

  while ((match = startRegex.exec(content)) !== null) {
    const blockStart = match.index;
    const openIndex = content.indexOf("{", blockStart);
    if (openIndex < 0) continue;

    const closeIndex = findMatchingBrace(content, openIndex);
    if (closeIndex < 0) continue;

    const block = content.slice(blockStart, closeIndex + 1);
    const recoloredBlock = block.replace(vec4Regex, (full, r: string, g: string, b: string, a: string) => {
      const rv = parseToken(r);
      const gv = parseToken(g);
      const bv = parseToken(b);
      if (![rv, gv, bv].every(Number.isFinite)) return full;

      const maxComp = Math.max(Math.abs(rv), Math.abs(gv), Math.abs(bv));
      const scale: 1 | 255 = maxComp > 1.5 ? 255 : 1;
      const sourceRgb: RGB = [
        Math.round(clamp01(rv / scale) * 255),
        Math.round(clamp01(gv / scale) * 255),
        Math.round(clamp01(bv / scale) * 255),
      ];

      const recoloredRgb = recolorVfxRgb(sourceRgb, targetColor);
      const hasFloatSuffix = /f$/i.test(r) || /f$/i.test(g) || /f$/i.test(b);
      changes += 1;
      return `{ ${formatComponent(recoloredRgb[0] / 255, scale, hasFloatSuffix)}, ${formatComponent(recoloredRgb[1] / 255, scale, hasFloatSuffix)}, ${formatComponent(recoloredRgb[2] / 255, scale, hasFloatSuffix)}, ${a} }`;
    });

    out += content.slice(cursor, blockStart);
    out += recoloredBlock;
    cursor = closeIndex + 1;
    startRegex.lastIndex = cursor;
  }

  out += content.slice(cursor);
  return { text: out, changes };
}

function recolorVfxTextAggressive(content: string, targetColor: RGB): { text: string; changes: number } {
  const num = String.raw`[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?f?`;
  const tupleRegex = new RegExp(
    String.raw`([\{\(])\s*(${num})\s*,\s*(${num})\s*,\s*(${num})\s*,\s*(${num})\s*([\}\)])`,
    "g",
  );
  let changes = 0;

  const nextText = content.replace(tupleRegex, (full, open: string, r: string, g: string, b: string, a: string, close: string) => {
    if ((open === "{" && close !== "}") || (open === "(" && close !== ")")) return full;
    const rv = Number.parseFloat(r.replace(/f$/i, ""));
    const gv = Number.parseFloat(g.replace(/f$/i, ""));
    const bv = Number.parseFloat(b.replace(/f$/i, ""));
    if (![rv, gv, bv].every(Number.isFinite)) return full;

    const maxComp = Math.max(Math.abs(rv), Math.abs(gv), Math.abs(bv));
    if (maxComp < 0.02) return full;
    const scale: 1 | 255 = maxComp > 1.5 ? 255 : 1;
    const sourceRgb: RGB = [
      Math.round(clamp01(rv / scale) * 255),
      Math.round(clamp01(gv / scale) * 255),
      Math.round(clamp01(bv / scale) * 255),
    ];
    const recoloredRgb = recolorVfxRgb(sourceRgb, targetColor);
    const hasFloatSuffix = /f$/i.test(r) || /f$/i.test(g) || /f$/i.test(b);
    const formatComponent = (value01: number): string => {
      if (scale === 255) return `${Math.round(clamp01(value01) * 255)}`;
      const base = clamp01(value01).toFixed(4);
      return hasFloatSuffix ? `${base}f` : base;
    };

    changes += 1;
    return `${open} ${formatComponent(recoloredRgb[0] / 255)}, ${formatComponent(recoloredRgb[1] / 255)}, ${formatComponent(recoloredRgb[2] / 255)}, ${a} ${close}`;
  });

  return { text: nextText, changes };
}

function normalizeVfxBaseKey(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/\.py$/i, "")
    .replace(/skin\d+/gi, "")
    .replace(/[^a-z0-9]+/g, "");
}

function championKey(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "").toLowerCase();
}

function normalizeChampionToken(value: string): string {
  const cleaned = value.replace(/[^a-z0-9]+/gi, "");
  return cleaned || "Unknown";
}

function championDisplay(value: string): string {
  const token = normalizeChampionToken(value);
  if (token === "Unknown") return token;
  const explicitMap: Record<string, string> = {
    masteryi: "MasterYi",
  };
  const normalized = token.toLowerCase();
  if (explicitMap[normalized]) return explicitMap[normalized];
  return token.charAt(0).toUpperCase() + token.slice(1);
}

function normalizeSkinToken(value: string): string {
  const cleaned = value.trim();
  if (!cleaned) return "skin0";
  if (/^base$/i.test(cleaned)) return "skin0";
  const match = cleaned.match(/skin\s*(\d+)/i);
  if (match) return `skin${match[1]}`;
  return cleaned.toLowerCase();
}

function detectChampionAndSkinFromContent(content: string): VfxFileMeta {
  const championHits = new Map<string, { label: string; count: number }>();
  const evidence = new Set<string>();
  const addChampionHit = (raw: string, weight = 1) => {
    const label = championDisplay(raw);
    if (label === "Unknown") return;
    const key = championKey(label);
    const prev = championHits.get(key);
    championHits.set(key, {
      label: prev?.label ?? label,
      count: (prev?.count ?? 0) + weight,
    });
  };

  const championPathRegex = /(?:data|assets)?\/?characters\/([a-z0-9_]+)/gi;
  let championMatch: RegExpExecArray | null;
  while ((championMatch = championPathRegex.exec(content)) !== null) {
    evidence.add("characters path");
    addChampionHit(championMatch[1], 2);
  }

  const vfxPathRegex = /characters\/([a-z0-9_]+)\/skins\/(?:base|skin\d+)/gi;
  while ((championMatch = vfxPathRegex.exec(content)) !== null) {
    evidence.add("particlePath");
    addChampionHit(championMatch[1], 3);
  }

  const skinNameChampionRegex = /championSkinName\s*:\s*string\s*=\s*"(?:base|skin\d+)?([A-Za-z0-9_]+)"/gi;
  while ((championMatch = skinNameChampionRegex.exec(content)) !== null) {
    evidence.add("championSkinName");
    addChampionHit(championMatch[1], 4);
  }

  const soundAssetRegex = /ASSETS\/Sounds\/Wwise\d+\/SFX\/Characters\/([a-z0-9_]+)/gi;
  while ((championMatch = soundAssetRegex.exec(content)) !== null) {
    evidence.add("sound bank path");
    addChampionHit(championMatch[1], 2);
  }

  const particleNameRegex = /particleName\s*:\s*string\s*=\s*"([a-z0-9_]+)"/gi;
  while ((championMatch = particleNameRegex.exec(content)) !== null) {
    const prefix = championMatch[1].split("_")[0];
    if (prefix) {
      evidence.add("particleName prefix");
      addChampionHit(prefix, 1);
    }
  }

  const rankedChampions = [...championHits.values()].sort((a, b) => b.count - a.count);
  const champion = rankedChampions[0]?.label ?? "Unknown";
  const runnerUp = rankedChampions[1]?.count ?? 0;
  const topCount = rankedChampions[0]?.count ?? 0;
  const championConfidence: "high" | "medium" | "low" =
    champion === "Unknown" ? "low" : topCount >= 9 || topCount >= runnerUp * 2 ? "high" : topCount >= 4 ? "medium" : "low";

  const skinFromNameMatch = content.match(/championSkinName\s*:\s*string\s*=\s*"([^"]+)"/i);
  if (skinFromNameMatch) {
    const skinName = skinFromNameMatch[1];
    if (/\bbase\b/i.test(skinName)) {
      evidence.add("championSkinName base");
      return { champion, skin: "skin0", confidence: championConfidence, evidence: [...evidence] };
    }
    const skinNumber = skinName.match(/skin\s*(\d+)/i);
    if (skinNumber) {
      evidence.add("championSkinName skin#");
      return { champion, skin: `skin${skinNumber[1]}`, confidence: championConfidence, evidence: [...evidence] };
    }
  }

  const skinHits = new Map<string, number>();
  const addSkinHit = (raw: string, weight = 1) => {
    const normalized = normalizeSkinToken(raw);
    skinHits.set(normalized, (skinHits.get(normalized) ?? 0) + weight);
  };

  const skinRegex = /\/skins\/(base|skin\d+)/gi;
  let skinMatch: RegExpExecArray | null;
  while ((skinMatch = skinRegex.exec(content)) !== null) {
    evidence.add("/skins/ path");
    addSkinHit(skinMatch[1], 2);
  }

  const particleSkinRegex = /_[sS]kin(\d+)_/g;
  while ((skinMatch = particleSkinRegex.exec(content)) !== null) {
    evidence.add("particleName skin token");
    addSkinHit(`skin${skinMatch[1]}`, 1);
  }

  const skin = [...skinHits.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "skin0";
  return { champion, skin, confidence: championConfidence, evidence: [...evidence] };
}

function inferChampionAndSkin(pathLike: string, content?: string): VfxFileMeta {
  const pathChampionMatch = pathLike.match(/(?:characters|champions)\/([^/\\]+)/i);
  const pathSkinMatch = pathLike.match(/\/skins\/(base|skin\d+)/i) ?? pathLike.match(/skin\s*(\d+)/i);

  const pathChampion = pathChampionMatch ? championDisplay(pathChampionMatch[1]) : "Unknown";
  const pathSkin = pathSkinMatch ? normalizeSkinToken(pathSkinMatch[1]) : "skin0";

  if (!content) {
    return { champion: pathChampion, skin: pathSkin, confidence: pathChampion === "Unknown" ? "low" : "medium", evidence: ["path"] };
  }

  const contentMeta = detectChampionAndSkinFromContent(content);
  const champion = contentMeta.champion !== "Unknown" ? contentMeta.champion : pathChampion;
  const skin = contentMeta.skin !== "skin0" || pathSkin === "skin0" ? contentMeta.skin : pathSkin;
  const confidence = contentMeta.confidence === "low" && pathChampion !== "Unknown" ? "medium" : contentMeta.confidence;
  const evidence = [...new Set([...contentMeta.evidence, ...(pathChampion !== "Unknown" ? ["path"] : [])])];
  return { champion, skin, confidence, evidence };
}

function inferPythonKind(pathLike: string, content: string): PythonKind {
  const normalizedPath = pathLike.replace(/\\/g, "/").toLowerCase();

  // Animation / rig related python exports are classified first.
  if (
    /\/animations?\//.test(normalizedPath)
    || /\/anims?\//.test(normalizedPath)
    || /animationgraph|skeletal|jointlist|rigresource|animator/i.test(content)
  ) {
    return "animation";
  }

  if (/\/skins\/(base|skin\d+)\.py$/.test(normalizedPath) || /(^|\/)skin\d+\.py$/.test(normalizedPath)) {
    return "skin";
  }
  if (/skinmeshproperties|skincharacterdataproperties|championskinname\s*:\s*string/i.test(content)) {
    return "skin";
  }

  if (/vfxsystemdefinitiondata|vfxemitterdefinitiondata|particlepath\s*:\s*string|particlename\s*:\s*string/i.test(content)) {
    return "vfx";
  }

  if (/skins_skin\d+/.test(normalizedPath) || /\/particles\//.test(normalizedPath)) {
    return "vfx";
  }

  // Default fallback keeps behavior stable for Riot-exported python bundles.
  return "vfx";
}

function extractLinkedBinPaths(content: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const linkedBlock = content.match(/linked\s*:\s*list\[string\]\s*=\s*\{([\s\S]*?)\}/i)?.[1] || "";
  const source = linkedBlock || content;
  const quotedPathRegex = /"([^"]+\.bin)"/gi;
  let match: RegExpExecArray | null;
  while ((match = quotedPathRegex.exec(source)) !== null) {
    const value = match[1].replace(/\\/g, "/").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function buildSkinDraftTemplate(champion: string, targetSkin: string, linkedPaths: string[]): string {
  const skinToken = normalizeSkinToken(targetSkin);
  const normalizedChampion = championDisplay(champion);
  const linked = linkedPaths
    .map((item) => item.replace(/\/skins\/(base|skin\d+)/gi, `/Skins/${skinToken === "skin0" ? "Base" : skinToken}`))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 500);

  const linkedLines = linked.length > 0
    ? linked.map((item) => `        "${item}"`).join("\n")
    : "        # Add linked .bin paths from your source files";

  return [
    `# Chroma Tool Studio Build Skin Draft`,
    `# Champion: ${normalizedChampion}`,
    `# Target skin: ${skinToken}`,
    ``,
    `linked: list[string] = {`,
    linkedLines,
    `}`,
    ``,
    `# Paste or import VfxSystemDefinitionData blocks below`,
    `# then use Build Skin Output to save your draft .py file.`,
    ``,
  ].join("\n");
}

function uniqueMatches(content: string, regex: RegExp, limit = 5): string[] {
  const values: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const value = (match[1] || "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(value);
    if (values.length >= limit) break;
  }
  return values;
}

function describeVfxSystemBlock(systemPath: string, particleName: string, text: string): string {
  const emitters = uniqueMatches(text, /emitterName\s*:\s*string\s*=\s*"([^"]+)"/gi, 4);
  const textures = uniqueMatches(text, /texture\s*:\s*string\s*=\s*"([^"]+)"/gi, 3)
    .map((value) => value.split("/").pop() || value)
    .filter(Boolean);
  const sound = uniqueMatches(text, /(?:soundOnCreateDefault|voiceOverOnCreateDefault)\s*:\s*string\s*=\s*"([^"]+)"/gi, 1)[0];

  const abilityToken = (particleName.match(/_(Q|W|E|R|P|Passive|Recall|Emote|Dance|Joke|Taunt|Death|Respawn)_/i)?.[1] || "").toUpperCase();
  const skinToken = systemPath.match(/\/skins\/(base|skin\d+)/i)?.[1] || "";

  const parts: string[] = [];
  if (abilityToken) parts.push(`ability ${abilityToken}`);
  if (skinToken) parts.push(`skin ${normalizeSkinToken(skinToken)}`);
  if (emitters.length > 0) parts.push(`emitters: ${emitters.join(", ")}`);
  if (textures.length > 0) parts.push(`textures: ${textures.join(", ")}`);
  if (sound) parts.push(`sound: ${sound}`);

  return parts.join(" | ") || `system ${particleName}`;
}

function extractVfxBlocks(content: string): VfxBlock[] {
  const startRegex = /(?:"([^"]+)"|([A-Za-z0-9_./:-]+))\s*=\s*VfxSystemDefinitionData\s*\{/g;
  const blocks: VfxBlock[] = [];
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = startRegex.exec(content)) !== null) {
    const openIndex = content.indexOf("{", match.index);
    if (openIndex < 0) continue;
    const closeIndex = findMatchingBrace(content, openIndex);
    if (closeIndex < 0) continue;

    const systemPath = match[1] || match[2] || "UnknownPath";
    const text = content.slice(match.index, closeIndex + 1);
    const particleNameMatch = text.match(/particleName\s*:\s*string\s*=\s*"([^"]+)"/i);
    const particleName = particleNameMatch?.[1] || systemPath.split("/").pop() || `System ${index + 1}`;
    const shortPath = systemPath.split("/").slice(-3).join("/");
    const summary = describeVfxSystemBlock(systemPath, particleName, text);
    blocks.push({
      id: `block-${index}`,
      label: `${particleName} (${shortPath})`,
      summary,
      systemPath,
      particleName,
      start: match.index,
      end: closeIndex + 1,
      text,
    });
    index += 1;
    startRegex.lastIndex = closeIndex + 1;
  }

  return blocks;
}

function analyzeVfxContentHealth(content: string): VfxHealthReport {
  const warnings: string[] = [];
  const fixableWarnings: string[] = [];
  const openBraces = (content.match(/\{/g) || []).length;
  const closeBraces = (content.match(/\}/g) || []).length;

  if (openBraces !== closeBraces) {
    fixableWarnings.push(`Brace mismatch detected: {=${openBraces}, }=${closeBraces}.`);
  }

  if (/\}\s*\}\s*\}\s*$/m.test(content)) {
    fixableWarnings.push("Possible extra closing braces at end of file (common merge/copy issue).");
  }

  const systems = extractVfxBlocks(content);
  if (systems.length === 0) {
    warnings.push("No VfxSystemDefinitionData blocks detected.");
  }

  const blendlessBlackTextures = [...content.matchAll(/texture\s*:\s*string\s*=\s*"([^"]*black[^"]*)"/gi)].length;
  if (blendlessBlackTextures > 0) {
    warnings.push(
      `Detected ${blendlessBlackTextures} texture path(s) with \"black\". Review blendMode consistency (Runeforge guideline: black backgrounds often use blendMode 4).`,
    );
  }

  const valueColorBlocks = [...content.matchAll(/(birthColor|color)\s*:\s*embed\s*=\s*ValueColor\s*\{/g)].length;
  if (valueColorBlocks === 0) {
    warnings.push("No ValueColor blocks found (birthColor/color).");
  }

  return { warnings, fixableWarnings };
}

function autoFixVfxContent(content: string): VfxAutoFixResult {
  let text = content.replace(/\u0000/g, "").replace(/\r\n/g, "\n");
  const appliedFixes: string[] = [];

  if (text !== content) {
    appliedFixes.push("Normalized line endings and removed null characters.");
  }

  const openBraces = (text.match(/\{/g) || []).length;
  const closeBraces = (text.match(/\}/g) || []).length;

  if (closeBraces > openBraces) {
    let removeCount = closeBraces - openBraces;
    while (removeCount > 0) {
      const idx = text.lastIndexOf("}");
      if (idx < 0) break;
      text = `${text.slice(0, idx)}${text.slice(idx + 1)}`;
      removeCount -= 1;
    }
    appliedFixes.push("Removed extra closing braces at file tail.");
  }

  if (openBraces > closeBraces) {
    const addCount = openBraces - closeBraces;
    text = `${text.trimEnd()}\n${"}\n".repeat(addCount)}`;
    appliedFixes.push("Added missing closing braces at file tail.");
  }

  if (/\n{4,}/.test(text)) {
    text = text.replace(/\n{4,}/g, "\n\n\n");
    appliedFixes.push("Collapsed excessive blank lines.");
  }

  return { text, appliedFixes };
}

function fileStableKey(file: File): string {
  return `${file.name}-${file.lastModified}-${file.size}`;
}

function extractVfxSlots(content: string): VfxSlot[] {
  const num = String.raw`[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?f?`;
  const startRegex = /(birthColor|color)\s*:\s*embed\s*=\s*ValueColor\s*\{/g;
  const vec4Regex = new RegExp(String.raw`\{\s*(${num})\s*,\s*(${num})\s*,\s*(${num})\s*,\s*(${num})\s*\}`, "g");
  const slots: VfxSlot[] = [];

  let blockMatch: RegExpExecArray | null;
  let slotIndex = 0;
  while ((blockMatch = startRegex.exec(content)) !== null) {
    const openIndex = content.indexOf("{", blockMatch.index);
    if (openIndex < 0) continue;
    const closeIndex = findMatchingBrace(content, openIndex);
    if (closeIndex < 0) continue;
    const blockText = content.slice(blockMatch.index, closeIndex + 1);
    const blockType = blockMatch[1] === "birthColor" ? "birthColor" : "color";
    let vecMatch: RegExpExecArray | null;
    while ((vecMatch = vec4Regex.exec(blockText)) !== null) {
      const rv = Number.parseFloat(vecMatch[1].replace(/f$/i, ""));
      const gv = Number.parseFloat(vecMatch[2].replace(/f$/i, ""));
      const bv = Number.parseFloat(vecMatch[3].replace(/f$/i, ""));
      if (![rv, gv, bv].every(Number.isFinite)) continue;
      const maxComp = Math.max(Math.abs(rv), Math.abs(gv), Math.abs(bv));
      const scale: 1 | 255 = maxComp > 1.5 ? 255 : 1;
      const sourceRgb: RGB = [
        Math.round(clamp01(rv / scale) * 255),
        Math.round(clamp01(gv / scale) * 255),
        Math.round(clamp01(bv / scale) * 255),
      ];

      const absoluteStart = blockMatch.index + vecMatch.index;
      const absoluteEnd = absoluteStart + vecMatch[0].length;
      slots.push({
        id: `slot-${slotIndex}`,
        label: `${blockType === "birthColor" ? "Birth" : "Color"} ${slotIndex + 1}`,
        blockType,
        sourceRgb,
        targetRgb: sourceRgb,
        scale,
        hasFloatSuffix: /f$/i.test(vecMatch[1]) || /f$/i.test(vecMatch[2]) || /f$/i.test(vecMatch[3]),
        alphaToken: vecMatch[4],
        start: absoluteStart,
        end: absoluteEnd,
      });
      slotIndex += 1;
    }
    startRegex.lastIndex = closeIndex + 1;
  }

  return slots;
}

const VFX_DB_NAME = "chroma-tool-studio-vfx-db";
const VFX_DB_STORE = "library";

function openVfxDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(VFX_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(VFX_DB_STORE)) {
        db.createObjectStore(VFX_DB_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open VFX library database."));
  });
}

async function listVfxLibraryEntries(): Promise<VfxLibraryEntry[]> {
  const db = await openVfxDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VFX_DB_STORE, "readonly");
    const store = tx.objectStore(VFX_DB_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const result = (req.result as Partial<VfxLibraryEntry>[])
        .map((entry) => ({
          id: entry.id || crypto.randomUUID(),
          name: entry.name || "unknown.py",
          baseKey: entry.baseKey || normalizeVfxBaseKey(entry.name || "unknown"),
          champion: entry.champion || "unknown",
          skin: entry.skin || "skin0",
          sourcePath: entry.sourcePath || entry.name || "unknown.py",
          content: entry.content || "",
          slotCount: entry.slotCount || 0,
          blockCount: entry.blockCount || 0,
          updatedAt: entry.updatedAt || Date.now(),
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(result);
    };
    req.onerror = () => reject(req.error ?? new Error("Failed to read VFX library."));
  });
}

async function putVfxLibraryEntry(entry: VfxLibraryEntry): Promise<void> {
  const db = await openVfxDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VFX_DB_STORE, "readwrite");
    tx.objectStore(VFX_DB_STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to store VFX file in local database."));
  });
}

async function deleteVfxLibraryEntry(id: string): Promise<void> {
  const db = await openVfxDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VFX_DB_STORE, "readwrite");
    tx.objectStore(VFX_DB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to delete VFX library entry."));
  });
}

async function clearVfxLibraryEntries(): Promise<void> {
  const db = await openVfxDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VFX_DB_STORE, "readwrite");
    tx.objectStore(VFX_DB_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to clear VFX library."));
  });
}

async function saveToWebDirectoryHandle(handle: FileSystemDirectoryHandle, relativePath: string, content: Blob | string): Promise<void> {
  const safePath = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = safePath.split("/").filter(Boolean);
  if (parts.length === 0) throw new Error("Invalid output file path.");

  let current = handle;
  for (let i = 0; i < parts.length - 1; i += 1) {
    current = await current.getDirectoryHandle(parts[i], { create: true });
  }

  const fileName = parts[parts.length - 1];
  const fileHandle = await current.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("assets");
  const { t } = useI18n();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [splashOpen, setSplashOpen] = useState(true);
  useEffect(() => { if (!splashOpen) return; const tm = window.setTimeout(() => { setSplashOpen(false); }, 5000); return () => window.clearTimeout(tm); }, [splashOpen]);
  const [pngAssets, setPngAssets] = useState<PngAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [recolorFile, setRecolorFile] = useState<File | null>(null);
  const [vfxFiles, setVfxFiles] = useState<File[]>([]);
  const [skinFiles, setSkinFiles] = useState<File[]>([]);
  const [animationFiles, setAnimationFiles] = useState<File[]>([]);
  const [vfxBlocksByFile, setVfxBlocksByFile] = useState<Record<string, VfxBlock[]>>({});
  const [vfxTextByFile, setVfxTextByFile] = useState<Record<string, string>>({});
  const [vfxVirtualPathByKey, setVfxVirtualPathByKey] = useState<Record<string, string>>({});
  const [vfxHealthByFile, setVfxHealthByFile] = useState<Record<string, VfxHealthReport>>({});
  const [vfxMetaByFile, setVfxMetaByFile] = useState<Record<string, VfxFileMeta>>({});
  const [vfxFileTypeByKey, setVfxFileTypeByKey] = useState<Record<string, PythonKind>>({});
  const [selectedVfxKey, setSelectedVfxKey] = useState<string>("");
  const [libraryEntries, setLibraryEntries] = useState<VfxLibraryEntry[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryChampionFilter, setLibraryChampionFilter] = useState<string>("all");
  const [librarySkinFilter, setLibrarySkinFilter] = useState<string>("all");
  const [selectedCurrentBlockIds, setSelectedCurrentBlockIds] = useState<string[]>([]);
  const [selectedLibraryBlockIds, setSelectedLibraryBlockIds] = useState<string[]>([]);
  const [settings, setSettings] = useState<ProcessingSettings>(DEFAULT_SETTINGS);
  const [vfxColor, setVfxColor] = useState<RGB>([140, 185, 255]);
  const [vfxMode, setVfxMode] = useState<VfxMode>("safe");
  const [vfxAutoFixEnabled, setVfxAutoFixEnabled] = useState(true);
  const [outputDir, setOutputDir] = useState<string>("");
  const [status, setStatus] = useState<Status>({ label: "Ready", detail: "Load DDS assets or VFX files to begin.", progress: 0 });
  const [running, setRunning] = useState(false);
  const [selectedPresetName, setSelectedPresetName] = useState<string>(PRESET_LIBRARY[0].name);
  const [previewMode, setPreviewMode] = useState<"side" | "split" | "blink">("side");
  const [splitPos, setSplitPos] = useState(0.52);
  const [blinkPreviewProcessed, setBlinkPreviewProcessed] = useState(true);
  const [previewStats, setPreviewStats] = useState<RecolorStats>({ eligiblePixels: 0, recoloredPixels: 0 });
  const [previewUncoveredMapUrl, setPreviewUncoveredMapUrl] = useState<string | null>(null);
  const [assetBuildErrors, setAssetBuildErrors] = useState<string[]>([]);
  const [lastVfxChangeCount, setLastVfxChangeCount] = useState(0);
  const [lastVfxFixes, setLastVfxFixes] = useState<string[]>([]);
  const [appVersion, setAppVersion] = useState<string>("1.0.0");
  const [updateBannerOpen, setUpdateBannerOpen] = useState(false);
  const [updatePhase, setUpdatePhase] = useState<"idle" | "available" | "downloading" | "downloaded" | "error">("idle");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateError, setUpdateError] = useState("");

  // Build Skin tab is intentionally disabled for now. Keep users in stable flows only.
  useEffect(() => {
    if (activeTab === "vfxLibrary") {
      setActiveTab("vfxRecolor");
    }
  }, [activeTab]);
  const [libraryEditorText, setLibraryEditorText] = useState("");
  const [buildChampion, setBuildChampion] = useState("Unknown");
  const [buildSkinTarget, setBuildSkinTarget] = useState("skin0");
  const [buildDraftPath, setBuildDraftPath] = useState("data/characters/champion/skins/skin0.py");

  const pngFolderInputRef = useRef<HTMLInputElement | null>(null);
  const pngFilesInputRef = useRef<HTMLInputElement | null>(null);
  const vfxInputRef = useRef<HTMLInputElement | null>(null);
  const buildSkinUploadInputRef = useRef<HTMLInputElement | null>(null);
  const analysisMapRef = useRef<Record<string, ImageData>>({});
  const previewPanelRef = useRef<HTMLDivElement | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const webOutputHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  const isElectronRuntime = /Electron/i.test(navigator.userAgent);
  const isDesktop = Boolean(window.desktopBridge);

  const updaterApi = window.desktopBridge?.updater;

  useEffect(() => {
    pngFolderInputRef.current?.setAttribute("webkitdirectory", "");
    pngFolderInputRef.current?.setAttribute("directory", "");
    buildSkinUploadInputRef.current?.setAttribute("webkitdirectory", "");
    buildSkinUploadInputRef.current?.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    if (!isDesktop || !updaterApi) return;

    updaterApi.getAppVersion().then((version) => setAppVersion(version || "1.0.0")).catch(() => undefined);

    const unsubscribe = updaterApi.onEvent((event) => {
      if (!event || !event.type) return;

      if (event.type === "available") {
        setUpdateInfo(event.info ?? null);
        setUpdatePhase("available");
        setUpdateProgress(0);
        setUpdateError("");
        setUpdateBannerOpen(true);
        return;
      }

      if (event.type === "downloading") {
        setUpdatePhase("downloading");
        setUpdateProgress(Math.max(0, Math.min(100, Math.round(event.percent ?? 0))));
        setUpdateBannerOpen(true);
        return;
      }

      if (event.type === "downloaded") {
        setUpdateInfo((prev) => event.info ?? prev);
        setUpdatePhase("downloaded");
        setUpdateProgress(100);
        setUpdateBannerOpen(true);
        return;
      }

      if (event.type === "error") {
        setUpdatePhase("error");
        setUpdateError(event.message || "Update failed.");
        setUpdateBannerOpen(true);
      }
    });

    updaterApi.checkForUpdates().catch(() => undefined);

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isDesktop, updaterApi]);

  const startUpdaterDownload = async () => {
    if (!updaterApi) return;
    setUpdatePhase("downloading");
    setUpdateBannerOpen(true);
    setUpdateError("");
    const result = await updaterApi.downloadUpdate();
    if (!result?.ok && result?.error) {
      setUpdatePhase("error");
      setUpdateError(result.error);
    }
  };

  const installDownloadedUpdate = async () => {
    if (!updaterApi) return;
    await updaterApi.installUpdate();
  };

  useEffect(() => {
    const raw = localStorage.getItem("chroma-tool-studio:settings");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<ProcessingSettings> & {
        vfxColor?: RGB;
        vfxMode?: VfxMode;
        preset?: string;
        vfxAutoFixEnabled?: boolean;
      };
      setSettings((prev) => ({
        intensity: parsed.intensity ?? prev.intensity,
        saturationBoost: parsed.saturationBoost ?? prev.saturationBoost,
        neutralProtection: parsed.neutralProtection ?? prev.neutralProtection,
        alphaMin: parsed.alphaMin ?? prev.alphaMin,
      }));
      if (parsed.vfxColor) setVfxColor(parsed.vfxColor);
      if (parsed.vfxMode) setVfxMode(parsed.vfxMode);
      if (typeof parsed.vfxAutoFixEnabled === "boolean") setVfxAutoFixEnabled(parsed.vfxAutoFixEnabled);
      if (parsed.preset && PRESET_LIBRARY.some((item) => item.name === parsed.preset)) {
        setSelectedPresetName(parsed.preset);
      }
    } catch {
      // Ignore invalid persisted settings.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "chroma-tool-studio:settings",
      JSON.stringify({ ...settings, vfxColor, vfxMode, vfxAutoFixEnabled, preset: selectedPresetName }),
    );
  }, [settings, vfxColor, vfxMode, vfxAutoFixEnabled, selectedPresetName]);

  useEffect(() => {
    if (previewMode !== "blink") return;
    const timer = window.setInterval(() => setBlinkPreviewProcessed((prev) => !prev), 800);
    return () => window.clearInterval(timer);
  }, [previewMode]);

  const selectedAsset = useMemo(
    () => (selectedAssetId ? pngAssets.find((asset) => asset.id === selectedAssetId) ?? null : null),
    [pngAssets, selectedAssetId],
  );

  const assetFolders = useMemo(() => {
    const roots = new Set<string>();
    for (const asset of pngAssets) {
      if (!asset.file.webkitRelativePath) continue;
      const root = asset.file.webkitRelativePath.split("/")[0];
      if (root) roots.add(root);
    }
    return [...roots].sort();
  }, [pngAssets]);

  const ensureAssetAnalyzed = async (assetId: string, force = false) => {
    const asset = pngAssets.find((item) => item.id === assetId);
    if (!asset) return;
    if (asset.analyzed && !force) return;

    setStatus({ label: "Analyzing", detail: `Detecting zones for ${asset.file.name}...`, progress: 8 });
    const proxy = await assetFileToImageData(asset.file, { maxDimension: 760 });
    analysisMapRef.current[asset.id] = proxy;
    const zones = detectZones(proxy, settings.alphaMin);
    const previewOriginal = imageDataToDataUrl(proxy);
    const previewProcessed = zones.length > 0 ? imageDataToDataUrl(recolorImageData(proxy, zones, settings)) : null;

    setPngAssets((prev) =>
      prev.map((item) =>
        item.id === asset.id
          ? {
              ...item,
              analyzed: true,
              zones,
              previewOriginal,
              previewProcessed,
            }
          : item,
      ),
    );

    setStatus({ label: "Detected", detail: `${asset.file.name}: ${zones.length} editable zones ready.`, progress: 18 });
  };

  const loadPngAssets = async (files: File[]) => {
    const dds = files.filter((f) => f.name.toLowerCase().endsWith(".dds"));
    if (dds.length === 0) {
      setPngAssets([]);
      setSelectedAssetId(null);
      analysisMapRef.current = {};
      setStatus({ label: "Ready", detail: "No DDS found in this selection.", progress: 0 });
      setAssetBuildErrors([]);
      return;
    }

    const sorted = [...dds].sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name));
    const nextAssets: PngAsset[] = sorted.map((file, index) => ({
      id: fileKey(file, index),
      file,
      relativePath: file.webkitRelativePath || `assets/${file.name}`,
      zones: [],
      analyzed: false,
      previewOriginal: null,
      previewProcessed: null,
    }));

    analysisMapRef.current = {};
    setAssetBuildErrors([]);
    setPngAssets(nextAssets);
    setSelectedAssetId(nextAssets[0].id);
    setActiveTab("assets");
    await ensureAssetAnalyzed(nextAssets[0].id, true);
    setStatus({ label: "Assets loaded", detail: `${nextAssets.length} DDS file(s) selected.`, progress: 10 });
  };

  const refreshLibraryEntries = async () => {
    const entries = await listVfxLibraryEntries();
    setLibraryEntries(entries);
    if (entries.length > 0 && !entries.some((item) => item.id === selectedLibraryId)) {
      setSelectedLibraryId(entries[0].id);
    }
  };

  useEffect(() => {
    refreshLibraryEntries().catch(() => {
      setStatus((prev) => ({ ...prev, label: "Library error", detail: "Unable to load local VFX library database." }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getVfxPath = (file: File): string => vfxVirtualPathByKey[fileStableKey(file)] || file.webkitRelativePath || file.name;

  const loadRecolorFile = async (files: File[]) => {
    const py = files.filter((f) => f.name.toLowerCase().endsWith(".py"));
    if (py.length === 0) {
      setStatus({ label: "VFX Recolor", detail: "No .py file found in this selection.", progress: 0 });
      return;
    }

    const file = py[0];
    const key = fileStableKey(file);
    const text = await file.text();
    const blocks = extractVfxBlocks(text);
    const health = analyzeVfxContentHealth(text);
    const sourcePath = getVfxPath(file);
    const meta = inferChampionAndSkin(sourcePath, text);

    setRecolorFile(file);
    setVfxTextByFile((prev) => ({ ...prev, [key]: text }));
    setVfxBlocksByFile((prev) => ({ ...prev, [key]: blocks }));
    setVfxHealthByFile((prev) => ({ ...prev, [key]: health }));
    setVfxMetaByFile((prev) => ({ ...prev, [key]: meta }));
    setVfxFileTypeByKey((prev) => ({ ...prev, [key]: "vfx" }));
    setStatus({
      label: "VFX Recolor",
      detail: `Loaded single file for recolor: ${sourcePath}`,
      progress: 10,
    });
  };

  const ingestPythonContentRecords = async (
    records: Array<{ file: File; content: string; relativePath: string; kind: PythonKind }>,
    mode: "library" | "recolor",
  ) => {
    if (records.length === 0) return;

    const newBlockMap: Record<string, VfxBlock[]> = {};
    const newHealthMap: Record<string, VfxHealthReport> = {};
    const newMetaMap: Record<string, VfxFileMeta> = {};
    const newTypeMap: Record<string, PythonKind> = {};
    const newTextMap: Record<string, string> = {};
    const newPathMap: Record<string, string> = {};

    for (const item of records) {
      const key = fileStableKey(item.file);
      const text = item.content;
      newTextMap[key] = text;
      newPathMap[key] = item.relativePath;
      newBlockMap[key] = extractVfxBlocks(text);
      newHealthMap[key] = analyzeVfxContentHealth(text);
      newMetaMap[key] = inferChampionAndSkin(item.relativePath, text);
      newTypeMap[key] = item.kind;
    }

    setVfxTextByFile((prev) => ({ ...prev, ...newTextMap }));
    setVfxVirtualPathByKey((prev) => ({ ...prev, ...newPathMap }));
    setVfxBlocksByFile((prev) => ({ ...prev, ...newBlockMap }));
    setVfxHealthByFile((prev) => ({ ...prev, ...newHealthMap }));
    setVfxMetaByFile((prev) => ({ ...prev, ...newMetaMap }));
    setVfxFileTypeByKey((prev) => ({ ...prev, ...newTypeMap }));

    if (mode === "recolor") {
      const first = records[0];
      setRecolorFile(first.file);
      setStatus({ label: "VFX Recolor", detail: `Loaded single file for recolor: ${first.relativePath}`, progress: 10 });
      return;
    }

    setVfxFiles((prev) => {
      const map = new Map(prev.map((file) => [fileStableKey(file), file]));
      for (const item of records.filter((x) => x.kind === "vfx")) map.set(fileStableKey(item.file), item.file);
      return [...map.values()];
    });
    setSkinFiles((prev) => {
      const map = new Map(prev.map((file) => [fileStableKey(file), file]));
      for (const item of records.filter((x) => x.kind === "skin")) map.set(fileStableKey(item.file), item.file);
      return [...map.values()];
    });
    setAnimationFiles((prev) => {
      const map = new Map(prev.map((file) => [fileStableKey(file), file]));
      for (const item of records.filter((x) => x.kind === "animation")) map.set(fileStableKey(item.file), item.file);
      return [...map.values()];
    });

    setSelectedVfxKey((prev) => prev || fileStableKey(records[0].file));
    setSelectedCurrentBlockIds([]);
    setSelectedLibraryBlockIds([]);
  };

  const loadBuildSkinSources = async (files: File[]) => {
    const accepted = files.filter((f) => f.name.toLowerCase().endsWith(".py"));
    if (accepted.length === 0) {
      setStatus({ label: "Build Skin", detail: "No .py files found. Build Skin now works with Python exports only.", progress: 0 });
      return;
    }

    const records = await Promise.all(accepted.map(async (file) => {
      const text = await file.text();
      const relativePath = file.webkitRelativePath || file.name;
      return {
        file,
        content: text,
        relativePath,
        kind: inferPythonKind(relativePath, text),
      } as const;
    }));
    await ingestPythonContentRecords(records, "library");
    await importVfxToLibrary(accepted);
    const champions = new Set(records.map((entry) => inferChampionAndSkin(entry.relativePath, entry.content).champion));
    setStatus({
      label: "Build Skin",
      detail: `${records.length} .py file(s) loaded. Champions detected: ${[...champions].slice(0, 6).join(", ")}`,
      progress: 20,
    });
  };

  const startNewSkinBuild = () => {
    const selectedChampion = championKey(buildChampion);
    if (!selectedChampion || selectedChampion === "unknown") {
      setStatus({ label: "Build Skin", detail: "Select a champion first.", progress: 0 });
      return;
    }

    const allFiles = [...libraryPythonFiles];
    const linked = new Set<string>();
    for (const file of allFiles) {
      const key = fileStableKey(file);
      const meta = vfxMetaByFile[key];
      if (!meta || championKey(meta.champion) !== selectedChampion) continue;
      const text = vfxTextByFile[key] || "";
      for (const item of extractLinkedBinPaths(text)) linked.add(item);
    }

    const championName = championDisplay(buildChampion);
    const nextSkin = normalizeSkinToken(buildSkinTarget);
    const draftText = buildSkinDraftTemplate(championName, nextSkin, [...linked]);
    const draftPath = `data/characters/${selectedChampion}/skins/${nextSkin}.py`;
    setBuildDraftPath(draftPath);
    setLibraryEditorText(draftText);
    setSelectedVfxKey("");
    setSelectedCurrentBlockIds([]);
    setSelectedLibraryBlockIds([]);
    setStatus({
      label: "Build Skin",
      detail: `Started new ${nextSkin} draft for ${championName} with ${linked.size} linked paths prefilled.`,
      progress: 28,
    });
  };

  const importVfxToLibrary = async (files: File[]) => {
    const py = files.filter((f) => f.name.toLowerCase().endsWith(".py"));
    if (py.length === 0) {
      setStatus({ label: "Library", detail: "No .py files found for library import.", progress: 0 });
      return;
    }

    let stored = 0;
    let fixedCount = 0;
    for (const file of py) {
      const content = await file.text();
      const fixed = autoFixVfxContent(content);
      if (fixed.appliedFixes.length > 0) fixedCount += 1;
      const slots = extractVfxSlots(fixed.text);
      const blocks = extractVfxBlocks(fixed.text);
      const sourcePath = getVfxPath(file);
      const meta = inferChampionAndSkin(sourcePath, fixed.text);
      const id = `${normalizeVfxBaseKey(file.name)}-${sourcePath.toLowerCase()}`;
      await putVfxLibraryEntry({
        id,
        name: file.name,
        baseKey: normalizeVfxBaseKey(file.name),
        champion: meta.champion,
        skin: meta.skin,
        sourcePath,
        content: fixed.text,
        slotCount: slots.length,
        blockCount: blocks.length,
        updatedAt: Date.now(),
      });
      stored += 1;
    }

    await refreshLibraryEntries();
    setStatus({
      label: "Library updated",
      detail: `${stored} VFX file(s) stored in local database.${fixedCount > 0 ? ` Auto-fixed: ${fixedCount}.` : ""}`,
      progress: 100,
    });
  };

  const rebuildLibraryMetadata = async () => {
    if (libraryEntries.length === 0) {
      setStatus({ label: "Library", detail: "No entries available to reindex.", progress: 0 });
      return;
    }

    setRunning(true);
    try {
      let updated = 0;
      for (let i = 0; i < libraryEntries.length; i += 1) {
        const entry = libraryEntries[i];
        const meta = inferChampionAndSkin(entry.sourcePath || entry.name, entry.content);
        const championChanged = championKey(meta.champion) !== championKey(entry.champion);
        const skinChanged = normalizeSkinToken(meta.skin) !== normalizeSkinToken(entry.skin);
        if (championChanged || skinChanged) {
          await putVfxLibraryEntry({
            ...entry,
            champion: meta.champion,
            skin: meta.skin,
            updatedAt: Date.now(),
          });
          updated += 1;
        }
        setStatus({
          label: "Library Reindex",
          detail: `Reindexing metadata ${i + 1}/${libraryEntries.length}`,
          progress: Math.round(((i + 1) / libraryEntries.length) * 100),
        });
      }
      await refreshLibraryEntries();
      setStatus({ label: "Library Reindex", detail: `Metadata updated for ${updated} file(s).`, progress: 100 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to rebuild library metadata.";
      setStatus({ label: "Library", detail: message, progress: 0 });
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (!selectedAssetId) return;
    const asset = pngAssets.find((item) => item.id === selectedAssetId);
    if (!asset || asset.analyzed) return;
    ensureAssetAnalyzed(selectedAssetId).catch(() => {
      setStatus((prev) => ({ ...prev, label: "Analyze error", detail: "Failed to detect zones for selected file." }));
    });
  }, [pngAssets, selectedAssetId]);

  useEffect(() => {
    if (!selectedAsset || !selectedAsset.analyzed || activeTab !== "assets") return;
    if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
    let cancelled = false;

    previewTimerRef.current = window.setTimeout(() => {
      try {
        const source = analysisMapRef.current[selectedAsset.id];
        if (!source || selectedAsset.zones.length === 0) return;
        const next = recolorImageDataDetailed(source, selectedAsset.zones, settings);
        const previewProcessed = imageDataToDataUrl(next.imageData);
        const previewUncovered = imageDataToDataUrl(next.uncoveredMap);
        if (cancelled) return;
        setPreviewStats(next.stats);
        setPreviewUncoveredMapUrl(previewUncovered);
        setPngAssets((prev) => prev.map((asset) => (asset.id === selectedAsset.id ? { ...asset, previewProcessed } : asset)));
      } catch {
        if (!cancelled) {
          setStatus((prev) => ({ ...prev, label: "Preview error", detail: "Unable to render selected preview." }));
        }
      }
    }, 130);

    return () => {
      cancelled = true;
      if (previewTimerRef.current) {
        window.clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
    };
  }, [activeTab, selectedAsset?.id, selectedAsset?.zones, settings]);

  const updateSelectedZones = (mutate: (zones: Zone[]) => Zone[]) => {
    if (!selectedAssetId) return;
    setPngAssets((prev) => prev.map((asset) => (asset.id === selectedAssetId ? { ...asset, zones: mutate(asset.zones) } : asset)));
  };

  const selectedPreset = useMemo(
    () => PRESET_LIBRARY.find((preset) => preset.name === selectedPresetName) ?? PRESET_LIBRARY[0],
    [selectedPresetName],
  );

  const libraryPythonFiles = useMemo(() => {
    const map = new Map<string, File>();
    for (const file of [...vfxFiles, ...skinFiles, ...animationFiles]) {
      map.set(fileStableKey(file), file);
    }
    return [...map.values()];
  }, [vfxFiles, skinFiles, animationFiles]);

  const recolorFileKey = recolorFile ? fileStableKey(recolorFile) : "";

  const selectedVfxFile = useMemo(
    () => libraryPythonFiles.find((file) => fileStableKey(file) === selectedVfxKey) ?? null,
    [libraryPythonFiles, selectedVfxKey],
  );
  const currentBuildFiles = useMemo(() => {
    const priority = (file: File): number => {
      const kind = vfxFileTypeByKey[fileStableKey(file)] ?? "vfx";
      if (kind === "skin") return 0;
      if (kind === "vfx") return 1;
      return 2;
    };
    return [...libraryPythonFiles].sort((a, b) => {
      const pa = priority(a);
      const pb = priority(b);
      if (pa !== pb) return pa - pb;
      return getVfxPath(a).localeCompare(getVfxPath(b));
    });
  }, [libraryPythonFiles, vfxFileTypeByKey, vfxVirtualPathByKey]);
  const selectedBuildFile = useMemo(
    () => currentBuildFiles.find((file) => fileStableKey(file) === selectedVfxKey) ?? selectedVfxFile,
    [currentBuildFiles, selectedVfxKey, selectedVfxFile],
  );

  const selectedVfxBlocks = useMemo(() => {
    if (!selectedVfxKey) return [];
    if (activeTab === "vfxLibrary" && libraryEditorText.trim().length > 0) {
      return extractVfxBlocks(libraryEditorText);
    }
    return vfxBlocksByFile[selectedVfxKey] ?? [];
  }, [activeTab, libraryEditorText, selectedVfxKey, vfxBlocksByFile]);
  const selectedRecolorHealth = recolorFileKey ? vfxHealthByFile[recolorFileKey] ?? { warnings: [], fixableWarnings: [] } : { warnings: [], fixableWarnings: [] };

  const selectedLibraryBlocks = useMemo(() => {
    const entry = libraryEntries.find((item) => item.id === selectedLibraryId);
    return entry ? extractVfxBlocks(entry.content) : [];
  }, [libraryEntries, selectedLibraryId]);

  const libraryChampionOptions = useMemo(() => {
    const values = new Set<string>();
    for (const entry of libraryEntries) values.add(entry.champion || "unknown");
    return ["all", ...[...values].sort()];
  }, [libraryEntries]);

  const librarySkinOptions = useMemo(() => {
    const values = new Set<string>();
    for (const entry of libraryEntries) values.add(entry.skin || "skin0");
    return ["all", ...[...values].sort()];
  }, [libraryEntries]);

  const buildChampionOptions = useMemo(() => {
    const values = new Set<string>();
    for (const file of libraryPythonFiles) {
      const meta = vfxMetaByFile[fileStableKey(file)];
      if (meta?.champion) values.add(meta.champion);
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [libraryPythonFiles, vfxMetaByFile]);

  const buildChampionLinkedPaths = useMemo(() => {
    const selectedChampion = championKey(buildChampion);
    if (!selectedChampion || selectedChampion === "unknown") return [] as string[];
    const paths = new Set<string>();
    for (const file of libraryPythonFiles) {
      const key = fileStableKey(file);
      const meta = vfxMetaByFile[key];
      if (!meta || championKey(meta.champion) !== selectedChampion) continue;
      const text = vfxTextByFile[key] || "";
      for (const value of extractLinkedBinPaths(text)) {
        paths.add(value);
      }
    }
    return [...paths].sort((a, b) => a.localeCompare(b));
  }, [buildChampion, libraryPythonFiles, vfxMetaByFile, vfxTextByFile]);

  const filteredLibraryEntries = useMemo(() => {
    const query = librarySearch.trim().toLowerCase();
    return libraryEntries.filter((item) => {
      if (libraryChampionFilter !== "all" && championKey(item.champion) !== championKey(libraryChampionFilter)) return false;
      if (librarySkinFilter !== "all" && normalizeSkinToken(item.skin) !== normalizeSkinToken(librarySkinFilter)) return false;
      if (!query) return true;
      return (
        item.name.toLowerCase().includes(query)
        || item.baseKey.includes(query)
        || item.champion.toLowerCase().includes(query)
        || item.skin.toLowerCase().includes(query)
      );
    });
  }, [libraryEntries, librarySearch, libraryChampionFilter, librarySkinFilter]);

  const selectedLibraryEntry = useMemo(
    () => libraryEntries.find((item) => item.id === selectedLibraryId) ?? null,
    [libraryEntries, selectedLibraryId],
  );

  useEffect(() => {
    if (buildChampionOptions.length === 0) {
      setBuildChampion("Unknown");
      return;
    }
    if (!buildChampionOptions.includes(buildChampion)) {
      setBuildChampion(buildChampionOptions[0]);
    }
  }, [buildChampion, buildChampionOptions]);

  useEffect(() => {
    setSelectedCurrentBlockIds([]);
  }, [selectedVfxKey]);

  useEffect(() => {
    if (activeTab !== "vfxLibrary") return;
    if (!selectedBuildFile) {
      return;
    }
    const key = fileStableKey(selectedBuildFile);
    const cached = vfxTextByFile[key];
    if (typeof cached === "string") {
      setLibraryEditorText(cached);
      return;
    }
    selectedBuildFile.text().then((text) => {
      setVfxTextByFile((prev) => ({ ...prev, [key]: text }));
      setLibraryEditorText(text);
    }).catch(() => {
      setLibraryEditorText("");
    });
  }, [activeTab, selectedBuildFile, vfxTextByFile]);

  useEffect(() => {
    if (activeTab !== "vfxLibrary") return;
    if (!selectedVfxKey) return;
    setVfxTextByFile((prev) => {
      if (prev[selectedVfxKey] === libraryEditorText) return prev;
      return { ...prev, [selectedVfxKey]: libraryEditorText };
    });
  }, [activeTab, libraryEditorText, selectedVfxKey]);

  useEffect(() => {
    setSelectedLibraryBlockIds([]);
  }, [selectedLibraryId]);

  const autoMatchLibraryBySkinName = () => {
    if (!selectedBuildFile) return;
    const key = normalizeVfxBaseKey(selectedBuildFile.name);
    const fileKeyValue = fileStableKey(selectedBuildFile);
    const meta = vfxMetaByFile[fileKeyValue] ?? inferChampionAndSkin(getVfxPath(selectedBuildFile));
    const selectedChampionKey = championKey(meta.champion);
    const candidate =
      libraryEntries.find((entry) => entry.baseKey === key && championKey(entry.champion) === selectedChampionKey && entry.skin === meta.skin)
      ?? libraryEntries.find((entry) => entry.baseKey === key && championKey(entry.champion) === selectedChampionKey)
      ?? libraryEntries.find((entry) => entry.baseKey.includes(key) || key.includes(entry.baseKey));
    if (!candidate) {
      setStatus({ label: "Library", detail: "No smart match found for selected file (skin0/skin1 normalized).", progress: 0 });
      return;
    }
    setSelectedLibraryId(candidate.id);
    setStatus({ label: "Library", detail: `Smart matched reference: ${candidate.name}`, progress: 24 });
  };

  const applyPresetToSelectedAsset = () => {
    if (!selectedAssetId) return;
    updateSelectedZones((zones) => zones.map((zone) => (zone.enabled ? { ...zone, targetRgb: selectedPreset.color } : zone)));
  };

  const applyPresetToAllAssets = () => {
    if (pngAssets.length === 0) return;
    setPngAssets((prev) =>
      prev.map((asset) => ({
        ...asset,
        zones: asset.zones.map((zone) => (zone.enabled ? { ...zone, targetRgb: selectedPreset.color } : zone)),
      })),
    );
    setStatus({ label: "Preset applied", detail: `Applied ${selectedPreset.name} to all loaded DDS profiles.`, progress: status.progress });
  };

  const togglePreviewFullscreen = async () => {
    if (!previewPanelRef.current || typeof document === "undefined") return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await previewPanelRef.current.requestFullscreen();
      }
    } catch {
      setStatus((prev) => ({ ...prev, label: "Preview", detail: "Fullscreen preview is unavailable in this environment." }));
    }
  };

  const applySelectedProfileToAllAssets = () => {
    if (!selectedAsset) return;
    const sourceZones = selectedAsset.zones;
    if (sourceZones.length === 0) return;

    setPngAssets((prev) =>
      prev.map((asset) => {
        if (asset.id === selectedAsset.id) return asset;
        const zones = asset.zones.map((zone, index) => {
          const sourceZone = sourceZones[index % sourceZones.length];
          return {
            ...zone,
            targetRgb: sourceZone.targetRgb,
            enabled: sourceZone.enabled,
            hueTolerance: sourceZone.hueTolerance,
            satTolerance: sourceZone.satTolerance,
            valTolerance: sourceZone.valTolerance,
          };
        });
        return {
          ...asset,
          zones,
        };
      }),
    );
    setStatus({ label: "Profile applied", detail: "Selected file profile copied to all loaded assets.", progress: status.progress });
  };

  const resolveOutputTarget = async (forcePrompt = false): Promise<OutputTarget | null> => {
    if (isElectronRuntime && !window.desktopBridge) {
      setStatus({
        label: "Desktop bridge unavailable",
        detail: "Desktop integration is unavailable in this build. Reinstall the desktop app.",
        progress: 0,
      });
      return null;
    }

    if (isDesktop) {
      let finalOutputDir = forcePrompt ? "" : outputDir;
      if (!finalOutputDir) {
        finalOutputDir = (await window.desktopBridge?.pickOutputFolder()) ?? "";
        if (!finalOutputDir) return null;
        setOutputDir(finalOutputDir);
      }
      return { kind: "desktop", outputDir: finalOutputDir };
    }

    if (forcePrompt || !webOutputHandleRef.current) {
      if (!window.showDirectoryPicker) {
        setStatus({
          label: "Output unsupported",
          detail: "Folder writing is not available in this browser. Use the desktop app for direct folder output.",
          progress: 0,
        });
        return null;
      }

      try {
        const handle = await window.showDirectoryPicker({ mode: "readwrite" });
        webOutputHandleRef.current = handle;
        setOutputDir(handle.name);
      } catch {
        return null;
      }
    }

    if (!webOutputHandleRef.current) return null;
    return { kind: "web", handle: webOutputHandleRef.current };
  };

  const processAssets = async () => {
    if (pngAssets.length === 0) {
      setStatus({ label: "Nothing to process", detail: "Load DDS files first.", progress: 0 });
      return;
    }

    setRunning(true);
    try {
      setAssetBuildErrors([]);
      const outputTarget = await resolveOutputTarget(true);
      if (!outputTarget) {
        setStatus({ label: "Cancelled", detail: "No output folder selected.", progress: 0 });
        return;
      }

      const failed: string[] = [];
      let successCount = 0;

      for (let i = 0; i < pngAssets.length; i += 1) {
        const asset = pngAssets[i];
        setStatus({
          label: "DDS",
          detail: `Recoloring ${asset.relativePath}`,
          progress: Math.round((i / pngAssets.length) * 100),
        });

        try {
          const zones = asset.zones.length > 0 ? asset.zones : detectZones(await assetFileToImageData(asset.file, { maxDimension: 760 }), settings.alphaMin);
          const blob = await recolorAssetToBlob(asset.file, zones, settings);

          if (outputTarget.kind === "desktop") {
            if (!window.desktopBridge) throw new Error("Desktop bridge unavailable.");
            const result = await window.desktopBridge.saveBinaryFile(outputTarget.outputDir, asset.relativePath, await blob.arrayBuffer());
            if (!result.ok) throw new Error(result.error || `Failed writing ${asset.relativePath}`);
          } else {
            await saveToWebDirectoryHandle(outputTarget.handle, asset.relativePath, blob);
          }
          successCount += 1;
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Unknown recolor error";
          failed.push(`${asset.relativePath}: ${reason}`);
        }
      }

      setAssetBuildErrors(failed);

      setStatus({
        label: failed.length > 0 ? "Completed with errors" : "Completed",
        detail:
          outputTarget.kind === "desktop"
            ? `${successCount}/${pngAssets.length} DDS saved in: ${outputTarget.outputDir}${failed.length > 0 ? ` | Failed: ${failed.length}` : ""}`
            : `${successCount}/${pngAssets.length} DDS saved in selected folder: ${outputTarget.handle.name}${failed.length > 0 ? ` | Failed: ${failed.length}` : ""}`,
        progress: 100,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown DDS processing error.";
      setStatus({ label: "Error", detail: message, progress: 0 });
    } finally {
      setRunning(false);
    }
  };

  const processVfx = async () => {
    if (!recolorFile) {
      setStatus({ label: "Nothing to process", detail: "Load one .py file in VFX Recolor first.", progress: 0 });
      return;
    }

    setRunning(true);
    try {
      const outputTarget = await resolveOutputTarget(true);
      if (!outputTarget) {
        setStatus({ label: "Cancelled", detail: "No output folder selected.", progress: 0 });
        return;
      }

      let totalChanges = 0;
      const appliedFixes: string[] = [];
      const file = recolorFile;
      const key = fileStableKey(file);
      const kind = vfxFileTypeByKey[key] ?? "vfx";
      const relativePath = getVfxPath(file) || `${kind}/${file.name}`;
      setStatus({
        label: "VFX",
        detail: `Recoloring ${relativePath}`,
        progress: 35,
      });

      const sourceText = vfxTextByFile[key] ?? await file.text();
      const fixed = vfxAutoFixEnabled ? autoFixVfxContent(sourceText) : { text: sourceText, appliedFixes: [] };
      if (fixed.appliedFixes.length > 0) {
        appliedFixes.push(`${file.name}: ${fixed.appliedFixes.join(" ")}`);
      }
      const recolored = recolorVfxText(fixed.text, vfxColor, vfxMode);
      totalChanges += recolored.changes;

      if (outputTarget.kind === "desktop") {
        if (!window.desktopBridge) throw new Error("Desktop bridge unavailable.");
        const result = await window.desktopBridge.saveTextFile(outputTarget.outputDir, relativePath, recolored.text);
        if (!result.ok) throw new Error(result.error || `Failed writing ${relativePath}`);
      } else {
        await saveToWebDirectoryHandle(outputTarget.handle, relativePath, recolored.text);
      }
      setLastVfxChangeCount(totalChanges);
      setLastVfxFixes(appliedFixes);

      setStatus({
        label: "Completed",
        detail:
          outputTarget.kind === "desktop"
            ? `VFX files generated in: ${outputTarget.outputDir} (${totalChanges} color vectors updated)`
            : `VFX files generated in selected folder: ${outputTarget.handle.name} (${totalChanges} color vectors updated)`,
        progress: 100,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown VFX processing error.";
      setStatus({ label: "Error", detail: message, progress: 0 });
    } finally {
      setRunning(false);
    }
  };

  const processVfxLibrary = async () => {
    if (!selectedBuildFile && !buildDraftPath) {
      setStatus({ label: "Nothing to process", detail: "Select a target .py file or start a new skin draft.", progress: 0 });
      return;
    }

    setRunning(true);
    try {
      const outputTarget = await resolveOutputTarget(true);
      if (!outputTarget) {
        setStatus({ label: "Cancelled", detail: "No output folder selected.", progress: 0 });
        return;
      }

      const selectedType = selectedVfxKey ? (vfxFileTypeByKey[selectedVfxKey] ?? "vfx") : "skin";
      const relativePath = selectedBuildFile
        ? (getVfxPath(selectedBuildFile) || `${selectedType}/${selectedBuildFile.name}`)
        : buildDraftPath;
      setStatus({ label: "VFX Library", detail: `Applying VFX system mapping to ${relativePath}`, progress: 50 });
      const sourceText = selectedBuildFile
        ? (libraryEditorText || vfxTextByFile[selectedVfxKey] || await selectedBuildFile.text())
        : libraryEditorText;
      const fixed = vfxAutoFixEnabled ? autoFixVfxContent(sourceText) : { text: sourceText, appliedFixes: [] };
      setLastVfxFixes(fixed.appliedFixes);
      const currentBlocks = extractVfxBlocks(fixed.text);
      const removable = currentBlocks.filter((block) => selectedCurrentBlockIds.includes(block.id)).sort((a, b) => b.start - a.start);
      let outputText = fixed.text;
      for (const block of removable) {
        outputText = `${outputText.slice(0, block.start)}${outputText.slice(block.end)}`;
      }

      const selectedReferenceBlocks = selectedLibraryBlocks.filter((block) => selectedLibraryBlockIds.includes(block.id));
      if (selectedReferenceBlocks.length > 0) {
        outputText += `\n\n# Imported VFX systems by Chroma Tool Studio from ${selectedLibraryEntry?.name ?? "library reference"}\n`;
        outputText += selectedReferenceBlocks.map((block) => block.text).join("\n\n");
      }

      if (outputTarget.kind === "desktop") {
        if (!window.desktopBridge) throw new Error("Desktop bridge unavailable.");
        const result = await window.desktopBridge.saveTextFile(outputTarget.outputDir, relativePath, outputText);
        if (!result.ok) throw new Error(result.error || `Failed writing ${relativePath}`);
      } else {
        await saveToWebDirectoryHandle(outputTarget.handle, relativePath, outputText);
      }

      setLastVfxChangeCount(0);
      setStatus({
        label: "Completed",
        detail:
          outputTarget.kind === "desktop"
            ? `VFX merge output generated in: ${outputTarget.outputDir} (removed ${removable.length}, imported ${selectedReferenceBlocks.length} systems)`
            : `VFX merge output generated in selected folder: ${outputTarget.handle.name} (removed ${removable.length}, imported ${selectedReferenceBlocks.length} systems)`,
        progress: 100,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown VFX library processing error.";
      setStatus({ label: "Error", detail: message, progress: 0 });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-zinc-950 text-zinc-100">
      <motion.header
        className="relative overflow-hidden border-b border-white/10"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_10%,rgba(56,189,248,0.24),transparent_42%),radial-gradient(circle_at_80%_15%,rgba(167,139,250,0.24),transparent_38%)]" />
        <div className="relative mx-auto w-full max-w-7xl px-6 py-3 lg:px-10">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold tracking-tight text-white">{t("topbar.appName")}</h1>
              <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-200">v2.0</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setChangelogOpen(true)} title={t("topbar.changelog")} className="flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-zinc-200 transition hover:bg-white/10">📋 {t("topbar.changelog")}</button>
              <button type="button" onClick={() => setSettingsOpen(true)} title={t("topbar.settings")} className="flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-zinc-200 transition hover:bg-white/10">⚙ {t("topbar.settings")}</button>
            </div>
          </div>
        </div>
      </motion.header>

      {isDesktop && updateBannerOpen && (
        <div className="mx-auto mt-4 w-full max-w-7xl px-6 lg:px-10">
          <div className="rounded-lg border border-cyan-300/30 bg-cyan-500/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-cyan-100">
                  {updatePhase === "downloaded"
                    ? "Update ready to install"
                    : updatePhase === "downloading"
                      ? "Downloading update"
                      : updatePhase === "error"
                        ? "Update failed"
                        : "New update available"}
                </p>
                <p className="mt-1 text-xs text-zinc-300">
                  {updatePhase === "error"
                    ? updateError || "Could not update now."
                    : updateInfo?.version
                      ? `Current ${appVersion} -> Latest ${updateInfo.version}`
                      : `Current ${appVersion}`}
                </p>
                {updateInfo?.releaseNotes && (updatePhase === "available" || updatePhase === "downloaded") && (
                  <p className="mt-2 max-h-20 overflow-auto whitespace-pre-wrap text-xs text-zinc-400">{updateInfo.releaseNotes}</p>
                )}
                {updatePhase === "downloading" && (
                  <p className="mt-2 text-xs text-zinc-300">Progress: {updateProgress}%</p>
                )}
              </div>
              <div className="flex gap-2">
                {updatePhase === "available" && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setUpdateBannerOpen(false);
                      }}
                      className="h-9 rounded-lg border border-white/20 bg-white/5 px-3 text-sm text-zinc-200 transition hover:bg-white/10"
                    >
                      Continue Without Updating
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        startUpdaterDownload().catch(() => undefined);
                      }}
                      className="h-9 rounded-lg bg-cyan-400 px-3 text-sm font-medium text-zinc-950 transition hover:bg-cyan-300"
                    >
                      Update Now
                    </button>
                  </>
                )}
                {updatePhase === "downloading" && (
                  <button
                    type="button"
                    onClick={() => setUpdateBannerOpen(false)}
                    className="h-9 rounded-lg border border-white/20 bg-white/5 px-3 text-sm text-zinc-200 transition hover:bg-white/10"
                  >
                    Hide
                  </button>
                )}
                {updatePhase === "downloaded" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setUpdateBannerOpen(false)}
                      className="h-9 rounded-lg border border-white/20 bg-white/5 px-3 text-sm text-zinc-200 transition hover:bg-white/10"
                    >
                      Later
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        installDownloadedUpdate().catch(() => undefined);
                      }}
                      className="h-9 rounded-lg bg-cyan-400 px-3 text-sm font-medium text-zinc-950 transition hover:bg-cyan-300"
                    >
                      Install and Restart
                    </button>
                  </>
                )}
                {updatePhase === "error" && (
                  <button
                    type="button"
                    onClick={() => setUpdateBannerOpen(false)}
                    className="h-9 rounded-lg border border-white/20 bg-white/5 px-3 text-sm text-zinc-200 transition hover:bg-white/10"
                  >
                    Continue Without Updating
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <main className={`mx-auto w-full px-6 py-4 lg:px-10 ${activeTab === "vfxBlockEditor" ? "max-w-[1800px]" : "grid max-w-7xl gap-8 lg:grid-cols-[1.28fr_0.72fr]"}`}>
        <section className="space-y-6">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setActiveTab("assets")}
              className={`h-10 rounded-lg px-4 text-sm transition ${
                activeTab === "assets" ? "bg-cyan-400 text-zinc-950" : "border border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"
              }`}
            >
              {t("tabs.assets")}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("vfxRecolor")}
              className={`h-10 rounded-lg px-4 text-sm transition ${
                activeTab === "vfxRecolor" ? "bg-cyan-400 text-zinc-950" : "border border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"
              }`}
            >
              {t("tabs.vfxRecolor")}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("vfxBlockEditor")}
              className={`h-10 rounded-lg px-4 text-sm transition ${
                activeTab === "vfxBlockEditor" ? "bg-cyan-400 text-zinc-950" : "border border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"
              }`}
            >
              {t("tabs.vfxBlockEditor")}
            </button>
          </div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            <h2 className="text-xl font-medium text-white">
              {activeTab === "assets" ? t("app.assetIntake") : activeTab === "vfxBlockEditor" ? t("tabs.vfxBlockEditor") : t("app.vfxRecolorIntake")}
            </h2>
            {activeTab === "vfxBlockEditor" ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/40" style={{ height: "calc(100vh - 220px)", minHeight: "600px" }}>
                <VfxBlockEditorTab />
              </div>
            ) : activeTab === "assets" ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  className="h-12 rounded-lg border border-white/15 bg-white/5 px-4 text-left transition hover:bg-white/10"
                  onClick={() => pngFolderInputRef.current?.click()}
                >
                  {t("app.loadDdsFolder")}
                </button>
                <button
                  type="button"
                  className="h-12 rounded-lg border border-white/15 bg-white/5 px-4 text-left transition hover:bg-white/10"
                  onClick={() => pngFilesInputRef.current?.click()}
                >
                  {t("app.loadDdsFiles")}
                </button>
              </div>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-1">
                <button
                  type="button"
                  className="h-12 w-full rounded-lg border border-white/15 bg-white/5 px-4 text-left transition hover:bg-white/10"
                  onClick={() => vfxInputRef.current?.click()}
                >
                  {t("app.loadSingleVfx")}
                </button>
              </div>
            )}

            <input
              ref={pngFolderInputRef}
              type="file"
              multiple
              accept=".dds"
              className="hidden"
              onChange={async (e) => {
                const files = [...(e.target.files ?? [])];
                await loadPngAssets(files);
              }}
            />
            <input
              ref={pngFilesInputRef}
              type="file"
              multiple
              accept=".dds"
              className="hidden"
              onChange={async (e) => {
                const files = [...(e.target.files ?? [])];
                await loadPngAssets(files);
              }}
            />
            <input
              ref={vfxInputRef}
              type="file"
              multiple={false}
              accept=".py,text/x-python"
              className="hidden"
              onChange={async (e) => {
                await loadRecolorFile([...(e.target.files ?? [])]);
              }}
            />
            <input
              ref={buildSkinUploadInputRef}
              type="file"
              multiple
              accept=".py,text/x-python"
              className="hidden"
              onChange={async (e) => {
                await loadBuildSkinSources([...(e.target.files ?? [])]);
              }}
            />
          </motion.div>

          {activeTab === "assets" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.06 }}>
              <h2 className="text-xl font-medium text-white">{t("app.selectedAssetSources")}</h2>
              <div className="mt-3 text-xs text-zinc-400">
                {assetFolders.length > 0 ? `Folders: ${assetFolders.join(", ")}` : "Loaded by file selection"}
              </div>
              <div className="mt-3 max-h-28 overflow-auto rounded-lg border border-white/10 bg-white/[0.03] p-2 text-xs text-zinc-300">
                {pngAssets.length === 0 ? (
                  <p className="text-zinc-500">{t("app.noDdsFilesSelected")}</p>
                ) : (
                  pngAssets.map((asset) => <div key={asset.id}>{asset.relativePath}</div>)
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-medium text-white">{t("app.ddsProfilesPerFile")}</h2>
                <span className="text-xs text-zinc-400">{pngAssets.length} DDS loaded</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <select
                  value={selectedAssetId ?? ""}
                  onChange={(e) => setSelectedAssetId(e.target.value || null)}
                  className="min-w-[330px] rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                >
                  {pngAssets.length === 0 && <option value="">{t("app.noDdsLoaded")}</option>}
                  {pngAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.relativePath}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedAssetId || running}
                  onClick={() => selectedAssetId && ensureAssetAnalyzed(selectedAssetId, true)}
                  className="h-10 rounded-lg border border-white/20 bg-white/5 px-4 text-sm transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("app.reDetectSelected")}
                </button>
                <button
                  type="button"
                  disabled={!selectedAssetId || running}
                  onClick={applySelectedProfileToAllAssets}
                  className="h-10 rounded-lg border border-white/20 bg-white/5 px-4 text-sm transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("app.applyProfileToAll")}
                </button>
              </div>

              <p className="mt-3 text-sm text-zinc-400">{t("app.eachDdsHasZones")}</p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100">
                <span className="font-medium">{t("app.ddsSupport")}</span>
                <span>DXT1 / DXT3 / DXT5 (BC1 / BC2 / BC3)</span>
              </div>

              <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.04] p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs uppercase tracking-[0.12em] text-zinc-400">Preset Library ({PRESET_LIBRARY.length})</label>
                  <select
                    value={selectedPresetName}
                    onChange={(e) => setSelectedPresetName(e.target.value)}
                    className="min-w-[260px] rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                  >
                    {PRESET_LIBRARY.map((preset) => (
                      <option key={preset.name} value={preset.name}>
                        {preset.family} - {preset.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={applyPresetToSelectedAsset}
                    className="h-9 rounded-lg bg-cyan-400 px-3 text-sm font-medium text-zinc-950 transition hover:bg-cyan-300"
                  >
                    {t("app.applyPresetEnabled")}
                  </button>
                  <button
                    type="button"
                    onClick={applyPresetToAllAssets}
                    className="h-9 rounded-lg border border-white/20 bg-white/5 px-3 text-sm transition hover:bg-white/10"
                  >
                    {t("app.applyPresetAllFiles")}
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-3 text-xs text-zinc-300">
                  <span className="h-6 w-6 rounded border border-white/20" style={{ backgroundColor: rgbToHex(selectedPreset.color) }} />
                  <span>
                    {selectedPreset.family} preset selected: <strong>{selectedPreset.name}</strong>
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {(selectedAsset?.zones ?? []).length === 0 && <p className="text-sm text-zinc-500">{t("app.noZonesDetected")}</p>}
                {(selectedAsset?.zones ?? []).map((zone) => (
                  <div key={zone.id} className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-3 md:grid-cols-[auto_auto_1fr_auto_auto] md:items-center">
                    <input
                      type="checkbox"
                      checked={zone.enabled}
                      onChange={(e) =>
                        updateSelectedZones((zones) => zones.map((z) => (z.id === zone.id ? { ...z, enabled: e.target.checked } : z)))
                      }
                      className="h-4 w-4"
                    />
                    <div className="flex items-center gap-2">
                      <span className="h-6 w-6 rounded border border-black/40" style={{ backgroundColor: rgbToHex(zone.sourceRgb) }} />
                      <span className="text-sm text-zinc-200">{zone.name}</span>
                    </div>
                    <div className="text-xs text-zinc-400">Pixels sampled: {zone.pixels.toLocaleString()}</div>
                    <input
                      type="color"
                      value={rgbToHex(zone.targetRgb)}
                      onChange={(e) =>
                        updateSelectedZones((zones) => zones.map((z) => (z.id === zone.id ? { ...z, targetRgb: hexToRgb(e.target.value) } : z)))
                      }
                      className="h-9 w-14 rounded border border-white/20 bg-transparent"
                    />
                    <span className="text-xs text-zinc-400">{t("app.target")}</span>

                    <div className="md:col-span-5 grid gap-2 md:grid-cols-3">
                      <label className="text-xs text-zinc-400">
                        {t("app.hueMatch")}
                        <input
                          type="range"
                          min={0.06}
                          max={0.35}
                          step={0.01}
                          value={zone.hueTolerance}
                          onChange={(e) =>
                            updateSelectedZones((zones) =>
                              zones.map((z) => (z.id === zone.id ? { ...z, hueTolerance: Number(e.target.value) } : z)),
                            )
                          }
                          className="w-full"
                        />
                      </label>
                      <label className="text-xs text-zinc-400">
                        {t("app.saturationMatch")}
                        <input
                          type="range"
                          min={0.2}
                          max={1.4}
                          step={0.01}
                          value={zone.satTolerance}
                          onChange={(e) =>
                            updateSelectedZones((zones) =>
                              zones.map((z) => (z.id === zone.id ? { ...z, satTolerance: Number(e.target.value) } : z)),
                            )
                          }
                          className="w-full"
                        />
                      </label>
                      <label className="text-xs text-zinc-400">
                        {t("app.valueMatch")}
                        <input
                          type="range"
                          min={0.2}
                          max={1.4}
                          step={0.01}
                          value={zone.valTolerance}
                          onChange={(e) =>
                            updateSelectedZones((zones) =>
                              zones.map((z) => (z.id === zone.id ? { ...z, valTolerance: Number(e.target.value) } : z)),
                            )
                          }
                          className="w-full"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === "vfxRecolor" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.06 }}>
              <h2 className="text-xl font-medium text-white">{t("app.vfxRecolorSettings")}</h2>
              <label className="mt-4 block text-sm text-zinc-300">
                {t("app.vfxParserMode")}
                <select
                  value={vfxMode}
                  onChange={(e) => setVfxMode(e.target.value as VfxMode)}
                  className="mt-2 w-full rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                >
                  <option value="safe">{t("app.vfxModeSafe")}</option>
                  <option value="aggressive">{t("app.vfxModeAggressive")}</option>
                </select>
              </label>
              <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={vfxAutoFixEnabled}
                  onChange={(e) => setVfxAutoFixEnabled(e.target.checked)}
                />
                Enable Safe Auto-Fix (braces, line endings, common paste issues)
              </label>
              <label className="mt-4 block text-sm text-zinc-300">
                Exclusive VFX Color
                <input
                  type="color"
                  value={rgbToHex(vfxColor)}
                  onChange={(e) => setVfxColor(hexToRgb(e.target.value))}
                  className="mt-2 h-10 w-full rounded border border-white/20 bg-transparent"
                />
              </label>
              <button
                type="button"
                onClick={() => setVfxColor(selectedPreset.color)}
                className="mt-3 h-9 rounded-lg border border-white/20 bg-white/5 px-3 text-sm transition hover:bg-white/10"
              >
                Use Selected Preset Color ({selectedPreset.name})
              </button>

              <div className="mt-6">
                <h3 className="text-lg font-medium text-white">{t("app.selectedPythonFile")}</h3>
                <p className="mt-2 text-xs text-zinc-400">
                  VFX Recolor works on one file at a time to keep edits isolated.
                </p>
                <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-white/10 bg-white/[0.03] p-2 text-xs text-zinc-300">
                  {!recolorFile ? (
                    <p className="text-zinc-500">{t("app.noPySelected")}</p>
                  ) : (
                    <div>
                      {(() => {
                        const key = fileStableKey(recolorFile);
                        const meta = vfxMetaByFile[key];
                        return `[VFX] ${getVfxPath(recolorFile)}${meta ? ` | ${meta.champion}/${meta.skin} (${meta.confidence})` : ""}`;
                      })()}
                    </div>
                  )}
                </div>
                {recolorFileKey && (
                  <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-zinc-300">
                    <p className="text-zinc-200">{t("app.fileHealthCheck")}</p>
                    <p className="mt-1 text-zinc-500">Fixable: {selectedRecolorHealth.fixableWarnings.length} | Warnings: {selectedRecolorHealth.warnings.length}</p>
                    {selectedRecolorHealth.fixableWarnings.length > 0 && (
                      <ul className="mt-2 space-y-1 text-amber-300">
                        {selectedRecolorHealth.fixableWarnings.slice(0, 4).map((item) => (
                          <li key={item}>- {item}</li>
                        ))}
                      </ul>
                    )}
                    {selectedRecolorHealth.warnings.length > 0 && (
                      <ul className="mt-2 space-y-1 text-zinc-400">
                        {selectedRecolorHealth.warnings.slice(0, 4).map((item) => (
                          <li key={item}>- {item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === "vfxLibrary" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.06 }}>
              <h2 className="text-xl font-medium text-white">Build Skin Studio</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Start from a clean skin draft, then import full VFX systems from cached references and edit the output in real time.
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <label className="text-xs uppercase tracking-[0.12em] text-zinc-400">
                  Champion
                  <select
                    value={buildChampion}
                    onChange={(e) => setBuildChampion(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                  >
                    {buildChampionOptions.length === 0 && <option value="Unknown">No champion detected</option>}
                    {buildChampionOptions.map((champion) => (
                      <option key={champion} value={champion}>{champion}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs uppercase tracking-[0.12em] text-zinc-400">
                  Target Skin
                  <input
                    value={buildSkinTarget}
                    onChange={(e) => setBuildSkinTarget(normalizeSkinToken(e.target.value))}
                    placeholder="skin0"
                    className="mt-2 w-full rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                  />
                </label>
                <button
                  type="button"
                  onClick={startNewSkinBuild}
                  className="mt-5 h-10 rounded-lg border border-cyan-300/40 bg-cyan-400/15 px-3 text-sm text-cyan-100 transition hover:bg-cyan-400/25"
                >
                  Start New Skin Draft
                </button>
              </div>

              <p className="mt-2 break-all text-xs text-zinc-500">Draft output path: {buildDraftPath}</p>
              <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">Champion Linked .bin Paths</p>
                  <p className="text-xs text-zinc-500">{buildChampionLinkedPaths.length}</p>
                </div>
                <div className="mt-2 max-h-28 overflow-auto break-all text-[11px] text-zinc-400">
                  {buildChampionLinkedPaths.length === 0
                    ? "No linked paths extracted yet for selected champion."
                    : buildChampionLinkedPaths.slice(0, 120).map((item) => <div key={item} className="break-all">{item}</div>)}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="text-xs uppercase tracking-[0.12em] text-zinc-400">
                  Target File to Build (prefer skin0/skin1...)
                  <select
                    value={selectedVfxKey}
                    onChange={(e) => setSelectedVfxKey(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                  >
                    {currentBuildFiles.length === 0 && <option value="">No Python files loaded</option>}
                    {currentBuildFiles.map((file) => {
                      const key = fileStableKey(file);
                      const meta = vfxMetaByFile[key];
                      const kind = vfxFileTypeByKey[key] ?? "vfx";
                      return (
                        <option key={key} value={key}>
                          [{kind.toUpperCase()}] 
                          {meta ? `${meta.champion}/${meta.skin} (${meta.confidence}) | ` : ""}
                          {getVfxPath(file)}
                        </option>
                      );
                    })}
                  </select>
                </label>

                <label className="text-xs uppercase tracking-[0.12em] text-zinc-400">
                  Library Search
                  <input
                    value={librarySearch}
                    onChange={(e) => setLibrarySearch(e.target.value)}
                    placeholder="search by file or base key"
                    className="mt-2 w-full rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                  />
                </label>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-xs uppercase tracking-[0.12em] text-zinc-400">
                  Champion Filter
                  <select
                    value={libraryChampionFilter}
                    onChange={(e) => setLibraryChampionFilter(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                  >
                    {libraryChampionOptions.map((champion) => (
                      <option key={champion} value={champion}>
                        {champion}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs uppercase tracking-[0.12em] text-zinc-400">
                  Skin Filter
                  <select
                    value={librarySkinFilter}
                    onChange={(e) => setLibrarySkinFilter(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                  >
                    {librarySkinOptions.map((skin) => (
                      <option key={skin} value={skin}>
                        {skin}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
                <label className="text-xs uppercase tracking-[0.12em] text-zinc-400">
                  Reference from Local Library
                  <select
                    value={selectedLibraryId}
                    onChange={(e) => setSelectedLibraryId(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                  >
                    {filteredLibraryEntries.length === 0 && <option value="">No local library files</option>}
                    {filteredLibraryEntries.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.champion}/{entry.skin} | {entry.name} | slots: {entry.slotCount} | blocks: {entry.blockCount}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={autoMatchLibraryBySkinName}
                  className="h-10 rounded-lg border border-white/20 bg-white/5 px-3 text-sm transition hover:bg-white/10"
                >
                  Smart Match (skin0/skin1)
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    rebuildLibraryMetadata().catch(() => {
                      setStatus({ label: "Library", detail: "Failed to reindex library metadata.", progress: 0 });
                    });
                  }}
                  className="h-9 rounded-lg border border-white/20 bg-white/5 px-3 text-sm transition hover:bg-white/10"
                >
                  Reindex Champion/Skin Metadata
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!selectedLibraryId) return;
                    await deleteVfxLibraryEntry(selectedLibraryId);
                    await refreshLibraryEntries();
                    setStatus({ label: "Library", detail: "Selected reference removed from local database.", progress: 30 });
                  }}
                  className="h-9 rounded-lg border border-red-300/30 bg-red-400/10 px-3 text-sm text-red-200 transition hover:bg-red-400/20"
                >
                  Delete Selected Reference
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await clearVfxLibraryEntries();
                    await refreshLibraryEntries();
                    setSelectedLibraryId("");
                    setStatus({ label: "Library", detail: "Local VFX database cleared.", progress: 20 });
                  }}
                  className="h-9 rounded-lg border border-red-300/30 bg-red-400/10 px-3 text-sm text-red-200 transition hover:bg-red-400/20"
                >
                  Clear Library Cache
                </button>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-medium text-white">Current VFX Systems ({selectedVfxBlocks.length})</h3>
                    <button
                      type="button"
                      onClick={() => setSelectedCurrentBlockIds(selectedVfxBlocks.map((block) => block.id))}
                      className="text-xs text-cyan-300 hover:text-cyan-200"
                    >
                      Select all
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500">Selected VFX systems here will be removed from output file.</p>
                  <div className="max-h-48 space-y-1 overflow-auto rounded-lg border border-white/10 bg-black/30 p-2 text-xs">
                    {selectedVfxBlocks.length === 0 ? (
                      <div className="text-zinc-500">No VFX systems detected in selected file.</div>
                    ) : (
                      selectedVfxBlocks.map((block) => (
                        <label key={block.id} className="flex items-center gap-2 text-zinc-300">
                          <input
                            type="checkbox"
                            checked={selectedCurrentBlockIds.includes(block.id)}
                            onChange={(e) => {
                              setSelectedCurrentBlockIds((prev) =>
                                e.target.checked ? [...prev, block.id] : prev.filter((id) => id !== block.id),
                              );
                            }}
                          />
                          <span>
                            {block.label}
                            <span className="block text-[11px] text-zinc-500">{block.summary}</span>
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-medium text-white">Library VFX Systems ({selectedLibraryBlocks.length})</h3>
                    <button
                      type="button"
                      onClick={() => setSelectedLibraryBlockIds(selectedLibraryBlocks.map((block) => block.id))}
                      className="text-xs text-cyan-300 hover:text-cyan-200"
                    >
                      Select all
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500">Selected systems here will be appended into output file.</p>
                  <div className="max-h-48 space-y-1 overflow-auto rounded-lg border border-white/10 bg-black/30 p-2 text-xs">
                    {selectedLibraryBlocks.length === 0 ? (
                      <div className="text-zinc-500">No VFX systems in selected library reference.</div>
                    ) : (
                      selectedLibraryBlocks.map((block) => (
                        <label key={block.id} className="flex items-center gap-2 text-zinc-300">
                          <input
                            type="checkbox"
                            checked={selectedLibraryBlockIds.includes(block.id)}
                            onChange={(e) => {
                              setSelectedLibraryBlockIds((prev) =>
                                e.target.checked ? [...prev, block.id] : prev.filter((id) => id !== block.id),
                              );
                            }}
                          />
                          <span>
                            {block.label}
                            <span className="block text-[11px] text-zinc-500">{block.summary}</span>
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-white/10 bg-black/30 p-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-medium text-white">Live Target Editor</h3>
                  <span className="text-xs text-zinc-500">Edit target skin/vfx source in real time before build</span>
                </div>
                <textarea
                  value={libraryEditorText}
                  onChange={(e) => setLibraryEditorText(e.target.value)}
                  placeholder="Load a target file to edit here..."
                  className="mt-3 h-56 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200"
                />
              </div>
            </motion.div>
          )}
        </section>

        {activeTab !== "vfxBlockEditor" && (
        <motion.aside
          className="space-y-6"
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, delay: 0.12 }}
        >
          {activeTab === "assets" && (
            <>
              <div ref={previewPanelRef} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-medium text-white">{t("app.selectedFilePreview")}</h2>
                  <button
                    type="button"
                    onClick={togglePreviewFullscreen}
                    className="rounded-md border border-white/15 bg-white/5 px-3 py-1 text-xs text-zinc-200 transition hover:bg-white/10"
                  >
                    Fullscreen
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setPreviewMode("side")}
                    className={`rounded-md px-3 py-1 ${previewMode === "side" ? "bg-cyan-400 text-zinc-950" : "border border-white/15 bg-white/5 text-zinc-300"}`}
                  >
                    Side by Side
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode("split")}
                    className={`rounded-md px-3 py-1 ${previewMode === "split" ? "bg-cyan-400 text-zinc-950" : "border border-white/15 bg-white/5 text-zinc-300"}`}
                  >
                    A/B Split
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode("blink")}
                    className={`rounded-md px-3 py-1 ${previewMode === "blink" ? "bg-cyan-400 text-zinc-950" : "border border-white/15 bg-white/5 text-zinc-300"}`}
                  >
                    Blink Compare
                  </button>
                </div>

                {previewMode === "split" && (
                  <label className="block text-xs text-zinc-400">
                    Split Position {(splitPos * 100).toFixed(0)}%
                    <input type="range" min={0.05} max={0.95} step={0.01} value={splitPos} onChange={(e) => setSplitPos(Number(e.target.value))} className="mt-1 w-full" />
                  </label>
                )}

                {previewMode === "side" && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="overflow-hidden rounded-lg border border-white/10 bg-black/40">
                      {selectedAsset?.previewOriginal ? (
                        <img src={selectedAsset.previewOriginal} alt="Original preview" className="h-72 w-full object-contain" />
                      ) : (
                        <div className="flex h-56 items-center justify-center text-sm text-zinc-500">{t("app.originalPreview")}</div>
                      )}
                    </div>
                    <div className="overflow-hidden rounded-lg border border-cyan-400/20 bg-black/40">
                      {selectedAsset?.previewProcessed ? (
                        <img src={selectedAsset.previewProcessed} alt="Processed preview" className="h-72 w-full object-contain" />
                      ) : (
                        <div className="flex h-56 items-center justify-center text-sm text-zinc-500">{t("app.processedPreview")}</div>
                      )}
                    </div>
                  </div>
                )}

                {previewMode !== "side" && (
                  <div className="relative h-80 overflow-hidden rounded-lg border border-cyan-400/20 bg-black/50">
                    {selectedAsset?.previewOriginal ? (
                      <img src={selectedAsset.previewOriginal} alt="A/B original" className="absolute inset-0 h-full w-full object-contain" />
                    ) : (
                      <div className="flex h-56 items-center justify-center text-sm text-zinc-500">A/B Preview</div>
                    )}

                    {selectedAsset?.previewProcessed && previewMode === "split" && (
                      <div
                        className="pointer-events-none absolute inset-0 overflow-hidden"
                        style={{ clipPath: `inset(0 ${100 - splitPos * 100}% 0 0)` }}
                      >
                        <img src={selectedAsset.previewProcessed} alt="A/B recolored" className="absolute inset-0 h-full w-full object-contain" />
                      </div>
                    )}

                    {selectedAsset?.previewProcessed && previewMode === "blink" && blinkPreviewProcessed && (
                      <img src={selectedAsset.previewProcessed} alt="Blink processed" className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
                    )}
                  </div>
                )}

                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-xs text-zinc-300">
                  <div className="flex items-center justify-between">
                    <span>{t("app.coverage")}</span>
                    <span>
                      {previewStats.recoloredPixels.toLocaleString()} / {previewStats.eligiblePixels.toLocaleString()} px
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-zinc-800">
                    <div
                      className="h-2 rounded-full bg-cyan-400"
                      style={{ width: `${previewStats.eligiblePixels > 0 ? (previewStats.recoloredPixels / previewStats.eligiblePixels) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="mt-2 text-zinc-500">Uncovered heatmap highlights likely tintable pixels that stayed unchanged.</p>
                </div>

                <div className="overflow-hidden rounded-lg border border-amber-400/20 bg-black/40">
                  {previewUncoveredMapUrl ? (
                    <img src={previewUncoveredMapUrl} alt="Uncovered heatmap" className="max-h-40 w-full object-contain" />
                  ) : (
                    <div className="flex h-28 items-center justify-center text-xs text-zinc-500">{t("app.uncoveredHeatmap")}</div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-medium text-white">{t("app.assetProcessingControls")}</h3>
                <label className="block text-sm text-zinc-300">
                  Intensity {settings.intensity.toFixed(2)}
                  <input
                    type="range"
                    min={0.1}
                    max={2.2}
                    step={0.01}
                    value={settings.intensity}
                    onChange={(e) => setSettings((prev) => ({ ...prev, intensity: Number(e.target.value) }))}
                    className="mt-1 w-full"
                  />
                </label>
                <label className="block text-sm text-zinc-300">
                  Saturation Boost {settings.saturationBoost.toFixed(2)}
                  <input
                    type="range"
                    min={0.5}
                    max={2.8}
                    step={0.01}
                    value={settings.saturationBoost}
                    onChange={(e) => setSettings((prev) => ({ ...prev, saturationBoost: Number(e.target.value) }))}
                    className="mt-1 w-full"
                  />
                </label>
                <label className="block text-sm text-zinc-300">
                  Neutral Protection {settings.neutralProtection.toFixed(2)}
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={settings.neutralProtection}
                    onChange={(e) => setSettings((prev) => ({ ...prev, neutralProtection: Number(e.target.value) }))}
                    className="mt-1 w-full"
                  />
                </label>
              </div>
            </>
          )}

          {activeTab === "vfxRecolor" && (
            <div className="space-y-3">
              <h2 className="text-xl font-medium text-white">{t("app.vfxPreview")}</h2>
              <div className="rounded-lg border border-cyan-400/20 bg-black/40 p-4">
                <div className="text-xs uppercase tracking-[0.14em] text-zinc-400">{t("app.selectedVfxColor")}</div>
                <div className="mt-3 h-12 rounded" style={{ backgroundColor: rgbToHex(vfxColor) }} />
                <p className="mt-3 text-xs text-zinc-400">
                  The VFX tab uses an exclusive color map for .py files and does not depend on DDS zone settings.
                </p>
                <p className="mt-2 text-xs text-zinc-500">Last processing updated {lastVfxChangeCount.toLocaleString()} vec4 color entries.</p>
                {lastVfxFixes.length > 0 && (
                  <div className="mt-3 rounded border border-amber-300/30 bg-amber-500/10 p-2 text-xs text-amber-200">
                    <p className="font-medium">Safe auto-fix applied:</p>
                    <ul className="mt-1 space-y-1 text-amber-100/90">
                      {lastVfxFixes.slice(0, 4).map((fix) => (
                        <li key={fix}>- {fix}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "vfxLibrary" && (
            <div className="space-y-3">
              <h2 className="text-xl font-medium text-white">Build Skin Status</h2>
              <div className="rounded-lg border border-cyan-400/20 bg-black/40 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Local Database</p>
                <p className="mt-2 text-sm text-zinc-200">{libraryEntries.length.toLocaleString()} .py references cached on this machine.</p>
                <p className="mt-2 text-xs text-zinc-400">
                  Target systems: {selectedVfxBlocks.length.toLocaleString()} | Reference systems: {selectedLibraryBlocks.length.toLocaleString()}
                </p>
                <p className="mt-2 text-xs text-zinc-500">
                  Champion/Skin: {selectedLibraryEntry ? `${selectedLibraryEntry.champion}/${selectedLibraryEntry.skin}` : "-"}
                </p>
                <p className="mt-2 text-xs text-zinc-500">Library references persist locally until you clear cache from this tab.</p>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-white">{t("app.output")}</span>
              <span className="text-xs text-zinc-400">{t("app.autoPromptOnBuild")}</span>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-zinc-400">
                The build button opens the destination folder picker. If you cancel, processing stops safely.
              </p>
              <p className="break-all text-xs text-zinc-500">Last selected: {outputDir || "None"}</p>
            </div>

            <div className="mt-4 mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-white">{t("app.status")}</span>
              <span className="text-xs text-zinc-400">{status.progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-zinc-800">
              <motion.div className="h-2 rounded-full bg-cyan-400" animate={{ width: `${status.progress}%` }} transition={{ ease: "easeOut", duration: 0.3 }} />
            </div>
            <p className="mt-3 text-sm text-zinc-200">{status.label}</p>
            <p className="text-xs text-zinc-400">{status.detail}</p>
            {activeTab === "assets" && assetBuildErrors.length > 0 && (
              <div className="mt-3 rounded-lg border border-red-300/30 bg-red-500/10 p-2 text-xs text-red-200">
                <p className="font-medium">Skipped defective files ({assetBuildErrors.length})</p>
                <div className="mt-1 max-h-28 overflow-auto space-y-1 text-red-100/90">
                  {assetBuildErrors.map((err) => (
                    <div key={err} className="break-all">- {err}</div>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={activeTab === "assets" ? processAssets : activeTab === "vfxRecolor" ? processVfx : processVfxLibrary}
              disabled={
                running
                || (activeTab === "assets" && pngAssets.length === 0)
                || (activeTab === "vfxRecolor" && !recolorFile)
                || (activeTab === "vfxLibrary" && !selectedBuildFile && !libraryEditorText.trim())
              }
              className="mt-4 h-11 w-full rounded-lg bg-cyan-400 font-medium text-zinc-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {running
                ? "Processing..."
                : activeTab === "assets"
                  ? "Build DDS Asset Output"
                  : activeTab === "vfxRecolor"
                    ? "Build VFX Recolor Output"
                    : "Build Skin Output"}
            </button>
          </div>

          <div className="text-xs text-zinc-500">
            Loaded: {pngAssets.length} DDS | {vfxFiles.length} VFX .py | {skinFiles.length} Skin .py | {animationFiles.length} Animation .py
          </div>
          <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">{t("app.builtBy")}</div>
        </motion.aside>
        )}
      </main>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ChangelogModal open={changelogOpen} onClose={() => setChangelogOpen(false)} />
      <AnimatePresence>
        {splashOpen && (
          <motion.div key="splash" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} onClick={() => setSplashOpen(false)} className="fixed inset-0 z-[3000] flex cursor-pointer items-center justify-center bg-zinc-950">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_10%,rgba(56,189,248,0.3),transparent_42%),radial-gradient(circle_at_80%_15%,rgba(167,139,250,0.3),transparent_38%)]" />
            <motion.div initial={{ opacity: 0, y: 30, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.7, ease: "easeOut" }} className="relative max-w-2xl px-8 text-center">
              <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }} className="text-5xl font-bold tracking-tight text-white md:text-6xl">{t("topbar.appName")}</motion.h1>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.5 }} className="mt-3 inline-block rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-1 text-sm font-semibold text-cyan-200">v2.0 — {t("tabs.vfxBlockEditor")}</motion.div>
              <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.0, duration: 0.5 }} className="mt-6 text-lg text-zinc-300">{t("topbar.appTagline")}</motion.p>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6, duration: 0.5 }} className="mt-8 text-xs uppercase tracking-[0.3em] text-zinc-500">{t("topbar.appCredits")}</motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
