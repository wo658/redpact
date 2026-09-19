import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { setTimeout } from "node:timers/promises"
import { fileURLToPath } from "node:url"

export async function installBundle(options: {
  staged: string
  destination: string
  backup: string
  stop: () => Promise<void>
}) {
  await options.stop()
  const previous = existsSync(options.destination)
  if (previous) {
    await rename(options.destination, options.backup)
  }
  try {
    await rename(options.staged, options.destination)
  } catch (error) {
    if (previous) {
      await rename(options.backup, options.destination)
    }
    throw error
  }
}

const run = (command: string, args: string[]) =>
  execFileSync(command, args, { encoding: "utf8", timeout: 120_000 })

function appPids(destination: string) {
  const executable = join(destination, "Contents/MacOS/redpact-desktop")
  return run("/bin/ps", ["-axo", "pid=,comm="])
    .split("\n")
    .flatMap((line) => {
      const match = line.trim().match(/^(\d+)\s+(.+)$/)
      return match?.[2] === executable ? [Number(match[1])] : []
    })
}

async function stopApp(destination: string) {
  if (appPids(destination).length === 0) {
    return
  }
  console.log("Quitting Redpact normally; active tests are cancelled by application shutdown.")
  run("/usr/bin/osascript", [
    "-e",
    "on run argv",
    "-e",
    "tell application (item 1 of argv) to quit",
    "-e",
    "end run",
    destination,
  ])
  for (let attempt = 0; attempt < 120; attempt++) {
    if (appPids(destination).length === 0) {
      return
    }
    await setTimeout(500)
  }
  throw new Error(
    "Redpact is still cleaning up. Finish quitting and retry; the app was not replaced.",
  )
}

export async function verifyApp(destination: string) {
  const data = join(homedir(), "Library/Application Support/dev.redpact.desktop/state")
  let lastError = "Application process or HTTP health response was not ready"
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const settings = JSON.parse(await readFile(join(data, "settings.json"), "utf8"))
      const response = await fetch(`http://127.0.0.1:${settings.server.port}/api/health`, {
        signal: AbortSignal.timeout(1000),
      })
      if (
        response.ok &&
        (await response.json()).status === "ok" &&
        appPids(destination).length > 0
      ) {
        return
      }
    } catch (error) {
      // Startup creates settings and opens the listener asynchronously.
      lastError = error instanceof Error ? error.message : String(error)
    }
    await setTimeout(500)
  }
  throw new Error(
    `Installed app did not become healthy: ${lastError}. Inspect ${join(data, "desktop-server.log")}. Any previous app backup is retained; no data was removed.`,
  )
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log(
      "pnpm desktop:update\nBuild the current checkout, install /Applications/Redpact.app, and launch it. macOS only. Requires Rust and the Tauri build prerequisites. Previous apps are retained beside the installation. Normal Quit cancels active tests. No runtime data or MCP configuration is changed.",
    )
    return
  }
  if (process.platform !== "darwin" || process.argv.length > 2) {
    throw new Error("Use desktop:update without arguments on macOS; see --help.")
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
  const destination = "/Applications/Redpact.app"
  const lock = join(dirname(destination), ".redpact-update.lock")
  await mkdir(lock)
  let staging: string | undefined
  try {
    execFileSync(
      "pnpm",
      ["--filter", "@redpact/desktop", "exec", "tauri", "build", "--bundles", "app"],
      {
        cwd: root,
        stdio: "inherit",
        env: {
          ...process.env,
          CI: "true",
          PATH: `${join(homedir(), ".cargo/bin")}:${process.env.PATH ?? ""}`,
        },
      },
    )
    const source = join(
      root,
      "app/desktop/node_modules/.redpact/target/release/bundle/macos/Redpact.app",
    )
    run("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", source])
    run("/usr/bin/codesign", ["--verify", "--deep", "--strict", source])
    staging = await mkdtemp(join(dirname(destination), ".redpact-install-"))
    const staged = join(staging, "Redpact.app")
    run("/usr/bin/ditto", [source, staged])
    const backup = join(staging, "previous.app")
    await installBundle({ staged, destination, backup, stop: () => stopApp(destination) })
    run("/usr/bin/open", [destination])
    await verifyApp(destination)
    console.log(`Installed and running: ${destination}`)
    if (existsSync(backup)) {
      console.log(`Previous app: ${backup}`)
    }
  } finally {
    await rm(lock, { recursive: true, force: true })
    if (staging && !existsSync(join(staging, "previous.app"))) {
      await rm(staging, { recursive: true, force: true })
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
