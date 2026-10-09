import { spawn } from "node:child_process"
import { access, mkdir, mkdtemp, open, readFile, rename, rm, writeFile } from "node:fs/promises"
import { delimiter, dirname, isAbsolute, join } from "node:path"
import { createInstallJob, type PackageManager } from "./install-job.js"

import type { InstallationState } from "./model.js"

export type { InstallationState } from "./model.js"
export function createInstaller(config: {
  root: string
  version: string
  npm: string
  pnpm: string
}) {
  if (!isAbsolute(config.root) || !/^\d+\.\d+\.\d+$/.test(config.version)) {
    throw new Error("Invalid installation configuration")
  }
  const logPath = join(config.root, "install.log")
  const abort = new AbortController()
  function directory(manager: PackageManager) {
    return join(config.root, `${config.version}-${manager}`)
  }
  async function installed(manager: PackageManager) {
    const root = directory(manager)
    try {
      const marker = JSON.parse(await readFile(join(root, ".redpact-install.json"), "utf8"))
      const manifest = JSON.parse(
        await readFile(join(root, "node_modules/@wo658/redpact/package.json"), "utf8"),
      )
      if (
        marker.version !== config.version ||
        marker.manager !== manager ||
        manifest.name !== "@wo658/redpact" ||
        manifest.version !== config.version
      ) {
        return undefined
      }
      const entry = join(root, "node_modules/@wo658/redpact/dist/main.js")
      await access(entry)
      await access(join(root, "node_modules/@wo658/redpact/dist/ui/index.html"))
      return { manager, entry }
    } catch {
      return undefined
    }
  }
  async function find() {
    return (await installed("npm")) ?? (await installed("pnpm"))
  }
  async function perform(manager: PackageManager) {
    if (await find()) {
      return
    }
    await mkdir(config.root, { recursive: true })
    const stage = await mkdtemp(join(config.root, `.install-${manager}-`))
    const log = await open(logPath, "a", 0o600)
    try {
      await writeFile(
        join(stage, "package.json"),
        JSON.stringify({ name: "redpact-app-runtime", private: true }),
      )
      await writeFile(
        join(stage, "pnpm-workspace.yaml"),
        "packages:\n  - .\nverifyDepsBeforeRun: false\n",
      )
      const spec = `@wo658/redpact@${config.version}`
      const args =
        manager === "npm"
          ? [
              config.npm,
              "install",
              "--prefix",
              stage,
              "--omit=dev",
              "--ignore-scripts",
              "--no-audit",
              "--no-fund",
              "--save-exact",
              "--registry=https://registry.npmjs.org",
              spec,
            ]
          : [
              config.pnpm,
              "--dir",
              stage,
              "add",
              "--prod",
              "--ignore-scripts",
              "--save-exact",
              "--registry=https://registry.npmjs.org",
              "--store-dir",
              join(config.root, "pnpm-store"),
              spec,
            ]
      await new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, args, {
          cwd: stage,
          shell: false,
          signal: abort.signal,
          env: {
            ...installationEnvironment(process.env),
            PATH: [dirname(process.execPath), process.env.PATH].filter(Boolean).join(delimiter),
            CI: "true",
          },
          stdio: ["ignore", log.fd, log.fd],
        })
        child.once("error", reject)
        child.once("exit", (code) =>
          code === 0
            ? resolve()
            : reject(new Error(`${manager} installation failed (exit ${code}). See ${logPath}`)),
        )
      })
      const manifest = JSON.parse(
        await readFile(join(stage, "node_modules/@wo658/redpact/package.json"), "utf8"),
      )
      if (manifest.name !== "@wo658/redpact" || manifest.version !== config.version) {
        throw new Error("Installed package did not match the requested version")
      }
      await access(join(stage, "node_modules/@wo658/redpact/dist/main.js"))
      await access(join(stage, "node_modules/@wo658/redpact/dist/ui/index.html"))
      await writeFile(
        join(stage, ".redpact-install.json"),
        JSON.stringify({ manager, version: config.version }),
      )
      try {
        await rename(stage, directory(manager))
      } catch (error) {
        // Another session may have completed the same immutable installation first.
        if (!(await installed(manager))) {
          throw error
        }
      }
    } finally {
      await log.close()
      await rm(stage, { recursive: true, force: true })
    }
  }
  const job = createInstallJob(perform)
  return {
    async status(): Promise<InstallationState> {
      const current = job.status()
      const ready = await find()
      let state: InstallationState["state"] = ready ? "installed" : "missing"
      if (current.state !== "idle") {
        state = current.state
      }
      return {
        state,
        manager: ready?.manager,
        version: config.version,
        directory: config.root,
        logPath,
        error: current.error,
      }
    },
    async entry() {
      const ready = await find()
      if (!ready) {
        throw new Error("Install Redpact with npm or pnpm before starting it.")
      }
      return ready.entry
    },
    start: job.start,
    async close() {
      abort.abort()
      await job.wait()
    },
  }
}

export function installationEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(source).filter(
      ([key]) => !/^(npm_|pnpm_|init_cwd$|node_path$|node_options$)/i.test(key),
    ),
  )
}
