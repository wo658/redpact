import { createHash } from "node:crypto"
import type { SettingsFiles } from "../../core/types/settings-editor.js"
import { readProjectFile } from "./bundle.js"

export function createSettingsFiles(): SettingsFiles {
  const read: SettingsFiles["read"] = async (root, path) => {
    try {
      const source = await readProjectFile(root, path)
      return { source, revision: createHash("sha256").update(source).digest("hex") }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { source: null, revision: null }
      }
      throw error
    }
  }
  return { read }
}
