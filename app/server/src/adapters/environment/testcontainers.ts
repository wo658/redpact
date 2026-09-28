import { existsSync } from "node:fs"
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { execa } from "execa"
import { parse, stringify } from "yaml"
import { runnerServiceHost } from "../../core/runner-environment.js"
import { testSelectionSchema } from "../../core/settings-schema.js"
import type {
  Environment,
  EnvironmentAdapter,
  EnvironmentObservation,
} from "../../core/types/environment.js"
import { minimalEnvironment } from "../process/environment.js"
import { readJsonSettings } from "../settings/json.js"
import { snapshotComposeInputs } from "./compose-inputs.js"
import type { EffectiveCompose } from "./compose-model.js"
import { checkCompose, contained, validateComposeInputs } from "./inputs.js"
import { verifyBrowserEndpoints } from "./reachability.js"

import {
  containerLogSnapshot,
  containersWithLabels,
  inspectContainer,
  inspectImage,
  removeContainer,
  removeImage,
  runtimeClient,
  runtimeIdentity,
  runtimeSocket,
} from "./runtime.js"

import { stageSelection } from "./selection.js"

export { minimalEnvironment } from "../process/environment.js"

export function createComposeAdapter(
  dataDir: string,
  secretSource: NodeJS.ProcessEnv | ((record: Environment) => NodeJS.ProcessEnv) = process.env,
): EnvironmentAdapter {
  function directory(record: Environment) {
    return join(dataDir, "environments", record.id)
  }
  async function runtime(record: Environment) {
    return runtimeIdentity(record.runtimeId)
  }
  async function ids(kind: string, project: string) {
    const client = await runtimeClient()
    const filters = { label: [`com.docker.compose.project=${project}`] }
    if (kind === "container") {
      return (await containersWithLabels(filters.label)).map((item) => item.Id)
    }
    if (kind === "network") {
      return (await client.container.dockerode.listNetworks({ filters })).map((item) => item.Id)
    }
    return ((await client.container.dockerode.listVolumes({ filters })).Volumes ?? []).map(
      (item) => item.Name,
    )
  }
  async function inspect(record: Environment): Promise<EnvironmentObservation> {
    const runtimeId = await runtime(record)
    const resources: Environment["resources"] = []
    const endpoints: Environment["endpoints"] = {}
    const observed = new Map<string, boolean>()
    for (const kind of ["container", "network", "volume"] as const) {
      for (const id of await ids(kind, record.projectName)) {
        const client = await runtimeClient()
        const item = kind === "container" ? await inspectContainer(id) : null
        let metadata: { Labels?: Record<string, string> } | null = null
        if (kind === "network") {
          metadata = await client.network.getById(id).inspect()
        }
        if (kind === "volume") {
          metadata = await client.container.dockerode.getVolume(id).inspect()
        }
        const labels = item ? item.Config.Labels : metadata?.Labels
        if (
          labels?.["io.redpact.owner"] !== record.ownerId ||
          labels?.["io.redpact.environment"] !== record.id
        ) {
          throw new Error("Resource ownership mismatch")
        }
        resources.push({
          kind,
          id,
          ...(item
            ? {
                image: item.Image,
                service: labels?.["com.docker.compose.service"],
                status: `${item.State.Status}:${item.State.Health?.Status ?? "none"}`,
              }
            : {}),
        })
        if (!item) {
          continue
        }
        const name = labels?.["com.docker.compose.service"] ?? ""
        const service = record.services.find((s) => s.name === name)
        observed.set(
          name,
          service?.job
            ? item.State.Status === "exited" && item.State.ExitCode === 0
            : item.State.Running && item.State.Health?.Status === "healthy",
        )
        for (const [port, bindings] of Object.entries(item.NetworkSettings.Ports ?? {})) {
          const binding = bindings?.[0]
          if (binding) {
            endpoints[`${name}:${port.split("/")[0]}`] = {
              host: client.info.containerRuntime.host,
              port: Number(binding.HostPort),
            }
          }
        }
        for (const mount of item.Mounts ?? []) {
          if (
            mount.Type === "volume" &&
            mount.Name &&
            !resources.some((r) => r.kind === "volume" && r.id === mount.Name)
          ) {
            resources.push({ kind: "volume", id: mount.Name })
          }
        }
      }
    }
    return {
      runtimeId,
      resources: resources.filter(
        (r, index, list) =>
          list.findIndex((other) => other.kind === r.kind && other.id === r.id) === index,
      ),
      endpoints,
      healthy: record.services.length > 0 && record.services.every((s) => observed.get(s.name)),
    }
  }
  return {
    fingerprint: (root, inputs) => snapshotComposeInputs(root, inputs),
    inspect,
    async prepare(record, signal, observe) {
      let secrets: NodeJS.ProcessEnv = {}
      signal = AbortSignal.any([signal, AbortSignal.timeout(record.settings.environment.timeoutMs)])
      const root = directory(record)
      const stage = join(root, "source")
      await mkdir(stage, { recursive: true, mode: 0o700 })
      const redactValues: string[] = []
      const redact = (value: string) =>
        redactValues
          .reduce((text, secret) => text.split(secret).join("[REDACTED]"), value)
          .slice(-65536)
      let current = record
      const update = (changes: Partial<Environment>) => {
        observe(changes)
        current = { ...current, ...changes }
      }
      try {
        signal.throwIfAborted()
        if (
          (await snapshotComposeInputs(record.target.projectRoot, record, stage)) !==
          record.inputDigest
        ) {
          throw new Error("Application inputs changed during preparation")
        }
        await validateComposeInputs(stage, record.settings)
        const captured = await readJsonSettings(
          record.target.projectRoot,
          testSelectionSchema.parse(record.selection),
          record.projectRules,
        )
        if (
          !captured.valid ||
          captured.digest !== record.settingsDigest ||
          !isDeepStrictEqual(captured.plan, record.plan)
        ) {
          throw new Error("Settings or selection plan changed during capture")
        }
        secrets = typeof secretSource === "function" ? secretSource(record) : secretSource
        const selection = await stageSelection(stage, record, secrets)
        const variables = selection.variables
        redactValues.push(
          ...record.plan.requiredSecrets
            .map((name) => secrets[name])
            .filter((value): value is string => Boolean(value))
            .sort((a, b) => b.length - a.length),
        )
        const host = await runtimeSocket()
        update({ runtimeId: await runtime(record) })
        const files = selection.files
        const flags = [
          "compose",
          "--project-name",
          record.projectName,
          ...files.flatMap((file) => ["-f", join(stage, file)]),
          ...record.settings.environment.compose.profiles.flatMap((profile) => [
            "--profile",
            profile,
          ]),
        ]
        const env = { ...minimalEnvironment(), ...variables, COMPOSE_DISABLE_ENV_FILE: "1" }
        const config = await execa("docker", [...flags, "config", "--format", "json"], {
          cwd: stage,
          env,
          extendEnv: false,
          cancelSignal: signal,
          timeout: 30000,
          maxBuffer: 4 * 1024 * 1024,
          reject: false,
        })
        if (config.exitCode !== 0) {
          throw new Error("Compose effective configuration is invalid")
        }
        const model: EffectiveCompose = JSON.parse(config.stdout)
        checkCompose(model, true)
        if (Object.keys(model.services).sort().join(",") !== record.plan.activeServices.join(",")) {
          throw new Error("Effective services differ from the selection plan")
        }
        const previousBuildImages = new Set<string>()
        if (record.lifecycle === "manual") {
          for (const [name, service] of Object.entries(model.services)) {
            if (service.build && !service.image) {
              const image = (await inspectImage(`${record.projectName}-${name}`))?.Id
              if (image) {
                previousBuildImages.add(image)
              }
            }
          }
        }
        const labels = { "io.redpact.owner": record.ownerId, "io.redpact.environment": record.id }
        const override: {
          services: Record<string, unknown>
          networks: Record<string, unknown>
          volumes: Record<string, unknown>
        } = { services: {}, networks: {}, volumes: {} }
        const jobs = new Set<string>()
        for (const service of Object.values(model.services)) {
          for (const [name, edge] of Object.entries(service.depends_on ?? {})) {
            if (edge.condition === "service_completed_successfully") {
              jobs.add(name)
            }
          }
        }
        for (const [name, service] of Object.entries(model.services)) {
          if (
            service.profiles?.length &&
            !service.profiles.some((p: string) =>
              record.settings.environment.compose.profiles.includes(p),
            )
          ) {
            delete model.services[name]
            continue
          }
          if (!jobs.has(name) && (!service.healthcheck?.test || service.healthcheck.disable)) {
            throw new Error(`Service ${name} requires a healthcheck`)
          }
          if (service.build) {
            const build = service.build
            contained(stage, build.context)
            if (build.dockerfile?.startsWith("/") || build.dockerfile?.split("/").includes("..")) {
              throw new Error("Dockerfile must stay in build context")
            }
            for (const value of Object.values(build.args ?? {})) {
              if (redactValues.some((secret) => String(value).includes(secret))) {
                throw new Error("Secrets cannot be build arguments")
              }
            }
          }
          const ports = (service.ports ?? []).map((p) => ({
            target: Number(p.target),
            published: "0",
            host_ip: "127.0.0.1",
            protocol: "tcp",
          }))
          override.services[name] = {
            labels,
            networks: { "redpact-runner": { aliases: [runnerServiceHost(name)] } },
            ...(ports.length ? { ports } : {}),
            ...(record.lifecycle === "run" && service.build
              ? {
                  image: `${record.projectName}-${name}`,
                  pull_policy: "build",
                  build: { labels, tags: [] },
                }
              : {}),
          }
        }
        for (const name of Object.keys(model.networks ?? { default: {} })) {
          override.networks[name] = { labels }
        }
        override.networks["redpact-runner"] = { labels }
        for (const name of Object.keys(model.volumes ?? {})) {
          override.volumes[name] = { labels }
        }
        // Override the complete port sequence; merging entries could otherwise expose an unbound address.
        const yaml = stringify(override)
          .replace(/^( {4}ports:)/gm, "$1 !override")
          .replace(/^( {6}tags:) \[\]/gm, "$1 !override []")
        const overrideFile = ".redpact-runtime.yaml"
        await writeFile(join(stage, overrideFile), yaml, { mode: 0o600, flag: "wx" })
        update({
          services: Object.keys(model.services).map((name) => ({ name, job: jobs.has(name) })),
        })
        for (const binding of Object.values(record.settings.tests.env)) {
          if (
            "service" in binding &&
            !model.services[binding.service]?.ports?.some((p) => Number(p.target) === binding.port)
          ) {
            throw new Error("Test binding requires a declared published service port")
          }
        }
        if (record.lifecycle === "run") {
          const localBuilds = Object.entries(model.services).filter(([, service]) => service.build)
          if (localBuilds.length) {
            // Capture only environment-owned tags; cleanup must not evaluate application variables.
            await writeFile(
              join(stage, ".redpact-image-cleanup.yaml"),
              stringify({
                services: Object.fromEntries(
                  localBuilds.map(([name]) => [name, { image: `${record.projectName}-${name}` }]),
                ),
              }),
              { mode: 0o600, flag: "wx" },
            )
          }
        }
        signal.throwIfAborted()
        let worker = new URL("./compose-worker.js", import.meta.url)
        if (!existsSync(worker)) {
          worker = new URL("./compose-worker.ts", import.meta.url)
        }
        const child = execa(process.execPath, [fileURLToPath(worker)], {
          cwd: stage,
          detached: true,
          ipc: true,
          env: { ...env, DOCKER_HOST: host },
          extendEnv: false,
          input: JSON.stringify({
            directory: stage,
            files: [...files, overrideFile],
            profiles: record.settings.environment.compose.profiles,
            projectName: record.projectName,
            variables,
            ports: Object.fromEntries(
              Object.entries(model.services)
                .filter(([name]) => !jobs.has(name))
                .map(([name, service]) => [
                  name,
                  (service.ports ?? []).map((port) => Number(port.target)),
                ]),
            ),
            timeoutMs: record.settings.environment.timeoutMs,
          }),
          cancelSignal: signal,
          forceKillAfterDelay: 2000,
          timeout: record.settings.environment.timeoutMs,
          reject: false,
          maxBuffer: 1024 * 1024,
        })
        try {
          const result = await child
          await writeFile(join(root, "preparation.log"), redact(result.stderr), { mode: 0o600 })
          if (result.exitCode !== 0) {
            throw new Error("Compose startup failed")
          }
          update({ endpoints: JSON.parse(result.stdout).endpoints })
        } finally {
          // The Compose library spawns a CLI; kill the child group to prevent late up operations.
          if (child.pid) {
            try {
              process.kill(-child.pid, "SIGKILL")
            } catch {}
          }
        }
        const observation = await inspect(current)
        update({ resources: observation.resources, endpoints: observation.endpoints })
        const observedServices = observation.resources
          .filter((resource) => resource.kind === "container")
          .map((resource) => resource.service)
          .sort()
        if (observedServices.join(",") !== record.plan.activeServices.join(",")) {
          throw new Error("Observed services differ from selection plan")
        }
        for (const resource of observation.resources.filter((r) => r.kind === "container")) {
          const container = await inspectContainer(resource.id)
          const values = new Map<string, string>(
            (container.Config.Env ?? []).map((line: string) => {
              const i = line.indexOf("=")
              return [line.slice(0, i), line.slice(i + 1)]
            }),
          )
          for (const [key, binding] of Object.entries(
            record.plan.bindings[resource.service ?? ""] ?? {},
          )) {
            if (
              "unset" in binding
                ? values.has(key)
                : values.get(key) !== ("value" in binding ? binding.value : secrets[binding.secret])
            ) {
              throw new Error(`Service environment mismatch: ${resource.service}.${key}`)
            }
          }
        }
        if (!observation.healthy) {
          throw new Error("Services or preparation jobs are not ready")
        }
        if (record.lifecycle === "manual") {
          await verifyBrowserEndpoints(current, observation.endpoints, signal)
          const currentImages = new Set(
            observation.resources
              .filter((resource) => resource.kind === "container")
              .map((resource) => resource.image),
          )
          for (const image of previousBuildImages) {
            if (!currentImages.has(image)) {
              const built = await inspectImage(image)
              const client = await runtimeClient()
              const users = await client.container.dockerode.listContainers({
                all: true,
                filters: { ancestor: [image] },
              })
              // Never remove an image referenced by unrelated tags or containers.
              if (built && !built.RepoTags?.length && !users.length) {
                await removeImage(image)
              }
            }
          }
        }
      } catch (error) {
        await appendFile(
          join(root, "preparation.log"),
          redact(error instanceof Error ? error.message : "Preparation failed"),
          { mode: 0o600 },
        )
        throw error
      } finally {
        if (current.runtimeId) {
          try {
            const lines: string[] = []
            for (const id of await ids("container", current.projectName)) {
              const result = await containerLogSnapshot(id, 100)
              lines.push(`${id}\n${redact(result)}`)
            }
            await writeFile(join(root, "services.log"), lines.join("\n"), { mode: 0o600 })
          } catch {}
        }
        if (current.runtimeId) {
          try {
            const observation = await inspect(current)
            update({ resources: observation.resources, endpoints: observation.endpoints })
          } catch {}
        }
      }
    },
    async stop(record) {
      if (!record.runtimeId) {
        await rm(join(directory(record), "source"), { recursive: true, force: true })
        return
      }
      const secrets = typeof secretSource === "function" ? secretSource(record) : secretSource
      await runtime(record)
      const runners = await containersWithLabels([
        `io.redpact.owner=${record.ownerId}`,
        `io.redpact.environment=${record.id}`,
        "io.redpact.integration",
      ])
      for (const runner of runners) {
        await removeContainer(runner.Id)
      }
      const observed = await inspect(record)
      const deadline = Date.now() + record.settings.environment.stopTimeoutMs
      const failures: string[] = []
      for (const resource of observed.resources.sort(
        (a, b) =>
          ["container", "volume", "network"].indexOf(a.kind) -
          ["container", "volume", "network"].indexOf(b.kind),
      )) {
        try {
          const timeout = Math.max(1, deadline - Date.now())
          if (resource.kind === "container") {
            const client = await runtimeClient()
            await client.container.stop(client.container.getById(resource.id), {
              timeout: Math.min(5000, timeout),
            })
            const output = await containerLogSnapshot(resource.id, 1000)
            const redactions = record.plan.requiredSecrets
              .map((name) => secrets[name])
              .filter((value): value is string => Boolean(value))
              .sort((a, b) => b.length - a.length)
            const log = redactions
              .reduce((text, secret) => text.split(secret).join("[REDACTED]"), output)
              .slice(-65536)
            // Persist the final stdout/stderr before deletion, including shutdown output.
            await appendFile(
              join(directory(record), "services.log"),
              `\n${resource.service ?? resource.id} (${resource.id}) final log\n${log}\n`,
              { mode: 0o600 },
            )
            await client.container.remove(client.container.getById(resource.id), {
              removeVolumes: true,
            })
          } else {
            const client = await runtimeClient()
            try {
              if (resource.kind === "network") {
                await client.network.remove(client.network.getById(resource.id))
              } else {
                await client.container.dockerode.getVolume(resource.id).remove()
              }
            } catch (error) {
              if ((error as { statusCode?: number }).statusCode !== 404) {
                throw error
              }
            }
          }
        } catch {
          failures.push(resource.kind)
        }
      }
      const remaining = await inspect(record)
      if (remaining.resources.length || failures.length) {
        throw new Error("Owned resources could not all be removed")
      }
      const source = join(directory(record), "source")
      const imageCleanup = join(source, ".redpact-image-cleanup.yaml")
      if (record.lifecycle === "run" && existsSync(imageCleanup)) {
        const manifest = parse(await readFile(imageCleanup, "utf8")) as {
          services: Record<string, { image: string }>
        }
        for (const { image } of Object.values(manifest.services)) {
          const built = await inspectImage(image)
          if (built) {
            if (
              built.Config.Labels?.["io.redpact.owner"] !== record.ownerId ||
              built.Config.Labels?.["io.redpact.environment"] !== record.id
            ) {
              throw new Error("Image ownership mismatch")
            }
            await removeImage(image)
          }
        }
      }
      await rm(join(directory(record), "source"), { recursive: true, force: true })
    },
  }
}
