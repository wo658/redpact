---
title: Retired desktop distribution
description: Desktop support has ended; use the web runtime or Plugin.
---

# Retired desktop distribution

Native Windows, Linux and macOS desktop distribution has ended. There are no new
native installers, Homebrew Casks or signed updater releases. Existing GitHub
assets remain historical artifacts and are not a supported installation path.

## Supported installation

Use [npm/pnpm or the App Page Plugin](installation.md). Both provide the shared web
app and runtime. Native desktop sources, Tauri dependencies, build/update commands,
window controls and release workflows have been removed. Historical tags and published
assets remain unchanged; previous source versions remain available in Git history.

## Existing installations

Quit a previous desktop instance before starting another server on its port.
Existing settings and evidence are not deleted or automatically migrated by a new
installation. Keep their original data directory; do not point two running instances
at the same state. See [storage](storage.md) for data and migration rules.
