import { matchesGlob } from "node:path"
import type { PlaywrightFile, PlaywrightSettings } from "./types/playwright.js"
import type { ReviewContent } from "./types/review-content.js"
import type { Settings } from "./types/settings.js"

export function reviewContentFromChanges(
  value: ReviewContent,
  paths: string[],
  settings: Settings,
): ReviewContent {
  return {
    ...value,
    tests:
      value.tests ||
      paths.some(
        (path) =>
          path.startsWith(`${settings.tests.directory}/`) &&
          ["**/*.ts", "**/*.js", "**/*.json", "**/pnpm-lock.yaml"].some((pattern) =>
            matchesGlob(path, pattern),
          ),
      ),
    unit:
      value.unit ||
      paths.some((path) =>
        settings.unitTests?.patterns.some((pattern) => matchesGlob(path, pattern)),
      ),
  }
}

export function hasReviewCaptures(
  files: PlaywrightFile[],
  paths: string[],
  settings: PlaywrightSettings,
): boolean {
  const changed = new Set(paths)
  return files.some(
    (file) =>
      file.purpose === "capture" &&
      (file.scope === "worktree" || changed.has(`${settings.directory}/${file.path}`)),
  )
}
