import { problem } from "./problems.js"
import type { ExecutionSelection, UnitFileCommand } from "./types/execution-selection.js"
export function unitExecutionCommand(
  settings: { cwd: string; command: string; fileCommand?: UnitFileCommand },
  selection?: ExecutionSelection,
) {
  const cwd = settings.cwd === "." ? "/workspace" : `/workspace/${settings.cwd}`
  if (selection && (selection.requested === "changed" || settings.fileCommand)) {
    const command = settings.fileCommand
    if (!command) {
      problem(
        "invalid_input",
        "Changed Unit execution requires unitTests.fileCommand; the configured shell command cannot be filtered safely",
      )
    }
    return [
      "/bin/sh",
      "-c",
      'cd "$1" && shift && exec "$@"',
      "redpact",
      cwd,
      command.executable,
      ...command.args,
      ...selection.files.map((file) => `/workspace/${file}`),
    ]
  }
  return ["/bin/sh", "-c", 'cd "$1" && exec /bin/sh -c "$2"', "redpact", cwd, settings.command]
}
