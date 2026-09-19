import { randomUUID } from "node:crypto"
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { mergeRecordSchema } from "../../core/merge-schema.js"
import type { MergeStore } from "../../core/types/merge.js"

// The instance Store holds the writer lock for this directory.
export function createMergeStore(directory: string): MergeStore {
  const root = join(directory, "merges")
  mkdirSync(root, { recursive: true, mode: 0o700 })
  if (lstatSync(root).isSymbolicLink()) {
    throw new Error("Merge record storage cannot be a symlink")
  }
  return {
    list() {
      return readdirSync(root)
        .filter((name) => name.endsWith(".json"))
        .map((name) => {
          const path = join(root, name)
          if (lstatSync(path).isSymbolicLink()) {
            throw new Error("Merge record cannot be a symlink")
          }
          const value = mergeRecordSchema.parse(JSON.parse(readFileSync(path, "utf8")))
          if (name !== `${value.id}.json`) {
            throw new Error("Merge record identity mismatch")
          }
          return value
        })
    },
    save(run) {
      const value = mergeRecordSchema.parse(run)
      const target = join(root, `${value.id}.json`)
      const temporary = `${target}.${randomUUID()}.tmp`
      try {
        writeFileSync(temporary, `${JSON.stringify(value)}\n`, { flag: "wx", mode: 0o600 })
        renameSync(temporary, target)
      } finally {
        if (existsSync(temporary)) {
          unlinkSync(temporary)
        }
      }
    },
  }
}
