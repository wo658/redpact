import { type ChildProcess, fork } from "node:child_process"
import { access, mkdir, open } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import { z } from "zod"
import type { createInstaller } from "./installer.js"
import { createRuntime } from "./runtime.js"

export type LocalConfig = {
  entry?: string
  installer?: ReturnType<typeof createInstaller>
  port: number
  dataDir: string
  node?: string
}

import type { RuntimeState } from "./model.js"

export type { RuntimeState } from "./model.js"
export function localRuntime(config: LocalConfig) {
  if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535) {
    throw new Error("REDPACT_APP_PORT must be between 1024 and 65535")
  }
  if ((config.entry !== undefined && !isAbsolute(config.entry)) || !isAbsolute(config.dataDir)) {
    throw new Error("Runtime CLI and data directory must be absolute paths")
  }
  const origin = `http://127.0.0.1:${config.port}`
  const logPath = join(config.dataDir, "app-start.log")
  let child: ChildProcess | undefined
  async function request(path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(`${origin}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(3000),
    })
    if (!response.ok) {
      throw new Error(`Redpact returned HTTP ${response.status} for ${path.split("?")[0]}`)
    }
    return response.json()
  }
  async function inspect(): Promise<RuntimeState> {
    const base = {
      origin,
      dataDir: config.dataDir,
      logPath,
      startedPid: child?.pid,
      owned: !!child,
      installation: await config.installer?.status(),
    }
    try {
      z.object({ status: z.literal("ok"), git: z.enum(["connected", "not_connected"]) }).parse(
        await request("/api/health"),
      )
      z.object({ info: z.object({ title: z.literal("Redpact API") }) }).parse(
        await request("/openapi.json"),
      )
      return {
        ...base,
        state: "running",
        message: "Connected to Redpact. Test readiness is checked separately.",
      }
    } catch (error) {
      const cause =
        error instanceof Error ? (error.cause as { code?: string } | undefined) : undefined
      if (cause?.code === "ECONNREFUSED") {
        return {
          ...base,
          state: "stopped",
          message: "No server is listening. Start Redpact to load your review workspace.",
        }
      }
      return {
        ...base,
        state: "blocked",
        message:
          "The endpoint did not identify as a healthy Redpact server. No new server will be started.",
      }
    }
  }
  async function halt() {
    const owned = child
    if (!owned) {
      if ((await inspect()).state === "running") {
        throw new Error("This server belongs to another session. Stop it from its owning app.")
      }
      return
    }
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () =>
          finish(
            new Error("Server shutdown is not confirmed. Refresh and inspect the startup log."),
          ),
        25000,
      )
      const exited = (code: number | null) =>
        finish(
          code === 0
            ? undefined
            : new Error("Server exited with a cleanup error. Inspect the startup log."),
        )
      function finish(error?: Error) {
        clearTimeout(timeout)
        owned?.off("exit", exited)
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      }
      owned.once("exit", exited)
      if (owned.connected) {
        owned.send({ runtimeControl: "shutdown" }, (error) => {
          if (error) {
            finish(error)
          }
        })
      } else {
        finish(new Error("Runtime control connection is unavailable."))
      }
    })
  }
  async function launch() {
    if (child) {
      throw new Error("A runtime process is already starting. Stop it before retrying.")
    }
    const entry = config.installer ? await config.installer.entry() : config.entry
    if (!entry) {
      throw new Error("Runtime entry is missing")
    }
    await access(entry)
    await mkdir(config.dataDir, { recursive: true })
    const log = await open(logPath, "a", 0o600)
    try {
      const env: NodeJS.ProcessEnv = { ...process.env, REDPACT_RUNTIME_SUPERVISED: "1" }
      delete env.REDPACT_DESKTOP_CONTROL
      const owned = fork(entry, ["--port", String(config.port), "--data-dir", config.dataDir], {
        execPath: config.node ?? process.execPath,
        execArgv: [],
        cwd: config.dataDir,
        env,
        stdio: ["ignore", log.fd, log.fd, "ipc"],
      })
      owned.on("message", (message: unknown) => {
        if (
          message &&
          typeof message === "object" &&
          "runtimeUpdate" in message &&
          owned.connected
        ) {
          owned.send(
            {
              runtimeUpdateError:
                "This runtime is managed by the Redpact App installer. Update through the plugin.",
            },
            () => {},
          )
        }
      })
      child = owned
      owned.once("exit", () => {
        if (child === owned) {
          child = undefined
        }
      })
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => finish(new Error(`Runtime startup timed out. Read ${logPath}`)),
          25000,
        )
        const exited = () => finish(new Error(`Runtime exited during startup. Read ${logPath}`))
        const failed = (error: Error) => finish(error)
        const message = (value: unknown) => {
          if (
            value &&
            typeof value === "object" &&
            "runtimeReady" in value &&
            value.runtimeReady === config.port
          ) {
            finish()
          }
        }
        function finish(error?: Error) {
          clearTimeout(timeout)
          owned?.off("exit", exited)
          owned.off("error", failed)
          owned.off("message", message)
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        }
        owned.once("exit", exited)
        owned.once("error", failed)
        owned.on("message", message)
      })
    } finally {
      await log.close()
    }
  }
  return {
    ...createRuntime({ inspect, launch, halt }),
    request,
    async install(manager: "npm" | "pnpm") {
      if (!config.installer) {
        throw new Error("Installer is not configured")
      }
      config.installer.start(manager)
      return inspect()
    },
  }
}
