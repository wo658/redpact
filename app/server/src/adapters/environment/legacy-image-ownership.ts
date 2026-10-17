import { randomUUID } from "node:crypto"
import { mkdir, open, readFile, rename, rm } from "node:fs/promises"
import { join } from "node:path"
import { parse } from "yaml"
import { z } from "zod"
import type { Environment, EnvironmentObservation } from "../../core/types/environment.js"
import type { EffectiveCompose } from "./compose-model.js"
import { inspectImage } from "./runtime.js"

const ownership = z.strictObject({
  version: z.literal(1),
  environmentId: z.string(),
  ownerId: z.string(),
  runtimeId: z.string(),
  images: z.record(z.string(), z.string()),
})

async function optional(path: string) {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined
    }
    throw error
  }
}

// This generated operation artifact preserves validated provenance before destructive cleanup.
// It never upgrades historical evidence or grants ownership based on a tag name alone.
export async function retainLegacyImageOwnership(
  directory: string,
  record: Environment,
  observed: EnvironmentObservation,
) {
  const runtime = join(directory, "runtime")
  const path = join(runtime, "legacy-image-ownership.json")
  const source = await optional(path)
  const proof =
    source === undefined
      ? {
          version: 1 as const,
          environmentId: record.id,
          ownerId: record.ownerId,
          runtimeId: observed.runtimeId,
          images: {} as Record<string, string>,
        }
      : ownership.parse(JSON.parse(source))
  const tags = new Set(record.services.map((service) => `${record.projectName}-${service.name}`))
  if (
    proof.environmentId !== record.id ||
    proof.ownerId !== record.ownerId ||
    proof.runtimeId !== observed.runtimeId ||
    Object.keys(proof.images).some((tag) => !tags.has(tag))
  ) {
    throw new Error("Legacy image cleanup provenance does not match this environment")
  }
  const modelSource = await optional(join(directory, "source", ".redpact-resolved.yaml"))
  const model = modelSource === undefined ? null : (parse(modelSource) as EffectiveCompose)
  let changed = false
  for (const tag of tags) {
    const built = await inspectImage(tag)
    const service = model?.services[tag.slice(record.projectName.length + 1)]
    if (
      proof.images[tag] ||
      !built ||
      built.Config.Labels?.["io.redpact.owner"] ||
      !service?.build ||
      service.image
    ) {
      continue
    }
    if (observed.resources.some((item) => item.kind === "container" && item.image === built.Id)) {
      proof.images[tag] = built.Id
      changed = true
    }
  }
  if (changed) {
    await mkdir(runtime, { recursive: true, mode: 0o700 })
    const temporary = `${path}.${randomUUID()}.tmp`
    try {
      const file = await open(temporary, "wx", 0o600)
      try {
        await file.writeFile(`${JSON.stringify(proof)}\n`)
        await file.sync()
      } finally {
        await file.close()
      }
      await rename(temporary, path)
    } finally {
      await rm(temporary, { force: true })
    }
  }
  return proof.images
}
