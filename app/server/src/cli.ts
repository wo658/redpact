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
      const supervisor = superviseRuntime({
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
      process.once("SIGINT", () => supervisor.close())
      process.once("SIGTERM", () => supervisor.close())
    } else {
      process.argv = [process.argv[0], process.argv[1], ...args]
      await import("./main.js")
    }
  } else {
    console.error("Available: redpact serve. Use the configure MCP tool for project settings.")
    process.exitCode = 1
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
