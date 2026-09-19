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
import { instanceSettingsSchema } from "../../core/instance-schema.js"
import { reviewRecordSchema } from "../../core/review-schema.js"
import type { ReviewStore } from "../../core/types/reviews.js"

// The instance Store already holds the exclusive writer lock for this directory.
export function createReviewStore(directory: string): ReviewStore {
  const root = join(directory, "reviews")
  mkdirSync(root, { recursive: true, mode: 0o700 })
  if (lstatSync(root).isSymbolicLink()) {
    throw new Error("Review storage cannot be a symlink")
  }
  const settingsPath = join(directory, "settings.json")
  function readSettings() {
    return instanceSettingsSchema.parse(JSON.parse(readFileSync(settingsPath, "utf8")))
  }
  function atomic(path: string, value: unknown) {
    const temporary = `${path}.${randomUUID()}.tmp`
    try {
      writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 })
      renameSync(temporary, path)
    } finally {
      if (existsSync(temporary)) {
        unlinkSync(temporary)
      }
    }
  }
  return {
    save(record) {
      const value = reviewRecordSchema.parse(record)
      atomic(join(root, `${value.id}.json`), value)
    },
    list() {
      return readdirSync(root)
        .filter((name) => name.endsWith(".json"))
        .map((name) => {
          const path = join(root, name)
          if (lstatSync(path).isSymbolicLink()) {
            throw new Error("Review record cannot be a symlink")
          }
          const record = reviewRecordSchema.parse(JSON.parse(readFileSync(path, "utf8")))
          if (name !== `${record.id}.json`) {
            throw new Error("Review record identity mismatch")
          }
          return record
        })
    },
    policy: () => readSettings().approval ?? "auto",
    setPolicy(policy) {
      const original = JSON.parse(readFileSync(settingsPath, "utf8"))
      instanceSettingsSchema.parse({ ...original, approval: policy })
      atomic(settingsPath, { ...original, approval: policy })
    },
  }
}
