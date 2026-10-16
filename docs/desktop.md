---
title: Retired desktop distribution
description: Desktop support has ended; use the web runtime or Plugin.
---

# Retired desktop distribution

Native Windows, Linux and macOS desktop distribution has ended. There are no new
native installers, Homebrew Casks or signed updater releases. Existing GitHub
assets remain historical artifacts and are not a supported installation path.

Use [npm/pnpm or the App Page Plugin](installation.md). Both provide the shared web
app and runtime. Desktop source remains in `app/desktop` for reference; its version
is not coupled to web/runtime releases. Native release workflows have been removed.

Quit a previous desktop instance before starting another server on its port.
Existing settings and evidence are not deleted or automatically migrated by a new
installation. Keep their original data directory; do not point two running instances
at the same state. See [storage](storage.md) for data and migration rules.
