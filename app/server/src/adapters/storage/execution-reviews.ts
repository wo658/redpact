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
import { executionReviewRecordSchema } from "../../core/execution-review-schema.js"
import type { ExecutionReviewStore } from "../../core/types/execution-reviews.js"

// An additive record family; existing Integration reviews retain their original format.
export function createExecutionReviewStore(directory: string): ExecutionReviewStore {
  const root = join(directory, "execution-reviews")
  mkdirSync(root, { recursive: true, mode: 0o700 })
  if (lstatSync(root).isSymbolicLink()) {
    throw new Error("Execution review storage cannot be a symlink")
  }
  return {
    list() {
      return readdirSync(root)
        .filter((name) => name.endsWith(".json"))
        .map((name) => {
          const path = join(root, name)
          if (lstatSync(path).isSymbolicLink()) {
            throw new Error("Execution review record cannot be a symlink")
          }
          const record = executionReviewRecordSchema.parse(JSON.parse(readFileSync(path, "utf8")))
          if (name !== `${record.id}.json`) {
            throw new Error("Execution review identity mismatch")
          }
          return record
        })
    },
    save(record) {
      const value = executionReviewRecordSchema.parse(record)
      const path = join(root, `${value.id}.json`)
      const temporary = `${path}.${randomUUID()}.tmp`
      try {
        writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 })
        renameSync(temporary, path)
      } finally {
        if (existsSync(temporary)) {
          unlinkSync(temporary)
        }
      }
    },
  }
}
