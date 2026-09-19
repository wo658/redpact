import { z } from "zod"
import type { SourceFile } from "./types/contracts.js"

const dependencies = z.record(
  z.string().regex(/^(?:@[a-z0-9-]+\/)?[a-z0-9._-]+$/),
  z.string().regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/),
)
const manifest = z.strictObject({
  name: z.string().optional(),
  version: z.string().optional(),
  private: z.boolean().optional(),
  type: z.enum(["module", "commonjs"]).optional(),
  packageManager: z.literal("pnpm@11.2.2"),
  dependencies: dependencies.optional(),
  devDependencies: dependencies.optional(),
  scripts: z.record(z.string(), z.string()).optional(),
})
export function testPackage(files: SourceFile[]) {
  const file = files.find((file) => file.path === "package.json")
  const lock = files.find((file) => file.path === "pnpm-lock.yaml")
  if (!file && !lock) {
    return undefined
  }
  if (!file || !lock) {
    throw new Error("Test packages require both package.json and pnpm-lock.yaml")
  }
  const value = manifest.parse(JSON.parse(file.source))
  if (value.dependencies?.vitest || value.devDependencies?.vitest) {
    throw new Error("Vitest is supplied by Redpact")
  }
  return value
}
