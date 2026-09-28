import { PassThrough, Readable } from "node:stream"
import { execa } from "execa"
import { getContainerRuntimeClient, ImageName } from "testcontainers"

// Keep unsupported operations on the connection selected by Testcontainers.
export async function runtimeClient() {
  const client = await getContainerRuntimeClient()
  const modem = client.container.dockerode.modem as unknown as { socketPath?: string }
  if (typeof modem.socketPath !== "string" || !modem.socketPath.startsWith("/")) {
    throw new Error("Only a local Docker socket is supported")
  }
  return client
}

export async function runtimeIdentity(expected?: string | null) {
  const client = await runtimeClient()
  const { ID } = await client.container.dockerode.info()
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
  // ContainerClient.list only includes running containers; recovery needs all states.
  return client.container.dockerode.listContainers({ all: true, filters: { label: labels } })
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
  // ImageClient has build/pull/inspect/exists but no selective removal API.
  await client.container.dockerode.getImage(name).remove({ force: false })
}

export async function containerLogSnapshot(id: string, tail: number) {
  const client = await runtimeClient()
  const container = client.container.getById(id)
  // ContainerClient.logs always follows and suppresses fetch errors in 12.1.0.
  const data = await container.logs({ follow: false, stdout: true, stderr: true, tail })
  const output = new PassThrough()
  let text = ""
  output.on("data", (chunk: Buffer) => {
    text = (text + chunk.toString()).slice(-65536)
  })
  const source = Readable.from([data])
  client.container.dockerode.modem.demuxStream(source, output, output)
  await new Promise<void>((resolve, reject) => {
    source.once("end", resolve)
    source.once("error", reject)
  })
  return text
}

export async function runnerNetwork(
  project: string | undefined,
  owner: string,
  environment: string,
) {
  const client = await runtimeClient()
  const networks = await client.container.dockerode.listNetworks({
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
  const modem = client.container.dockerode.modem as unknown as { socketPath: string }
  return `unix://${modem.socketPath}`
}
