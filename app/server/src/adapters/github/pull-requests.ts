import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { z } from "zod"
import { problem } from "../../core/problems.js"
import type {
  GitHubPullRequests,
  PullRequest,
  PullRequestTarget,
} from "../../core/types/pull-requests.js"

type Command = (
  command: "git" | "gh",
  args: string[],
  root: string,
  input?: string,
) => Promise<string>

function runCommand(
  command: "git" | "gh",
  args: string[],
  root: string,
  input?: string,
  cliPath?: string,
): Promise<string> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_") && key !== "GH_DEBUG"),
  )
  const executable = command === "gh" ? githubExecutable(cliPath) : "git"
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
        timeout: 60000,
        maxBuffer: 1024 * 1024,
        encoding: "utf8",
        env: {
          ...env,
          GH_HOST: "github.com",
          GH_PROMPT_DISABLED: "1",
          GH_PAGER: "cat",
          GIT_TERMINAL_PROMPT: "0",
          GIT_OPTIONAL_LOCKS: "0",
          GIT_SSH_COMMAND: "ssh -oBatchMode=yes",
        },
      },
      (error, stdout) => {
        if (error) {
          const message =
            command === "gh"
              ? "GitHub CLI request failed. Install gh and sign in with gh auth login; check repository access."
              : "Git operation failed. Check origin credentials and remote branch history; no force push is used."
          reject(Object.assign(new Error(message), { code: "invalid_input" }))
        } else {
          resolve(stdout)
        }
      },
    )
    child.stdin?.on("error", () => {})
    child.stdin?.end(input)
  })
}

export function githubRepository(url: string): string {
  const match = url.match(
    /^(?:git@github\.com:|https:\/\/github\.com\/|ssh:\/\/git@github\.com\/)([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/,
  )
  if (!match || [".", ".."].includes(match[2])) {
    problem(
      "invalid_input",
      "PR publication requires a github.com origin without embedded credentials",
    )
  }
  return match[1] + "/" + match[2]
}

const remotePr = z.object({
  number: z.number().int().positive(),
  html_url: z.string(),
  head: z.object({ ref: z.string(), repo: z.object({ full_name: z.string() }).nullable() }),
  base: z.object({ ref: z.string() }),
})
function result(value: unknown, target: PullRequestTarget): PullRequest {
  const parsed = remotePr.safeParse(value)
  if (!parsed.success) {
    problem("invalid_input", "Invalid GitHub PR response")
  }
  const pr = parsed.data
  const expected = "https://github.com/" + target.repository + "/pull/" + pr.number
  if (
    pr.html_url.toLowerCase() !== expected.toLowerCase() ||
    pr.head.ref !== target.branch ||
    pr.base.ref !== target.baseBranch ||
    pr.head.repo?.full_name.toLowerCase() !== target.repository.toLowerCase()
  ) {
    problem("invalid_input", "Unexpected GitHub PR response")
  }
  return { number: pr.number, url: expected }
}

function githubExecutable(configured?: string) {
  return configured ?? ["/opt/homebrew/bin/gh", "/usr/local/bin/gh"].find(existsSync) ?? "gh"
}

export function createGitHubPullRequests(
  command?: Command,
  cliPath: () => Promise<string | undefined> = async () => undefined,
): GitHubPullRequests {
  const run: Command =
    command ??
    (async (name, args, root, input) =>
      runCommand(name, args, root, input, name === "gh" ? await cliPath() : undefined))

  async function find(root: string, target: PullRequestTarget) {
    const query = new URLSearchParams({
      state: "open",
      head: target.repository.split("/")[0] + ":" + target.branch,
      base: target.baseBranch,
      per_page: "100",
    })
    const output = await run(
      "gh",
      ["api", "--hostname", "github.com", "repos/" + target.repository + "/pulls?" + query],
      root,
    )
    const prs = z.array(remotePr).parse(JSON.parse(output))
    const existing = prs.find(
      (pr) =>
        pr.head.ref === target.branch &&
        pr.base.ref === target.baseBranch &&
        pr.head.repo?.full_name.toLowerCase() === target.repository.toLowerCase(),
    )
    return existing ? result(existing, target) : null
  }
  return {
    async connection() {
      const executable = githubExecutable(await cliPath())
      const args = ["api", "--hostname", "github.com", "user", "--jq", ".login"]
      const output = command
        ? await command("gh", args, process.cwd())
        : await runCommand("gh", args, process.cwd(), undefined, executable)
      const login = z
        .string()
        .regex(/^[A-Za-z0-9-]+$/)
        .parse(output.trim())
      return { login, cliPath: executable }
    },
    async inspect(root, branch, head) {
      const fetchUrls = (await run("git", ["remote", "get-url", "--all", "origin"], root))
        .trim()
        .split("\n")
      const pushUrls = (await run("git", ["remote", "get-url", "--push", "--all", "origin"], root))
        .trim()
        .split("\n")
      if (fetchUrls.length !== 1 || pushUrls.length !== 1) {
        problem(
          "invalid_input",
          "PR publication requires exactly one origin fetch URL and one push URL",
        )
      }
      const repository = githubRepository(fetchUrls[0])
      if (githubRepository(pushUrls[0]).toLowerCase() !== repository.toLowerCase()) {
        problem("invalid_input", "Origin fetch and push must point to the same GitHub repository")
      }
      const metadata = z
        .object({ full_name: z.string(), default_branch: z.string().min(1) })
        .parse(
          JSON.parse(
            await run("gh", ["api", "--hostname", "github.com", "repos/" + repository], root),
          ),
        )
      if (metadata.full_name.toLowerCase() !== repository.toLowerCase()) {
        problem("invalid_input", "Origin repository changed; update its URL before publishing")
      }
      const target = {
        repository,
        baseBranch: metadata.default_branch,
        branch,
        head,
        pushUrl: pushUrls[0],
      }
      const title = (await run("git", ["show", "-s", "--format=%s", head, "--"], root))
        .trim()
        .slice(0, 256)
      return { ...target, title, existing: await find(root, target) }
    },
    async push(root, target) {
      await run(
        "git",
        [
          "push",
          "--porcelain",
          "--no-follow-tags",
          "--",
          target.pushUrl,
          target.head + ":refs/heads/" + target.branch,
        ],
        root,
      )
    },
    find,
    async create(root, target, title, body) {
      const output = await run(
        "gh",
        [
          "api",
          "--hostname",
          "github.com",
          "--method",
          "POST",
          "repos/" + target.repository + "/pulls",
          "--input",
          "-",
        ],
        root,
        JSON.stringify({
          title,
          body,
          head: target.repository.split("/")[0] + ":" + target.branch,
          base: target.baseBranch,
        }),
      )
      return result(JSON.parse(output), target)
    },
  }
}
