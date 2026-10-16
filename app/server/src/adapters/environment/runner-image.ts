import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { GenericContainer } from "testcontainers"
import { inspectImage } from "./runtime.js"

// Content-addressed runner tags remain reusable; execution always uses an inspected image ID.
export async function runnerImage(assets: string, name: string, files: string[]) {
  const hash = createHash("sha256")
  for (const file of files) {
    const data = await readFile(join(assets, file))
    hash.update(JSON.stringify([file, data.length])).update(data)
  }
  const digest = hash.digest("hex")
  const tag = `${name}:${digest}`
  const cached = await inspectImage(tag)
  if (cached?.Config.Labels?.["io.redpact.runner-inputs"] === digest) {
    return new GenericContainer(cached.Id)
  }
  const image = await GenericContainer.fromDockerfile(assets, "Dockerfile")
    .withLabels({ "io.redpact.runner-inputs": digest })
    .build(tag, { deleteOnExit: false })
  const built = await inspectImage(tag)
  if (built?.Config.Labels?.["io.redpact.runner-inputs"] !== digest) {
    throw new Error("Runner image input identity mismatch")
  }
  return image
}
