import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { z } from "zod"
import { githubRepository } from "./pull-requests.js"

type Command = (command: "git" | "gh", args: string[], root: string) => Promise<string>

const sha = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i)
const repository = z.object({ full_name: z.string().min(1) }).nullable()
const pullRequest = z.object({
  number: z.number().int().positive(),
  html_url: z.string(),
  merged_at: z.iso.datetime().nullable(),
  merge_commit_sha: sha.nullable(),
  head: z.object({ ref: z.string(), sha, repo: repository }),
  base: z.object({ ref: z.string(), repo: repository }),
})

function runCommand(
  command: "git" | "gh",
  args: string[],
  root: string,
  cliPath?: string,
): Promise<string> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_") && key !== "GH_DEBUG"),
  )
  const executable =
    command === "gh"
      ? (cliPath ?? ["/opt/homebrew/bin/gh", "/usr/local/bin/gh"].find(existsSync) ?? "gh")
      : "git"
  const flags =
    command === "git"
      ? [
          "-c",
          "core.hooksPath=/dev/null",
          "-c",
          "core.fsmonitor=false",
          "-c",
          "protocol.ext.allow=never",
          ...args,
        ]
      : args
  return new Promise((resolve, reject) => {
    const child = execFile(
      executable,
      flags,
      {
        cwd: root,
        timeout: 15000,
        maxBuffer: 1024 * 1024,
        encoding: "utf8",
        env: {
          ...env,
          GH_HOST: "github.com",
          GH_PROMPT_DISABLED: "1",
          GH_PAGER: "cat",
          GIT_TERMINAL_PROMPT: "0",
          GIT_OPTIONAL_LOCKS: "0",
        },
      },
      (error, stdout) => {
        if (error) {
          reject(
            new Error(
              "Merged PR lookup failed; check GitHub CLI authentication and repository access.",
            ),
          )
          return
        }
        resolve(stdout)
      },
    )
    child.stdin?.on("error", () => {})
    child.stdin?.end()
  })
}

export function createGitHubMergeTracking(
  command?: Command,
  cliPath: () => Promise<string | undefined> = async () => undefined,
) {
  const run: Command =
    command ??
    (async (name, args, root) =>
      runCommand(name, args, root, name === "gh" ? await cliPath() : undefined))

  return {
    async merged(
      root: string,
      branch: string,
      head: string,
      base: string,
      expectedOrigin?: string,
    ): Promise<{
      number: number
      url: string
      mergeCommit: string
    } | null> {
      sha.parse(head)
      const origins = (await run("git", ["remote", "get-url", "--all", "origin"], root))
        .trim()
        .split("\n")
      if (expectedOrigin !== undefined && origins.join("\n") !== expectedOrigin) {
        throw new Error("Origin changed while waiting for merged PR lookup")
      }
      if (origins.length !== 1) {
        throw new Error("Merged PR lookup requires exactly one origin fetch URL")
      }
      let name: string
      try {
        name = githubRepository(origins[0])
      } catch {
        return null
      }
      const output = await run(
        "gh",
        [
          "api",
          "--hostname",
          "github.com",
          "--method",
          "GET",
          `repos/${name}/commits/${head}/pulls?per_page=100`,
        ],
        root,
      )
      const entries = z.array(pullRequest).parse(JSON.parse(output))
      for (const pr of entries) {
        const expected = `https://github.com/${name}/pull/${pr.number}`
        if (pr.html_url.toLowerCase() !== expected.toLowerCase()) {
          throw new Error("Unexpected merged PR response URL")
        }
        if (pr.merged_at !== null && pr.merge_commit_sha === null) {
          throw new Error("Merged PR response is missing its merge commit")
        }
      }
      const match = entries.find(
        (pr) =>
          pr.merged_at !== null &&
          pr.merge_commit_sha !== null &&
          pr.head.ref === branch &&
          pr.head.sha === head &&
          pr.head.repo?.full_name.toLowerCase() === name.toLowerCase() &&
          pr.base.ref === base &&
          pr.base.repo?.full_name.toLowerCase() === name.toLowerCase(),
      )
      if (!match?.merge_commit_sha) {
        return null
      }
      return {
        number: match.number,
        url: `https://github.com/${name}/pull/${match.number}`,
        mergeCommit: match.merge_commit_sha,
      }
    },
  }
}
