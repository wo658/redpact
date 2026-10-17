#!/usr/bin/env node

const [command, ...args] = process.argv.slice(2)
try {
  if (command === "serve") {
    const { detectInstallation, installRuntime } = await import(
      "./adapters/updates/installation.js"
    )
    const installation = await detectInstallation()
    if (installation) {
      const { fork } = await import("node:child_process")
      const { superviseRuntime } = await import("./workflows/runtime-supervisor.js")
      const { Command } = await import("commander")
      const { default: envPaths } = await import("env-paths")
      const { mkdirSync } = await import("node:fs")
      const { resolve } = await import("node:path")
      const { createLifecycleLog } = await import("./adapters/storage/lifecycle-log.js")
      const parsed = new Command()
        .helpOption(false)
        .allowUnknownOption()
        .allowExcessArguments()
        .option("--data-dir <path>", "Local state directory", envPaths("redpact").data)
        .exitOverride()
        .parse(args, { from: "user" })
        .opts<{ dataDir: string }>()
      const directory = resolve(parsed.dataDir)
      mkdirSync(directory, { recursive: true, mode: 0o700 })
      const supervisor = superviseRuntime({
        log: createLifecycleLog(directory),
        start: (error, port) =>
          fork(installation.entry, port ? [...args, "--port", String(port)] : args, {
            stdio: ["inherit", "inherit", "inherit", "ipc"],
            env: {
              ...process.env,
              REDPACT_RUNTIME_SUPERVISED: "1",
              REDPACT_UPDATE_ERROR: error ?? "",
            },
          }),
        install: (version) => installRuntime(installation, version),
        exit: (code) => process.exit(code),
      })
      process.once("SIGINT", () => supervisor.close("SIGINT"))
      process.once("SIGTERM", () => supervisor.close("SIGTERM"))
    } else {
      process.argv = [process.argv[0], process.argv[1], ...args]
      await import("./main.js")
    }
  } else {
    const { runAgentCli } = await import("./interfaces/cli/commands.js")
    const { nodeCliIO } = await import("./interfaces/cli/node-io.js")
    process.exitCode = await runAgentCli(process.argv.slice(2), await nodeCliIO())
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
