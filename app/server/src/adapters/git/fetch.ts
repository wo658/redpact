import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { problem } from "../../core/problems.js"
import { readGit } from "./native-read.js"

const execute = promisify(execFile)

export async function fetchRemotes(root: string): Promise<{ remotes: string[] }> {
  const remotes = (await readGit(root, ["remote"])).split("\n").filter(Boolean)
  if (!remotes.length) {
    problem("invalid_input", "No Git remotes configured")
  }
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  )
  for (const remote of remotes) {
    try {
      // Explicit destinations keep repository-configured refspecs away from local branches.
      await execute(
        "git",
        [
          "-C",
          root,
          "-c",
          "core.hooksPath=/dev/null",
          "-c",
          "core.fsmonitor=false",
          "fetch",
          "--no-tags",
          "--no-prune",
          "--no-recurse-submodules",
          "--no-auto-maintenance",
          "--refmap=",
          "--",
          remote,
          `+refs/heads/*:refs/remotes/${remote}/*`,
        ],
        {
          env: { ...env, GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: "ssh -oBatchMode=yes" },
          timeout: 120000,
          maxBuffer: 1024 * 1024,
        },
      )
    } catch {
      problem(
        "git_fetch_failed",
        "Git fetch failed. Check remote access and credentials, then retry.",
      )
    }
  }
  return { remotes }
}
