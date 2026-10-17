import { existsSync } from "node:fs"
import { appendFile, mkdir, rm, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { execa } from "execa"
import { getComposeClient } from "testcontainers"
import { stringify } from "yaml"
import { applyHostPorts } from "../../core/manual-ports.js"
import { environmentRedactions, runnerServiceHost } from "../../core/runner-environment.js"
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
import { startComposeSession } from "./compose-session.js"
import { retainLegacyImageOwnership } from "./legacy-image-ownership.js"
import { networkDiagnostic } from "./network-diagnostic.js"
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

export function createComposeAdapter(dataDir: string): EnvironmentAdapter {
  const sessions = new Map<string, ReturnType<typeof startComposeSession>>()
  function directory(record: Environment) {
    return join(dataDir, "environments", record.id)
  }
  async function runtime(record: Environment) {
    return runtimeIdentity(record.runtimeId)
  }
  async function ids(kind: string, record: Environment) {
    const client = await runtimeClient()
    const filters = {
      label: [`io.redpact.owner=${record.ownerId}`, `io.redpact.environment=${record.id}`],
    }
    if (kind === "container") {
      return (await containersWithLabels(filters.label)).map((item) => item.Id)
    }
    if (kind === "network") {
      return (await client.network.list({ filters })).map((item) => item.Id)
    }
    return (await client.volume.list({ filters })).map((item) => item.Name)
  }
  async function inspect(record: Environment): Promise<EnvironmentObservation> {
    const runtimeId = await runtime(record)
    const resources: Environment["resources"] = []
    const endpoints: Environment["endpoints"] = {}
    const observed = new Map<string, boolean>()
    for (const kind of ["container", "network", "volume"] as const) {
      for (const id of await ids(kind, record)) {
        const client = await runtimeClient()
        const item = kind === "container" ? await inspectContainer(id) : null
        let metadata: { Labels?: Record<string, string> } | null = null
        if (kind === "network") {
          metadata = await client.network.inspect(client.network.getById(id))
        }
        if (kind === "volume") {
          metadata = await client.volume.inspect(id)
        }
        const labels = item ? item.Config.Labels : metadata?.Labels
        if (
          labels?.["io.redpact.owner"] !== record.ownerId ||
          labels?.["io.redpact.environment"] !== record.id
        ) {
          continue
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
          (observed.get(name) ?? true) &&
            (service?.job
              ? item.State.Status === "exited" && item.State.ExitCode === 0
              : item.State.Running &&
                (!item.State.Health || item.State.Health.Status === "healthy")),
        )
        for (const [port, bindings] of Object.entries(item.NetworkSettings.Ports ?? {})) {
          const binding = bindings?.[0]
          if (binding && port.endsWith("/tcp")) {
            endpoints[`${name}:${port.split("/")[0]}`] = {
              host: client.info.containerRuntime.host,
              port: Number(binding.HostPort),
            }
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
    async close() {
      const results = await Promise.allSettled(
        [...sessions.values()].map((session) => session.terminate()),
      )
      sessions.clear()
      const failures = results
        .filter((result) => result.status === "rejected")
        .map((result) => result.reason)
      if (failures.length) {
        throw new AggregateError(failures, "Compose diagnostics could not be finalized")
      }
    },
    fingerprint: (root, inputs) => snapshotComposeInputs(root, inputs),
    inspect,
    async prepare(record, signal, observe) {
      signal = AbortSignal.any([signal, AbortSignal.timeout(record.settings.environment.timeoutMs)])
      const root = directory(record)
      const stage = join(root, "source")
      const runtimeFiles = join(root, "runtime")
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
        const selection = await stageSelection(runtimeFiles, record, record.target.projectRoot)
        redactValues.push(...environmentRedactions(record))
        const host = await runtimeSocket()
        update({ runtimeId: await runtime(record) })
        const files = selection.files
        const env = minimalEnvironment()
        const compose = await getComposeClient(env)
        const model = applyHostPorts(
          (await compose.config({
            filePath: record.target.projectRoot,
            files: files.map((file) => join(runtimeFiles, file)),
            projectName: record.projectName,
            composeOptions: [
              "--project-directory",
              dirname(
                join(record.target.projectRoot, record.settings.environment.compose.files[0]),
              ),
              "--profile",
              "*",
            ],
            signal,
          })) as EffectiveCompose,
          record,
        )
        model.services = Object.fromEntries(
          Object.entries(model.services).filter(([name]) =>
            record.plan.activeServices.includes(name),
          ),
        )
        const labels = { "io.redpact.owner": record.ownerId, "io.redpact.environment": record.id }
        const override: {
          services: Record<string, unknown>
          networks: Record<string, unknown>
          volumes: Record<string, unknown>
        } = { services: {}, networks: {}, volumes: {} }
        const runnerKey = `redpact-runner-${record.id}`
        const runnerName = `${record.projectName}-runner`
        const jobs = new Set<string>()
        for (const service of Object.values(model.services)) {
          for (const [name, edge] of Object.entries(service.depends_on ?? {})) {
            if (edge.condition === "service_completed_successfully") {
              jobs.add(name)
            }
          }
        }
        for (const [name, service] of Object.entries(model.services)) {
          override.services[name] = {
            labels,
            ...(!service.network_mode
              ? {
                  networks: {
                    ...(service.networks ?? { default: {} }),
                    [runnerKey]: { aliases: [runnerServiceHost(name)] },
                  },
                }
              : {}),
            ...(service.build
              ? {
                  image: `${record.projectName}-${name}`,
                  build: { labels: { "io.redpact.owner": record.ownerId } },
                }
              : {}),
          }
        }
        for (const [name, resource] of Object.entries(model.networks ?? { default: {} })) {
          if (!resource?.external) {
            override.networks[name] = { labels, name: `${record.projectName}-${name}` }
          }
        }
        override.networks[runnerKey] = { external: true, name: runnerName }
        for (const [name, resource] of Object.entries(model.volumes ?? {})) {
          if (!resource?.external) {
            override.volumes[name] = { labels, name: `${record.projectName}-${name}` }
          }
        }
        // Freeze Compose's resolved model; preserve authored ports, mounts, resources and build options.
        // Only captured local build contexts move into the source snapshot.
        for (const service of Object.values(model.services)) {
          if (service.build) {
            service.build.tags = []
            const path = relative(record.target.projectRoot, service.build.context)
            if (
              !isAbsolute(path) &&
              path !== ".." &&
              !path.startsWith("../") &&
              existsSync(join(stage, path))
            ) {
              service.build.context = join(stage, path)
            }
          }
        }
        const resolvedFile = ".redpact-resolved.yaml"
        await writeFile(
          join(runtimeFiles, resolvedFile),
          stringify(model, (_key, value) => {
            if (typeof value !== "string") {
              return value
            }
            return value.replaceAll("$", "$$")
          }),
          {
            mode: 0o600,
            flag: "wx",
          },
        )
        const overrideFile = ".redpact-runtime.yaml"
        await writeFile(join(runtimeFiles, overrideFile), stringify(override), {
          mode: 0o600,
          flag: "wx",
        })
        update({
          services: Object.keys(model.services).map((name) => ({ name, job: jobs.has(name) })),
        })
        signal.throwIfAborted()
        // The runner network exists even when every application uses host/none networking.
        const temporary = record.manualScope !== "main"
        if (!temporary) {
          const client = await runtimeClient()
          await client.network.create({
            Name: runnerName,
            Labels: {
              ...labels,
              "com.docker.compose.project": record.projectName,
              "com.docker.compose.network": "redpact-runner",
            },
          })
        }
        let worker = new URL("./compose-worker.js", import.meta.url)
        if (!existsSync(worker)) {
          worker = new URL("./compose-worker.ts", import.meta.url)
        }
        if (temporary) {
          const session = startComposeSession({
            executable: process.execPath,
            args: [
              ...(worker.pathname.endsWith(".ts") ? ["--import", import.meta.resolve("tsx")] : []),
              fileURLToPath(worker),
            ],
            cwd: runtimeFiles,
            env: {
              ...env,
              DOCKER_HOST: host,
              DEBUG: "testcontainers:build,testcontainers:pull,testcontainers:compose",
            },
            spec: {
              temporary: true,
              runnerName,
              networkLabels: {
                ...labels,
                "com.docker.compose.project": record.projectName,
                "com.docker.compose.network": "redpact-runner",
              },
              directory: runtimeFiles,
              files: [resolvedFile, overrideFile],
              services: record.plan.activeServices,
              profiles: record.settings.environment.compose.profiles,
              projectName: record.projectName,
              timeoutMs: record.settings.environment.timeoutMs,
            },
            signal,
            preparationLog: join(root, "preparation.log"),
            servicesLog: join(root, "services.log"),
            redact,
            redactions: redactValues,
          })
          sessions.set(record.id, session)
          await session.ready
        } else {
          const child = execa(
            process.execPath,
            [
              ...(worker.pathname.endsWith(".ts") ? ["--import", import.meta.resolve("tsx")] : []),
              fileURLToPath(worker),
            ],
            {
              cwd: runtimeFiles,
              detached: true,
              ipc: true,
              env: { ...env, DOCKER_HOST: host },
              extendEnv: false,
              input: JSON.stringify({
                directory: runtimeFiles,
                files: [resolvedFile, overrideFile],
                services: record.plan.activeServices,
                profiles: record.settings.environment.compose.profiles,
                projectName: record.projectName,
                timeoutMs: record.settings.environment.timeoutMs,
              }),
              cancelSignal: signal,
              forceKillAfterDelay: 2000,
              timeout: record.settings.environment.timeoutMs,
              reject: false,
              maxBuffer: 1024 * 1024,
            },
          )
          try {
            const result = await child
            await writeFile(
              join(root, "preparation.log"),
              redact(networkDiagnostic(result.stderr)),
              {
                mode: 0o600,
              },
            )
            if (result.exitCode !== 0) {
              const fixed = Object.values(record.specification.dependencies).flatMap(
                (item) => item.hostPorts ?? [],
              )
              const portConflict =
                /port is already allocated|address already in use|Bind for .* failed/i.test(
                  result.stderr,
                )
              throw new Error(
                portConflict && fixed.length && record.manualScope === "main"
                  ? `Fixed host port conflict (${fixed.map((item) => `${item.service}:${item.target} -> ${item.published}`).join(", ")}). Stop the conflicting listener or change dependency hostPorts; no fallback port was allocated.`
                  : "Compose startup failed; inspect preparation.log",
              )
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
        }
        const observation = await inspect(current)
        update({ resources: observation.resources, endpoints: observation.endpoints })
        if (!observation.healthy) {
          throw new Error("Services or preparation jobs are not ready")
        }
      } catch (error) {
        update({
          errors: [
            redact(
              networkDiagnostic(error instanceof Error ? error.message : "Preparation failed"),
            ),
          ],
        })
        await appendFile(
          join(root, "preparation.log"),
          redact(networkDiagnostic(error instanceof Error ? error.message : "Preparation failed")),
          { mode: 0o600 },
        )
        throw error
      } finally {
        if (current.runtimeId && record.manualScope === "main") {
          try {
            const lines: string[] = []
            for (const id of await ids("container", current)) {
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
        await rm(join(directory(record), "runtime"), { recursive: true, force: true })
        return
      }
      await runtime(record)
      const runners = await containersWithLabels([
        `io.redpact.owner=${record.ownerId}`,
        `io.redpact.environment=${record.id}`,
        "io.redpact.integration",
      ])
      for (const runner of runners) {
        await removeContainer(runner.Id)
      }
      const session = sessions.get(record.id)
      if (session && !session.alive()) {
        sessions.delete(record.id)
      }
      if (session?.alive()) {
        try {
          await session.stop(record.settings.environment.stopTimeoutMs)
          sessions.delete(record.id)
        } catch (error) {
          const diagnostic = environmentRedactions(record).reduce(
            (text, secret) => text.split(secret).join("[REDACTED]"),
            String(error),
          )
          await appendFile(join(directory(record), "cleanup.log"), `${diagnostic}\n`, {
            mode: 0o600,
          })
          throw error
        }
      }
      const observed = await inspect(record)
      const legacyImages = await retainLegacyImageOwnership(directory(record), record, observed)
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
            const redactions = environmentRedactions(record)
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
                await client.volume.remove(resource.id)
              }
            } catch (error) {
              if ((error as { statusCode?: number }).statusCode !== 404) {
                throw error
              }
            }
          }
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Removal failed"
          failures.push(`${resource.kind} ${resource.id}: ${reason}`)
        }
      }
      const remaining = await inspect(record).catch((error) => {
        const reason = error instanceof Error ? error.message : "Inspection failed"
        failures.push(`Final inspection unavailable: ${reason}`)
        return undefined
      })
      if (!remaining || remaining.resources.length || failures.length) {
        const inventory =
          (remaining ?? observed).resources
            .map((resource) => `${resource.kind} ${resource.id}`)
            .join(", ") || "none"
        const inventoryLabel = remaining ? "Remaining" : "Last observed"
        const diagnostic = environmentRedactions(record)
          .reduce(
            (text, secret) => text.split(secret).join("[REDACTED]"),
            `Cleanup failed; retry Stop. ${inventoryLabel}: ${inventory}. ${failures.join("; ")}`,
          )
          .slice(-65536)
        await appendFile(join(directory(record), "cleanup.log"), `${diagnostic}\n`, { mode: 0o600 })
        throw new Error(diagnostic)
      }
      const images = new Set(
        record.services.map((service) => `${record.projectName}-${service.name}`),
      )
      for (const image of images) {
        const built = await inspectImage(image)
        if (!built) {
          continue
        }
        const legacyOwned =
          !built.Config.Labels?.["io.redpact.owner"] && legacyImages[image] === built.Id
        if (built.Config.Labels?.["io.redpact.owner"] !== record.ownerId && !legacyOwned) {
          throw new Error(`Image ownership mismatch for retained tag ${image}`)
        }
        await removeImage(image)
      }
      await rm(join(directory(record), "source"), { recursive: true, force: true })
      await rm(join(directory(record), "runtime"), { recursive: true, force: true })
    },
  }
}
