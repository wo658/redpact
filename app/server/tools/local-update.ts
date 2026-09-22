import { execFile, spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { once } from "node:events"
import {
  access,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath, pathToFileURL } from "node:url"
import { parseArgs, promisify } from "node:util"

const exec = promisify(execFile)
const repository = fileURLToPath(new URL("../../../", import.meta.url))
const home = homedir()
const codexHome = process.env.CODEX_HOME ?? join(home, ".codex")
const helperRoot = join(codexHome, "skills/.system/plugin-creator/scripts")

export async function archiveStoppedWriter(data: string, pid: number): Promise<void> {
  const path = join(data, ".writer.lock")
  let record: string
  try {
    record = await readFile(path, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return
    }
    throw error
  }
  if (JSON.parse(record).pid !== pid) {
    throw new Error("Writer lock has a different owner")
  }
  try {
    process.kill(pid, 0)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
      throw error
    }
    if ((await readFile(path, "utf8")) !== record) {
      throw new Error("Writer lock owner changed")
    }
    await rename(path, `${path}.stopped-${pid}-${randomUUID()}`)
    return
  }
  throw new Error(`Writer lock owner ${pid} is still alive`)
}

export async function switchRuntime(options: {
  runtime: string
  candidate: string
  backup: string
  stop: () => Promise<void>
  start: () => Promise<void>
  verify: () => Promise<void>
  idle: () => Promise<void>
}): Promise<void> {
  await options.idle()
  await options.stop()
  let moved = false
  let linked = false
  try {
    await options.idle()
    await rename(options.runtime, options.backup)
    moved = true
    await symlink(options.candidate, options.runtime)
    linked = true
    await options.start()
    await options.verify()
  } catch (error) {
    try {
      // Stop before changing the pointer: the candidate may still own the data directory.
      await options.stop()
      if (linked) {
        await unlink(options.runtime)
      }
      if (moved) {
        await rename(options.backup, options.runtime)
      }
      await options.start()
      await options.verify()
    } catch (recovery) {
      throw new AggregateError(
        [error, recovery],
        `Update and recovery failed. Previous install: ${options.backup}`,
      )
    }
    throw error
  }
}

async function run(command: string, args: string[], cwd = repository) {
  const child = spawn(command, args, { cwd, stdio: "inherit" })
  const [code] = await once(child, "exit")
  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${code}`)
  }
}

async function json(path: string) {
  return JSON.parse(await readFile(path, "utf8"))
}

async function entries(path: string) {
  try {
    return await readdir(path, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return []
    }
    throw error
  }
}

export async function assertIdle(data: string) {
  for (const entry of await entries(join(data, "runs"))) {
    if (!entry.isDirectory()) {
      continue
    }
    const run = (await json(join(data, "runs", entry.name, "state.json"))).data
    if (run?.state !== "finished") {
      throw new Error(`Run ${entry.name} is active or unreadable; finish it before updating`)
    }
  }
  for (const entry of await entries(join(data, "environments"))) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue
    }
    const environment = (await json(join(data, "environments", entry.name))).data
    if (!environment?.state || ["preparing", "in_use", "stopping"].includes(environment.state)) {
      throw new Error(`Environment ${entry.name} is busy or unreadable; finish it before updating`)
    }
  }
}

async function retry(operation: () => Promise<void>, timeout = 30000) {
  const deadline = Date.now() + timeout
  for (;;) {
    try {
      await operation()
      return
    } catch (error) {
      if (Date.now() >= deadline) {
        throw error
      }
      await delay(300)
    }
  }
}

async function verifyServer(base: string, ui = true) {
  const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) })
  if (!health.ok || (await health.json()).status !== "ok") {
    throw new Error("Redpact health check failed")
  }
  for (const [id, method, params] of [
    [
      1,
      "initialize",
      {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "local-update", version: "1.0.0" },
      },
    ],
    [2, "tools/list", {}],
    [3, "tools/call", { name: "configure", arguments: { action: "describe" } }],
  ] as const) {
    const response = await fetch(`${base}/mcp`, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    })
    const body = await response.json()
    if (!response.ok || body.error || body.result?.isError || !body.result) {
      throw new Error(`MCP ${method} failed`)
    }
    if (
      method === "tools/list" &&
      !body.result.tools?.some((tool: { name: string }) => tool.name === "configure")
    ) {
      throw new Error("MCP configure tool is missing")
    }
  }
  if (!ui) {
    return
  }
  const page = await fetch(base, { signal: AbortSignal.timeout(2000) })
  const html = await page.text()
  if (!page.ok || !html.includes('id="root"')) {
    throw new Error("Packaged web entrypoint is unavailable")
  }
  for (const [, path] of html.matchAll(/(?:src|href)="(\/[^" ]+)"/g)) {
    if (path.startsWith("//")) {
      throw new Error("Unexpected external UI asset")
    }
    const asset = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(5000) })
    if (!asset.ok) {
      throw new Error(`Missing UI asset: ${path}`)
    }
    await asset.body?.cancel()
  }
}

async function smokeRuntime(runtime: string) {
  const data = await mkdtemp(join(tmpdir(), "redpact-update-smoke-"))
  const child = spawn(
    process.execPath,
    [
      join(runtime, "node_modules/@wo658/redpact/dist/cli.js"),
      "serve",
      "--data-dir",
      data,
      "--port",
      "0",
    ],
    {
      cwd: runtime,
      stdio: ["ignore", "pipe", "pipe"],
    },
  )
  const exited = once(child, "exit")
  let output = ""
  child.stdout.on("data", (chunk) => {
    output += chunk
  })
  child.stderr.on("data", (chunk) => {
    output += chunk
  })
  try {
    await retry(async () => {
      const port = /"port":(\d+)/.exec(output)?.[1]
      if (!port) {
        throw new Error(`Candidate did not start: ${output.slice(-2000)}`)
      }
      await verifyServer(`http://127.0.0.1:${port}`)
    })
  } finally {
    const timeout = setTimeout(() => child.kill("SIGKILL"), 10000)
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM")
    }
    await exited
    clearTimeout(timeout)
    await rm(data, { recursive: true, force: true })
  }
}

async function launchAgent(base: string) {
  if (process.platform !== "darwin" || !process.getuid) {
    throw new Error("Local runtime updates currently support the macOS LaunchAgent installation")
  }
  const domain = `gui/${process.getuid()}`
  const name = `${domain}/local.redpact.server`
  const plist = join(home, "Library/LaunchAgents/local.redpact.server.plist")
  const config = JSON.parse((await exec("plutil", ["-convert", "json", "-o", "-", plist])).stdout)
  const args = config.ProgramArguments as string[]
  if (
    args[1] !== join(base, "runtime/node_modules/@wo658/redpact/dist/cli.js") ||
    args[args.indexOf("--data-dir") + 1] !== join(base, "data") ||
    args.includes("--port")
  ) {
    throw new Error("LaunchAgent does not match this installation or overrides the settings port")
  }
  const stop = async () => {
    let state: string
    try {
      state = (await exec("launchctl", ["print", name])).stdout
    } catch (error) {
      if (
        await access(join(base, "data/.writer.lock")).then(
          () => true,
          () => false,
        )
      ) {
        const record = await json(join(base, "data/.writer.lock"))
        if (typeof record.pid !== "number") {
          throw error
        }
        await archiveStoppedWriter(join(base, "data"), record.pid)
      }
      return
    }
    const pid = /\bpid = (\d+)/.exec(state)?.[1]
    await exec("launchctl", ["bootout", name])
    if (pid) {
      await retry(async () => {
        try {
          process.kill(Number(pid), 0)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ESRCH") {
            return
          }
          throw error
        }
        throw new Error(`Waiting for Redpact process ${pid} to exit`)
      })
    }
    if (
      await access(join(base, "data/.writer.lock")).then(
        () => true,
        () => false,
      )
    ) {
      if (!pid) {
        throw new Error("Writer lock remains without a known stopped process")
      }
      await archiveStoppedWriter(join(base, "data"), Number(pid))
    }
  }
  return {
    stop,
    start: async () => {
      await exec("launchctl", ["bootstrap", domain, plist])
    },
  }
}

async function updateRuntime(base: string) {
  const service = await launchAgent(base)
  const data = join(base, "data")
  await assertIdle(data)
  const settings = await json(join(data, "settings.json"))
  const port = settings.server?.port ?? 54318
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("The local service needs a stable port in its instance settings")
  }
  await run("pnpm", ["pack:runtime"])
  const manifest = await json(join(repository, "app/server/package.json"))
  const bytes = await readFile(join(repository, `dist/redpact-${manifest.version}.tgz`))
  const digest = createHash("sha256").update(bytes).digest("hex")
  const release = join(base, "releases", `${Date.now()}-${digest.slice(0, 12)}`)
  const candidate = join(release, "runtime")
  const backup = join(release, "previous")
  await mkdir(candidate, { recursive: true })
  await writeFile(join(release, "redpact.tgz"), bytes)
  await writeFile(
    join(candidate, "package.json"),
    JSON.stringify({ name: "redpact-local-install", private: true }),
  )
  await writeFile(
    join(release, "build.json"),
    JSON.stringify(
      {
        sha256: digest,
        source: repository,
        head: (await exec("git", ["rev-parse", "HEAD"], { cwd: repository })).stdout.trim(),
        changes: (await exec("git", ["status", "--porcelain"], { cwd: repository })).stdout,
      },
      null,
      2,
    ),
  )
  await run(
    "pnpm",
    ["add", join(release, "redpact.tgz"), "--ignore-scripts", "--ignore-workspace"],
    candidate,
  )
  await smokeRuntime(candidate)
  const identity = await readFile(join(data, "instance.json"), "utf8")
  const previousHadUi = await access(
    join(base, "runtime/node_modules/@wo658/redpact/dist/ui/index.html"),
  ).then(
    () => true,
    () => false,
  )
  console.log("Candidate passed HTTP, MCP, and UI checks; switching the local service.")
  await switchRuntime({
    runtime: join(base, "runtime"),
    candidate,
    backup,
    ...service,
    idle: () => assertIdle(data),
    verify: async () => {
      const candidateActive = await lstat(backup).then(
        () => true,
        () => false,
      )
      const hasUi = candidateActive || previousHadUi
      await retry(() => verifyServer(`http://127.0.0.1:${port}`, hasUi))
      if ((await readFile(join(data, "instance.json"), "utf8")) !== identity) {
        throw new Error("Instance identity changed during update")
      }
    },
  })
  await writeFile(
    join(base, "last-update.json"),
    JSON.stringify({ release, backup, digest, port }, null, 2),
  )
  console.log(`Updated server: http://127.0.0.1:${port}; previous install: ${backup}`)
}

async function updatePlugin() {
  const source = join(repository, "plugins/redpact")
  const target = join(home, "plugins/redpact")
  const marketplacePath = join(home, ".agents/plugins/marketplace.json")
  const marketplace = (
    await exec("python3", [join(helperRoot, "read_marketplace_name.py")])
  ).stdout.trim()
  const entry = (await json(marketplacePath)).plugins.find(
    (plugin: { name: string }) => plugin.name === "redpact",
  )
  if (entry?.source?.source !== "local" || entry.source.path !== "./plugins/redpact") {
    throw new Error("Expected the personal marketplace to point at ~/plugins/redpact")
  }
  const backup = `${target}.previous-${randomUUID()}`
  const stage = `${target}.next-${randomUUID()}`
  await cp(source, stage, { recursive: true })
  let replaced = false
  try {
    await run("python3", [join(helperRoot, "update_plugin_cachebuster.py"), stage])
    // Validate under the canonical folder name before installation.
    await rename(target, backup)
    await rename(stage, target)
    replaced = true
    await run("python3", [join(helperRoot, "validate_plugin.py"), target])
    await run("python3", [
      join(helperRoot, "../../skill-creator/scripts/quick_validate.py"),
      join(target, "skills/redpact"),
    ])
    await run("codex", ["plugin", "add", `redpact@${marketplace}`, "--json"])
  } catch (error) {
    if (replaced) {
      await rm(target, { recursive: true, force: true })
    }
    if (
      await lstat(backup).then(
        () => true,
        () => false,
      )
    ) {
      await rename(backup, target)
      await run("codex", ["plugin", "add", `redpact@${marketplace}`, "--json"])
    }
    throw error
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
  console.log(`Plugin updated. Start a new Codex task. Previous plugin source: ${backup}`)
}

async function main() {
  const { values } = parseArgs({
    options: {
      "plugin-only": { type: "boolean" },
      all: { type: "boolean" },
      help: { type: "boolean" },
      "install-dir": { type: "string" },
    },
  })
  if (values.help) {
    console.log(
      "Usage: pnpm local:update [--install-dir PATH] [--plugin-only | --all]\nUpdates the existing macOS local installation. Keeps data and previous releases.\nPlugin updates use the installed Codex plugin-creator helpers and personal marketplace.",
    )
    return
  }
  if (values.all && values["plugin-only"]) {
    throw new Error("Choose --all or --plugin-only")
  }
  const base = resolve(values["install-dir"] ?? join(home, ".local/share/redpact"))
  const lockPath = join(base, ".update.lock")
  const lock = await open(lockPath, "wx")
  await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }))
  try {
    if (!values["plugin-only"]) {
      await updateRuntime(base)
    }
    if (values["plugin-only"] || values.all) {
      await updatePlugin()
    }
  } finally {
    await lock.close()
    await unlink(lockPath)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
