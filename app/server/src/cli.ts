#!/usr/bin/env node

const [command, ...args] = process.argv.slice(2)
try {
  if (command === "serve") {
    process.argv = [process.argv[0], process.argv[1], ...args]
    await import("./main.js")
  } else {
    console.error("Available: redpact serve. Use the configure MCP tool for project settings.")
    process.exitCode = 1
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
