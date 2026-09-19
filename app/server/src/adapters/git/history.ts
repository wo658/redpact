import { createHash } from "node:crypto"
import { problem } from "../../core/problems.js"
import type { GraphPage, GraphQuery } from "../../core/types/git-graph.js"
import { readGit } from "./native-read.js"

async function graphRefs(root: string): Promise<GraphPage["refs"]> {
  const output = await readGit(root, [
    "for-each-ref",
    "--format=%(refname)%00%(objectname)%00%(objecttype)%00%(*objectname)%00%(*objecttype)",
    "refs/heads/",
    "refs/remotes/",
    "refs/tags/",
  ])
  const refs: GraphPage["refs"] = []
  for (const line of output.split("\n").filter(Boolean)) {
    const [name, object, type, peeled, peeledType] = line.split("\0")
    let target = type === "commit" ? object : peeled
    if (type !== "commit" && peeledType !== "commit") {
      if (peeledType !== "tag") {
        continue
      }
      target = (await readGit(root, ["rev-parse", "--verify", `${name}^{commit}`])).trim()
    }
    let kind: "head" | "remote" | "tag" = "tag"
    if (name.startsWith("refs/heads/")) {
      kind = "head"
    }
    if (name.startsWith("refs/remotes/")) {
      kind = "remote"
    }
    refs.push({ name, target, kind })
  }
  // Detached worktree tips are not necessarily reachable from any branch.
  const worktrees = await readGit(root, ["worktree", "list", "--porcelain", "-z"])
  let detached = 0
  for (const record of worktrees.split("\0\0")) {
    const fields = record.split("\0")
    const head = fields.find((field) => field.startsWith("HEAD "))?.slice(5)
    if (head && !/^0+$/.test(head) && fields.includes("detached")) {
      refs.push({ name: `Detached HEAD ${++detached}`, target: head, kind: "current" })
    }
  }
  return refs
}

function offsetFor(cursor: string | undefined, digest: string) {
  if (!cursor) {
    return 0
  }
  const match = /^([a-f0-9]{64}):(\d{1,9})$/.exec(cursor)
  if (!match) {
    problem("invalid_input", "Invalid Git graph cursor")
  }
  if (match[1] !== digest) {
    problem("graph_changed", "Git history changed. Refresh the graph to continue.")
  }
  return Number(match[2])
}

function parseCommits(output: string): GraphPage["commits"] {
  if (!output) {
    return []
  }
  const fields = output.split("\0")
  if (fields.at(-1) === "") {
    fields.pop()
  }
  if (fields.length % 6 !== 0) {
    throw new Error("Incomplete Git history response")
  }
  const commits: GraphPage["commits"] = []
  for (let index = 0; index < fields.length; index += 6) {
    const [oid, parents, name, authoredAt, committedAt, message] = fields.slice(index, index + 6)
    commits.push({
      oid,
      parents: parents ? parents.split(" ") : [],
      kind: "commit",
      message,
      author: { name },
      authoredAt,
      committedAt,
    })
  }
  return commits
}

export async function readHistory(root: string, query: GraphQuery): Promise<GraphPage> {
  const refs = await graphRefs(root)
  let names: string[] = []
  if (Array.isArray(query.ref)) {
    names = query.ref
  } else if (query.ref) {
    names = [query.ref]
  }
  const selected = [...new Set(names)].sort()
  if (selected.some((name) => !refs.some((ref) => ref.name === name))) {
    problem("invalid_input", "Select an existing Git graph ref")
  }
  const digest = createHash("sha256")
    .update(JSON.stringify([refs, selected]))
    .digest("hex")
  const offset = offsetFor(query.cursor, digest)
  const tips = [
    ...new Set(
      refs
        .filter((ref) => !selected.length || selected.includes(ref.name))
        .map((ref) => ref.target),
    ),
  ]
  if (!tips.length) {
    return { commits: [], refs, hasMore: false }
  }
  const output = await readGit(root, [
    "log",
    "--topo-order",
    "--no-color",
    "--no-decorate",
    "--no-show-signature",
    "-z",
    "--format=%H%x00%P%x00%an%x00%aI%x00%cI%x00%s",
    `--max-count=${query.limit + 1}`,
    `--skip=${offset}`,
    ...tips,
    "--",
  ])
  const commits = parseCommits(output)
  const hasMore = commits.length > query.limit
  return {
    commits: commits.slice(0, query.limit),
    refs,
    hasMore,
    ...(hasMore ? { cursor: `${digest}:${offset + query.limit}` } : {}),
  }
}
