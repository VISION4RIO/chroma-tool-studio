import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import dxt from "dxt-js";
import parseDds from "parse-dds";

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
type OutputTarget = { kind: "desktop"; outputDir: string } | { kind: "web"; handle: FileSystemDirectoryHandle };

declare global {
  interface Window {
    desktopBridge?: {
      pickOutputFolder: () => Promise<string | null>;
      saveBinaryFile: (outputDir: string, relativePath: string, buffer: ArrayBuffer) => Promise<DesktopSaveResult>;
      saveTextFile: (outputDir: string, relativePath: string, content: string) => Promise<DesktopSaveResult>;
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

const PRESET_LIBRARY: Preset[] = [
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
  const targetHsv = rgbToHsv(targetColor);

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

      const sourceHsv = rgbToHsv(sourceRgb);
      const recoloredRgb = hsvToRgb([targetHsv[0], Math.max(sourceHsv[1], targetHsv[1] * 0.8), sourceHsv[2]]);
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
  const targetHsv = rgbToHsv(targetColor);
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
    const sourceHsv = rgbToHsv(sourceRgb);
    const recoloredRgb = hsvToRgb([targetHsv[0], Math.max(sourceHsv[1], targetHsv[1] * 0.72), sourceHsv[2]]);
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
  const [activeTab, setActiveTab] = useState<"assets" | "vfx">("assets");
  const [pngAssets, setPngAssets] = useState<PngAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [vfxFiles, setVfxFiles] = useState<File[]>([]);
  const [settings, setSettings] = useState<ProcessingSettings>(DEFAULT_SETTINGS);
  const [vfxColor, setVfxColor] = useState<RGB>([140, 185, 255]);
  const [vfxMode, setVfxMode] = useState<VfxMode>("safe");
  const [outputDir, setOutputDir] = useState<string>("");
  const [status, setStatus] = useState<Status>({ label: "Ready", detail: "Load DDS assets or VFX files to begin.", progress: 0 });
  const [running, setRunning] = useState(false);
  const [selectedPresetName, setSelectedPresetName] = useState<string>(PRESET_LIBRARY[0].name);
  const [previewMode, setPreviewMode] = useState<"side" | "split" | "blink">("split");
  const [splitPos, setSplitPos] = useState(0.52);
  const [blinkPreviewProcessed, setBlinkPreviewProcessed] = useState(true);
  const [previewStats, setPreviewStats] = useState<RecolorStats>({ eligiblePixels: 0, recoloredPixels: 0 });
  const [previewUncoveredMapUrl, setPreviewUncoveredMapUrl] = useState<string | null>(null);
  const [lastVfxChangeCount, setLastVfxChangeCount] = useState(0);

  const pngFolderInputRef = useRef<HTMLInputElement | null>(null);
  const pngFilesInputRef = useRef<HTMLInputElement | null>(null);
  const vfxInputRef = useRef<HTMLInputElement | null>(null);
  const analysisMapRef = useRef<Record<string, ImageData>>({});
  const previewTimerRef = useRef<number | null>(null);
  const webOutputHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  const isElectronRuntime = /Electron/i.test(navigator.userAgent);
  const isDesktop = Boolean(window.desktopBridge);

  useEffect(() => {
    pngFolderInputRef.current?.setAttribute("webkitdirectory", "");
    pngFolderInputRef.current?.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem("chroma-tool-studio:settings");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<ProcessingSettings> & { vfxColor?: RGB; vfxMode?: VfxMode; preset?: string };
      setSettings((prev) => ({
        intensity: parsed.intensity ?? prev.intensity,
        saturationBoost: parsed.saturationBoost ?? prev.saturationBoost,
        neutralProtection: parsed.neutralProtection ?? prev.neutralProtection,
        alphaMin: parsed.alphaMin ?? prev.alphaMin,
      }));
      if (parsed.vfxColor) setVfxColor(parsed.vfxColor);
      if (parsed.vfxMode) setVfxMode(parsed.vfxMode);
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
      JSON.stringify({ ...settings, vfxColor, vfxMode, preset: selectedPresetName }),
    );
  }, [settings, vfxColor, vfxMode, selectedPresetName]);

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
    setPngAssets(nextAssets);
    setSelectedAssetId(nextAssets[0].id);
    setActiveTab("assets");
    await ensureAssetAnalyzed(nextAssets[0].id, true);
    setStatus({ label: "Assets loaded", detail: `${nextAssets.length} DDS file(s) selected.`, progress: 10 });
  };

  const loadVfxFiles = (files: File[]) => {
    const py = files.filter((f) => f.name.toLowerCase().endsWith(".py"));
    setVfxFiles(py);
    setActiveTab("vfx");
    setStatus({
      label: "VFX loaded",
      detail: py.length > 0 ? `${py.length} VFX .py file(s) selected.` : "No .py file found in this selection.",
      progress: 10,
    });
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

  const applyPresetToSelectedAsset = () => {
    if (!selectedAssetId) return;
    updateSelectedZones((zones) => zones.map((zone) => (zone.enabled ? { ...zone, targetRgb: selectedPreset.color } : zone)));
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

  const chooseOutputFolder = async () => {
    if (isElectronRuntime && !window.desktopBridge) {
      setStatus({
        label: "Desktop bridge unavailable",
        detail: "Desktop integration is unavailable in this build. Reinstall the desktop app.",
        progress: 0,
      });
      return;
    }

    if (window.desktopBridge) {
      const chosen = await window.desktopBridge.pickOutputFolder();
      if (chosen) setOutputDir(chosen);
      return;
    }

    if (!window.showDirectoryPicker) {
      setStatus({
        label: "Output unsupported",
        detail: "Folder writing is not available in this browser. Use the desktop app for direct folder output.",
        progress: 0,
      });
      return;
    }

    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      webOutputHandleRef.current = handle;
      setOutputDir(handle.name);
    } catch {
      // User cancelled folder picker.
    }
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
      const outputTarget = await resolveOutputTarget(true);
      if (!outputTarget) {
        setStatus({ label: "Cancelled", detail: "No output folder selected.", progress: 0 });
        return;
      }

      for (let i = 0; i < pngAssets.length; i += 1) {
        const asset = pngAssets[i];
        setStatus({
          label: "DDS",
          detail: `Recoloring ${asset.relativePath}`,
          progress: Math.round((i / pngAssets.length) * 100),
        });

        const zones = asset.zones.length > 0 ? asset.zones : detectZones(await assetFileToImageData(asset.file, { maxDimension: 760 }), settings.alphaMin);
        const blob = await recolorAssetToBlob(asset.file, zones, settings);

        if (outputTarget.kind === "desktop") {
          if (!window.desktopBridge) throw new Error("Desktop bridge unavailable.");
          const result = await window.desktopBridge.saveBinaryFile(outputTarget.outputDir, asset.relativePath, await blob.arrayBuffer());
          if (!result.ok) throw new Error(result.error || `Failed writing ${asset.relativePath}`);
        } else {
          await saveToWebDirectoryHandle(outputTarget.handle, asset.relativePath, blob);
        }
      }

      setStatus({
        label: "Completed",
        detail:
          outputTarget.kind === "desktop"
            ? `DDS files generated in: ${outputTarget.outputDir}`
            : `DDS files generated in selected folder: ${outputTarget.handle.name}`,
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
    if (vfxFiles.length === 0) {
      setStatus({ label: "Nothing to process", detail: "Load VFX .py files first.", progress: 0 });
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
      for (let i = 0; i < vfxFiles.length; i += 1) {
        const file = vfxFiles[i];
        const relativePath = file.webkitRelativePath || `vfx/${file.name}`;
        setStatus({
          label: "VFX",
          detail: `Recoloring ${relativePath}`,
          progress: Math.round((i / vfxFiles.length) * 100),
        });
        const recolored = recolorVfxText(await file.text(), vfxColor, vfxMode);
        totalChanges += recolored.changes;

        if (outputTarget.kind === "desktop") {
          if (!window.desktopBridge) throw new Error("Desktop bridge unavailable.");
          const result = await window.desktopBridge.saveTextFile(outputTarget.outputDir, relativePath, recolored.text);
          if (!result.ok) throw new Error(result.error || `Failed writing ${relativePath}`);
        } else {
          await saveToWebDirectoryHandle(outputTarget.handle, relativePath, recolored.text);
        }
      }
      setLastVfxChangeCount(totalChanges);

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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <motion.header
        className="relative overflow-hidden border-b border-white/10"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_10%,rgba(56,189,248,0.24),transparent_42%),radial-gradient(circle_at_80%_15%,rgba(167,139,250,0.24),transparent_38%)]" />
        <div className="relative mx-auto w-full max-w-7xl px-6 py-9 lg:px-10">
          <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">Chroma Tool Studio</h1>
          <p className="mt-3 max-w-3xl text-zinc-300">Per-file texture zone detection, individual recolor profiles, and robust VFX .py recolor.</p>
          <p className="mt-3 text-xs uppercase tracking-[0.16em] text-zinc-400">Credits: VISION4RIO</p>
        </div>
      </motion.header>

      <main className="mx-auto grid w-full max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[1.28fr_0.72fr] lg:px-10">
        <section className="space-y-6">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setActiveTab("assets")}
              className={`h-10 rounded-lg px-4 text-sm transition ${
                activeTab === "assets" ? "bg-cyan-400 text-zinc-950" : "border border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"
              }`}
            >
              Assets (DDS)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("vfx")}
              className={`h-10 rounded-lg px-4 text-sm transition ${
                activeTab === "vfx" ? "bg-cyan-400 text-zinc-950" : "border border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"
              }`}
            >
              VFX (.py)
            </button>
          </div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            <h2 className="text-xl font-medium text-white">{activeTab === "assets" ? "Asset Intake" : "VFX Intake"}</h2>
            {activeTab === "assets" ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  className="h-12 rounded-lg border border-white/15 bg-white/5 px-4 text-left transition hover:bg-white/10"
                  onClick={() => pngFolderInputRef.current?.click()}
                >
                  Load DDS Folder
                </button>
                <button
                  type="button"
                  className="h-12 rounded-lg border border-white/15 bg-white/5 px-4 text-left transition hover:bg-white/10"
                  onClick={() => pngFilesInputRef.current?.click()}
                >
                  Load DDS Files
                </button>
              </div>
            ) : (
              <div className="mt-4">
                <button
                  type="button"
                  className="h-12 w-full rounded-lg border border-white/15 bg-white/5 px-4 text-left transition hover:bg-white/10"
                  onClick={() => vfxInputRef.current?.click()}
                >
                  Load VFX Python Files (.py)
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
              multiple
              accept=".py,text/x-python"
              className="hidden"
              onChange={(e) => {
                loadVfxFiles([...(e.target.files ?? [])]);
              }}
            />
          </motion.div>

          {activeTab === "assets" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.06 }}>
              <h2 className="text-xl font-medium text-white">Selected Asset Sources</h2>
              <div className="mt-3 text-xs text-zinc-400">
                {assetFolders.length > 0 ? `Folders: ${assetFolders.join(", ")}` : "Loaded by file selection"}
              </div>
              <div className="mt-3 max-h-28 overflow-auto rounded-lg border border-white/10 bg-white/[0.03] p-2 text-xs text-zinc-300">
                {pngAssets.length === 0 ? (
                  <p className="text-zinc-500">No DDS files selected.</p>
                ) : (
                  pngAssets.map((asset) => <div key={asset.id}>{asset.relativePath}</div>)
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-medium text-white">DDS Profiles Per File</h2>
                <span className="text-xs text-zinc-400">{pngAssets.length} DDS loaded</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <select
                  value={selectedAssetId ?? ""}
                  onChange={(e) => setSelectedAssetId(e.target.value || null)}
                  className="min-w-[330px] rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                >
                  {pngAssets.length === 0 && <option value="">No DDS loaded</option>}
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
                  Re-detect Selected
                </button>
                <button
                  type="button"
                  disabled={!selectedAssetId || running}
                  onClick={applySelectedProfileToAllAssets}
                  className="h-10 rounded-lg border border-white/20 bg-white/5 px-4 text-sm transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Apply Profile to All DDS
                </button>
              </div>

              <p className="mt-3 text-sm text-zinc-400">Each DDS has its own isolated color zones. Edit one file without affecting the others.</p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100">
                <span className="font-medium">DDS support:</span>
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
                    Apply Preset to Enabled Zones
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
                {(selectedAsset?.zones ?? []).length === 0 && <p className="text-sm text-zinc-500">No zones detected for this file yet.</p>}
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
                    <span className="text-xs text-zinc-400">Target</span>

                    <div className="md:col-span-5 grid gap-2 md:grid-cols-3">
                      <label className="text-xs text-zinc-400">
                        Hue Match
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
                        Saturation Match
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
                        Value Match
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

          {activeTab === "vfx" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.06 }}>
              <h2 className="text-xl font-medium text-white">VFX Recolor Settings</h2>
              <label className="mt-4 block text-sm text-zinc-300">
                VFX Parser Mode
                <select
                  value={vfxMode}
                  onChange={(e) => setVfxMode(e.target.value as VfxMode)}
                  className="mt-2 w-full rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                >
                  <option value="safe">Safe (birthColor + color blocks only)</option>
                  <option value="aggressive">Aggressive (all vec4 tuples)</option>
                </select>
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
                <h3 className="text-lg font-medium text-white">Selected VFX Files</h3>
                <p className="mt-2 text-xs text-zinc-400">{vfxFiles.length} file(s) selected.</p>
                <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-white/10 bg-white/[0.03] p-2 text-xs text-zinc-300">
                  {vfxFiles.length === 0 ? (
                    <p className="text-zinc-500">No .py files selected.</p>
                  ) : (
                    vfxFiles.map((file) => <div key={`${file.name}-${file.lastModified}-${file.size}`}>{file.webkitRelativePath || file.name}</div>)
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </section>

        <motion.aside
          className="space-y-6"
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, delay: 0.12 }}
        >
          {activeTab === "assets" && (
            <>
              <div className="space-y-3">
                <h2 className="text-xl font-medium text-white">Selected File Preview</h2>
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
                        <div className="flex h-56 items-center justify-center text-sm text-zinc-500">Original preview</div>
                      )}
                    </div>
                    <div className="overflow-hidden rounded-lg border border-cyan-400/20 bg-black/40">
                      {selectedAsset?.previewProcessed ? (
                        <img src={selectedAsset.previewProcessed} alt="Processed preview" className="h-72 w-full object-contain" />
                      ) : (
                        <div className="flex h-56 items-center justify-center text-sm text-zinc-500">Processed preview</div>
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
                    <span>Coverage</span>
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
                    <div className="flex h-28 items-center justify-center text-xs text-zinc-500">Uncovered heatmap</div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-medium text-white">Asset Processing Controls</h3>
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

          {activeTab === "vfx" && (
            <div className="space-y-3">
              <h2 className="text-xl font-medium text-white">VFX Preview</h2>
              <div className="rounded-lg border border-cyan-400/20 bg-black/40 p-4">
                <div className="text-xs uppercase tracking-[0.14em] text-zinc-400">Selected VFX Color</div>
                <div className="mt-3 h-12 rounded" style={{ backgroundColor: rgbToHex(vfxColor) }} />
                <p className="mt-3 text-xs text-zinc-400">
                  The VFX tab uses an exclusive color map for .py files and does not depend on DDS zone settings.
                </p>
                <p className="mt-2 text-xs text-zinc-500">Last processing updated {lastVfxChangeCount.toLocaleString()} vec4 color entries.</p>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-white">Output</span>
              <span className="text-xs text-zinc-400">Folder</span>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={chooseOutputFolder}
                className="h-10 w-full rounded-lg border border-white/20 bg-white/5 text-sm transition hover:bg-white/10"
              >
                Select Output Folder
              </button>
              <p className="break-all text-xs text-zinc-400">{outputDir || "No folder selected"}</p>
            </div>

            <div className="mt-4 mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-white">Status</span>
              <span className="text-xs text-zinc-400">{status.progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-zinc-800">
              <motion.div className="h-2 rounded-full bg-cyan-400" animate={{ width: `${status.progress}%` }} transition={{ ease: "easeOut", duration: 0.3 }} />
            </div>
            <p className="mt-3 text-sm text-zinc-200">{status.label}</p>
            <p className="text-xs text-zinc-400">{status.detail}</p>

            <button
              type="button"
              onClick={activeTab === "assets" ? processAssets : processVfx}
              disabled={running || (activeTab === "assets" ? pngAssets.length === 0 : vfxFiles.length === 0)}
              className="mt-4 h-11 w-full rounded-lg bg-cyan-400 font-medium text-zinc-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {running ? "Processing..." : activeTab === "assets" ? "Build DDS Asset Output" : "Build VFX Output"}
            </button>
          </div>

          <div className="text-xs text-zinc-500">Loaded: {pngAssets.length} DDS | {vfxFiles.length} VFX files</div>
          <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">Built by VISION4RIO</div>
        </motion.aside>
      </main>
    </div>
  );
}
