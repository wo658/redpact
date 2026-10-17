import { execFileSync } from "node:child_process"
import { appendFileSync } from "node:fs"
import { setTimeout } from "node:timers/promises"
import { pathToFileURL } from "node:url"

const site = "https://redpact.dev"
const repository = "https://github.com/wo658/redpact.git"

async function read(fetch, path, expected, signal) {
  const url = new URL(path, site)
  url.searchParams.set("verification", `${expected}-${Date.now()}`)
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
    signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
  })
  if (response.status !== 200) {
    throw new Error(`${path}: HTTP ${response.status}`)
  }
  return response
}

async function observe({ fetch, expected, accepts, signal }) {
  const response = await read(fetch, "/docs-source.json", expected, signal)
  const source = await response.json()
  if (
    source.repository !== repository ||
    source.ref !== "refs/heads/main" ||
    !/^[a-f0-9]{40}$/.test(source.commit ?? "")
  ) {
    throw new Error("Invalid production source identity")
  }
  if (!(await accepts(source.commit))) {
    throw new Error(`Production SHA ${source.commit} does not include ${expected}`)
  }
  await Promise.all(
    ["/en/docs/", "/ko/docs/"].map(async (path) => {
      const page = await read(fetch, path, expected, signal)
      if (!page.headers.get("content-type")?.includes("text/html")) {
        throw new Error(`${path}: expected HTML`)
      }
      await page.arrayBuffer()
    }),
  )
  return source.commit
}

export async function waitForPublication({
  expected,
  accepts,
  fetch = globalThis.fetch,
  attempts = 30,
  pause = () => setTimeout(10000),
  log = console.log,
}) {
  if (!/^[a-f0-9]{40}$/.test(expected ?? "")) {
    throw new Error("Expected a full source commit SHA")
  }
  const signal = AbortSignal.timeout(8 * 60 * 1000)
  let last = "No production response"
  for (let attempt = 1; attempt <= attempts && !signal.aborted; attempt++) {
    try {
      return await observe({ fetch, expected, accepts, signal })
    } catch (error) {
      last = error.message
      log(`Publication check ${attempt}/${attempts}: ${last}`)
    }
    if (attempt < attempts && !signal.aborted) {
      await pause()
    }
  }
  throw new Error(
    `Website publication not confirmed for ${expected}: ${last}. Retry the workflow; check Vercel and REDPACT_DOCS_COMMIT.`,
  )
}

export function includesCommit(base, candidate, git = execFileSync) {
  if (candidate === base) {
    return true
  }
  git("git", ["fetch", "--quiet", "origin", "main"], { timeout: 10000 })
  try {
    git("git", ["merge-base", "--is-ancestor", candidate, "origin/main"], { timeout: 10000 })
    git("git", ["merge-base", "--is-ancestor", base, candidate], { timeout: 10000 })
    return true
  } catch (error) {
    if (error.status === 1) {
      return false
    }
    throw new Error("Cannot verify production commit ancestry")
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const expected = process.env.GITHUB_SHA
  const actual = await waitForPublication({
    expected,
    accepts: async (candidate) => includesCommit(expected, candidate),
  })
  const summary = `## Website publication confirmed\n\n- Requested source: \`${expected}\`\n- Deployed source: \`${actual}\`\n- Source marker: ${site}/docs-source.json\n- English and Korean documentation: HTTP 200 HTML\n`
  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
  }
}
