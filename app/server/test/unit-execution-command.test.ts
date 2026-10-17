import { execa } from "execa"
import { expect, test } from "vitest"
import type { ExecutionSelection } from "../src/core/types/execution-selection.js"
import { unitExecutionCommand } from "../src/core/unit-execution-command.js"

const selection: ExecutionSelection = {
  requested: "changed",
  resolved: "changed",
  reason: "changed_files",
  baseRevision: "a".repeat(40),
  files: [
    "test/space name.test.ts",
    "test/$(touch injected).test.ts",
    "test/a'quote.test.ts",
    "-flag.test.ts",
  ],
}
test("changed scope rejects arbitrary shell commands without the explicit argv contract", () => {
  expect(() => unitExecutionCommand({ cwd: ".", command: "pnpm test" }, selection)).toThrow(
    /fileCommand/,
  )
})
test("file argv remains literal and is rooted under the captured workspace", async () => {
  const command = unitExecutionCommand(
    {
      cwd: ".",
      command: "exit 19",
      fileCommand: {
        executable: process.execPath,
        args: ["-e", "console.log(JSON.stringify(process.argv.slice(1)))", "--"],
      },
    },
    selection,
  )
  command[4] = "/" // Use an existing local cwd to exercise the container command unchanged.
  const result = await execa(command[0], command.slice(1))
  expect(JSON.parse(result.stdout)).toEqual(selection.files.map((file) => `/workspace/${file}`))
})
test("all scope keeps the existing shell command when file filtering is not configured", () => {
  const command = unitExecutionCommand(
    {
      cwd: "app",
      command: "pnpm build && pnpm test",
    },
    { ...selection, requested: "all", resolved: "all", reason: "all_requested" },
  )
  expect(command).toEqual([
    "/bin/sh",
    "-c",
    'cd "$1" && exec /bin/sh -c "$2"',
    "redpact",
    "/workspace/app",
    "pnpm build && pnpm test",
  ])
})
test("opting into fileCommand applies exact argv selection to all as well", () => {
  const command = unitExecutionCommand(
    {
      cwd: ".",
      command: "old command",
      fileCommand: { executable: "pnpm", args: ["exec", "vitest", "run"] },
    },
    { ...selection, requested: "all", resolved: "all", reason: "all_requested" },
  )
  expect(command).toContain("/workspace/test/space name.test.ts")
  expect(command).not.toContain("old command")
})
