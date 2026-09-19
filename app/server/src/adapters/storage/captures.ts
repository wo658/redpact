import { createHash, randomUUID } from "node:crypto"
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
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { captureRunSchema } from "../../core/playwright-schema.js"
import { problem } from "../../core/problems.js"
import type { CaptureStore } from "../../core/types/playwright.js"
import { snapshotInputs } from "../environment/inputs.js"
import { readProjectFile } from "../settings/bundle.js"
export function createCaptureStore(directory: string): CaptureStore {
  const root = join(directory, "playwright-runs")
  mkdirSync(root, { recursive: true, mode: 0o700 })
  if (lstatSync(root).isSymbolicLink()) {
    throw new Error("Capture storage cannot be a symlink")
  }
  return {
    async source(run, path) {
      const directory = join(root, run.id, "sources")
      if (
        lstatSync(join(root, run.id)).isSymbolicLink() ||
        lstatSync(directory).isSymbolicLink() ||
        (await snapshotInputs(directory)) !== run.sourceDigest
      ) {
        throw new Error("Captured source identity mismatch")
      }
      return readProjectFile(directory, path)
    },
    list() {
      return readdirSync(root)
        .filter((n) => n.endsWith(".json"))
        .map((n) => {
          const path = join(root, n)
          if (lstatSync(path).isSymbolicLink()) {
            throw new Error("Capture record cannot be a symlink")
          }
          const run = captureRunSchema.parse(JSON.parse(readFileSync(path, "utf8")))
          if (n !== `${run.id}.json`) {
            throw new Error("Capture identity mismatch")
          }
          return run
        })
    },
    save(run) {
      const value = captureRunSchema.parse(run)
      const path = join(root, `${value.id}.json`)
      const temporary = `${path}.${randomUUID()}.tmp`
      try {
        writeFileSync(temporary, JSON.stringify(value), { flag: "wx", mode: 0o600 })
        renameSync(temporary, path)
      } finally {
        if (existsSync(temporary)) {
          unlinkSync(temporary)
        }
      }
    },
    async artifact(run, side, id) {
      const artifact =
        run[side].cases.flatMap((c) => c.artifacts).find((a) => a.id === id) ??
        problem("not_found", "Artifact not found")
      const path = join(root, run.id, side, id)
      for (const p of [join(root, run.id), join(root, run.id, side), path]) {
        if (lstatSync(p).isSymbolicLink()) {
          throw new Error("Artifact cannot be a symlink")
        }
      }
      const data = await readFile(path)
      if (
        data.byteLength !== artifact.bytes ||
        createHash("sha256").update(data).digest("hex") !== artifact.sha256
      ) {
        throw new Error("Artifact integrity mismatch")
      }
      return { data, contentType: artifact.contentType }
    },
  }
}
