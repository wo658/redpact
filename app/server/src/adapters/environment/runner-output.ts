import type { RunnerOutput } from "./runner-session.js"

// Testcontainers provides bounded cumulative output; persist only each new suffix.
export function collectRunnerOutput(
  stdout: (chunk: string) => void,
  stderr: (chunk: string) => void,
) {
  const lengths = { stdout: 0, stderr: 0 }
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
  }
}
