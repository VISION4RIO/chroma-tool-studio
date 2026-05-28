# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2026-05-28

### Added
- **🆕 New tab: VFX Block Editor** — surgical per-block editing of every `.py` (Ritobin) file:
  - Pick any VFX system inside a file and tweak only that block (colors, sizes, lifetimes, textures, blend modes, etc.)
  - 20+ field categories auto-detected (color, scale, lifetime, rate, velocity, rotation, position, uv, texture, rendering, alpha, erosion, distortion, reflection, etc.)
  - Friendly dropdowns for cryptic enums (`blendMode`, `uvMode`, `distortionMode`, `colorLookUpTypeY`) with human labels
  - **Animated color keyframe editor** for `dynamics` fields
  - One-click "Recolor block" and "Scale × size" quick actions
  - Multi-file load (drag & drop or file picker) with per-source modification tracking
  - Selective export of modified files only
  - Wider workspace (up to 1800px) with sidebar hidden on this tab for maximum editing space
- **🌍 Multi-language support (i18n)** — interface, tooltips and help texts:
  - 🇺🇸 English (default fallback)
  - 🇧🇷 Português (Brasil)
  - 🇪🇸 Español
  - Choice persists across sessions (localStorage)
  - Easy to add new languages by dropping a new locale file
- **⚙ Settings dialog** — new button in the top-right corner with language picker.
- **📋 Changelog dialog** — new button showing all release notes (Added/Changed/Fixed/Removed) per version, with link to GitHub.
- **❓ Beginner-friendly help system** — every editable field has a `?` icon that shows a tooltip on hover with:
  - What it is (plain language)
  - Effect when you change it
  - 💡 Concrete example
  - ⚠️ Optional pro tip / warning
  - Adaptive popup width (260–440px) that fits any language without truncating
- **❓ Enum value help** — alongside enum dropdowns, a secondary `?` explains what the currently selected value means.
- **🎬 Animated splash screen** — 5-second intro on first launch highlighting v2.0 features (persists in localStorage so it only shows once).

### Changed
- **Top header collapsed** into a thin bar (~50px instead of ~220px) to give more space to the workspace.
- **Tab bar redesigned** with the new VFX Block Editor button and Changelog/Settings buttons on the right.
- **VFX Block Editor tab renders inline** inside the main workspace card (not as overlay/popup window).
- **Help popups trigger on hover** (with 150ms delay) instead of click; auto-size to content and reposition intelligently based on viewport space.
- Build configuration: `electron` and `electron-builder` moved to `devDependencies` (electron-builder v26 requirement).

### Fixed
- Help popups no longer truncate text when using languages with longer translations (PT-BR, ES).
- Changelog correctly shows all change types (Added/Changed/Fixed/Removed), not just "Added".
- VFX Block Editor tab respects translations from the i18n system.

### Notes
- No new npm dependencies. The i18n system is a thin React Context (~200 LOC); the parser/analyzer are pure TypeScript.
- The new tab is fully self-contained — deleting `src/components/VfxBlockEditorTab.tsx` is enough to remove it.

---

## [1.0.1] - 2026-04-19
(...resto do CHANGELOG continua igual...)