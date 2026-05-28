# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2026-05-28

### Added
- **🆕 New tab "VFX Block Editor"** — per-block editing of every `.py` (Ritobin) file.
  Lets you tweak colors, sizes, lifetimes, textures, blend modes and dozens of
  other parameters on a single VFX block at a time, without affecting the rest
  of the file (great for surgical edits where the existing VFX Recolor tab is
  too broad).
  - Lossless `.py` parser/serializer (round-trip verified on 28+ files,
    428k+ lines).
  - Block catalog with per-ability filter (Q / W / E / R / Passive / Basic Attack
    / Recall / Emote / Death / Other).
  - 20+ field categories auto-detected (color, scale, lifetime, rate, velocity,
    rotation, position, uv, texture, asset, rendering, alpha, erosion,
    distortion, reflection, weight, flag, audio …).
  - Friendly dropdowns for cryptic enums (`blendMode`, `uvMode`, `distortionMode`,
    `colorLookUpTypeY`, …) with the numeric code AND a human label.
  - **Animated color keyframe editor**: when a field has `dynamics`, an
    "(animated · Xkf)" badge opens a modal where you can edit every keyframe
    individually (time + rgba), add new keyframes or remove existing ones.
  - **Primitive kind** badge in each emitter header (Quad / Mesh / Trail / …).
  - Per-block quick actions: "Recolor block" (replaces every static color in
    the selected block) and "Scale × size" (multiplies every size field).
  - Multi-file load (drag & drop or file picker) with per-source modification
    tracking and selective export of modified files only.
- **🌍 Multi-language support (i18n)** — every label, tooltip and help text in
  the new tab is translatable; persists choice in `localStorage`.
  - 🇺🇸 English (default fallback)
  - 🇧🇷 Português (Brasil)
  - 🇪🇸 Español
  - Easy to add new languages by dropping a new `src/i18n/locales/<code>.ts`
    file (same shape as `en.ts`).
- **⚙ Settings dialog** — new top-bar button opens a settings panel where
  language can be changed instantly without reloading.
- **🌐 Compact language menu** in the top bar for one-click switching.
- **❓ Beginner-friendly help system** — every editable field has a "?" button
  next to it. Clicking opens a non-blocking popup with:
  - Title (translated)
  - What it is
  - Effect when you edit it
  - Concrete example (color-highlighted as a code snippet)
  - Optional pro tip / warning (amber-highlighted)
  - 72+ exact field explanations + 19 category fallbacks (no field is left
    without an explanation).
- **❓ Enum value help** — alongside enum dropdowns (e.g. `blendMode`) a
  second "?" explains what the **currently selected value** means
  (e.g. "🔥 Additive — classic GLOW effect. Use for fire, magic, energy,
  lasers!").

### Changed
- Top-bar layout adjusted to host the new language menu and settings button
  on the right side.
- `ActiveTab` type extended with the new `"vfxBlockEditor"` variant.

### Notes
- No new npm dependencies. The i18n system is a thin React Context (`<200
  LOC`) and the parser/analyzer are pure TypeScript.
- The new tab is fully self-contained: deleting `src/components/VfxBlockEditorTab.tsx`
  is enough to remove it.

---

## [1.0.1] - 2026-04-19

### Added
- Batch DDS processing now skips defective files and continues processing.
- End-of-run error report listing failed files and failure reason.
- Fullscreen preview mode for asset inspection.
- Preset application to all loaded DDS files in one action.
- Expanded preset library to 150+ color ideas.
- Desktop auto-updater flow integrated with GitHub Releases.

### Changed
- Simplified export UX by removing redundant output-folder button from regular workflow.
- Assets workflow defaults to clearer preview behavior.

### Fixed
- Fixed VFX recolor neutral target issue where black/gray/white could drift to source hue.
- Improved DDS batch stability so one broken file no longer aborts the full job.

### Removed
- Experimental Build Skin flow from primary UI (kept focus on stable tabs).

## [1.0.0] - 2026-03-29

### Added
- Initial public desktop release of Chroma Tool Studio.
- DDS recolor pipeline with per-file zones and controls.
- VFX Python recolor tab.
- Windows installer support and desktop launch workflow.
