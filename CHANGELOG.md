# Changelog

All notable changes to this project will be documented in this file.

## [1.0.1] - 2026-03-29

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
