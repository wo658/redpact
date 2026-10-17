import type { RunnerOutput } from "./runner-session.js"

// Testcontainers provides bounded cumulative output; persist only each new suffix.
export function collectRunnerOutput(
  stdout: (chunk: string) => void,
  stderr: (chunk: string) => void,
) {
  const lengths = { stdout: 0, stderr: 0 }
  let truncationReported = false
  return (output: RunnerOutput, final = false) => {
    for (const [key, write] of [
      ["stdout", stdout],
      ["stderr", stderr],
    ] as const) {
      const value =
        !final && output[key].endsWith("\uFFFD") ? output[key].slice(0, -1) : output[key]
      write(value.slice(lengths[key]))
      lengths[key] = value.length
    }
    if (final && output.truncated && !truncationReported) {
      truncationReported = true
      // The transport limit may be reached before the redacted log reaches its own limit.
      stdout("\n[Output truncated]\n")
      stderr("\n[Output truncated]\n")
    }
  }
}
