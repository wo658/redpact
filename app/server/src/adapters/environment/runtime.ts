import { Readable } from "node:stream"
import { execa } from "execa"
import { getContainerRuntimeClient, ImageName } from "testcontainers"

// All runtime operations use the connection selected by Testcontainers.
export async function runtimeClient() {
  const client = await getContainerRuntimeClient()
  const modem = client.info.containerRuntime
  if (typeof modem.socketPath !== "string" || !modem.socketPath.startsWith("/")) {
    throw new Error("Only a local Docker socket is supported")
  }
  return client
}

export async function runtimeIdentity(expected?: string | null) {
  const client = await runtimeClient()
  const { id: ID } = await client.inspect()
  if (!ID || (expected && ID !== expected)) {
    throw new Error("Runtime identity mismatch")
  }
  return ID
}

export async function inspectContainer(id: string) {
  const client = await runtimeClient()
  return client.container.inspect(client.container.getById(id))
}

export async function containersWithLabels(labels: string[]) {
  const client = await runtimeClient()
  return client.container.list({ all: true, filters: { label: labels } })
}

export async function removeContainer(id: string) {
  const client = await runtimeClient()
  const container = client.container.getById(id)
  await client.container.stop(container, { timeout: 0 })
  await client.container.remove(container, { removeVolumes: true })
}

export async function inspectImage(name: string) {
  const client = await runtimeClient()
  try {
    return await client.image.inspect(ImageName.fromString(name))
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      return null
    }
    throw error
  }
}

export async function removeImage(name: string) {
  const client = await runtimeClient()
  await client.image.remove(ImageName.fromString(name))
}

export async function containerLogSnapshot(id: string, tail: number) {
  const client = await runtimeClient()
  const container = client.container.getById(id)
  const stream = await client.container.logs(container, { follow: false, tail })
  let text = ""
  try {
    for await (const chunk of stream) {
      text = (text + chunk.toString()).slice(-65536)
    }
  } finally {
    stream.destroy()
  }
  return text
}

export async function runnerNetwork(
  project: string | undefined,
  owner: string,
  environment: string,
) {
  const client = await runtimeClient()
  const networks = await client.network.list({
    filters: {
      label: [
        ...(project ? [`com.docker.compose.project=${project}`] : []),
        "com.docker.compose.network=redpact-runner",
        `io.redpact.owner=${owner}`,
        `io.redpact.environment=${environment}`,
      ],
    },
  })
  if (networks.length !== 1) {
    throw new Error("Managed runner network is unavailable or ambiguous")
  }
  return networks[0].Id
}

export async function copyContainerOutput(id: string, target: string) {
  const client = await runtimeClient()
  const archive = await client.container.fetchArchive(
    client.container.getById(id),
    "/review/output",
  )
  try {
    await execa("tar", ["-x", "--strip-components=1", "-C", target], {
      input: Readable.from(archive),
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    })
  } finally {
    ;(archive as Readable).destroy()
  }
}

export async function runtimeSocket() {
  const client = await runtimeClient()
  const modem = client.info.containerRuntime
  return `unix://${modem.socketPath}`
}
