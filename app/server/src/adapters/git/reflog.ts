import { captureGit } from "./capture.js"

const entryLimit = 4096
const outputLimit = 512 * 1024

export async function branchCreation(
  root: string,
  revision: string,
  mainBranch: string | null,
  env: NodeJS.ProcessEnv,
): Promise<string | null> {
  const read = async (args: string[], limit = 4096) =>
    (
      await captureGit(
        ["-C", root, "-c", "core.hooksPath=/dev/null", ...args],
        { ...env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" },
        limit,
      )
    ).stdout.trim()
  let ref: string
  try {
    ref = await read(["symbolic-ref", "--quiet", "HEAD"])
  } catch (error) {
    if ((error as { code?: number }).code === 1) {
      return null
    }
    throw error
  }
  if (!ref.startsWith("refs/heads/") || ref === `refs/heads/${mainBranch}`) {
    return null
  }
  let log: string
  try {
    log = await read(
      ["reflog", "show", "--format=%H%x00%gs", `--max-count=${entryLimit + 1}`, ref, "--"],
      outputLimit,
    )
  } catch (error) {
    if ((error as { code?: string }).code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      return null
    }
    throw error
  }
  const entries = log.split("\n")
  if (entries.length > entryLimit) {
    return null
  }
  // Copied logs describe another branch; rebases invalidate the original review baseline.
  if (entries.some((entry) => /\0(?:rebase\b|Branch: copied\b)/i.test(entry))) {
    return null
  }
  const creation = entries.at(-1)?.match(/^([a-f0-9]{40}|[a-f0-9]{64})\0branch: Created from .+$/)
  if (!creation) {
    return null
  }
  if (!entries[0].startsWith(`${revision}\0`)) {
    throw new Error("Branch changed while reading its creation reflog; retry comparison")
  }
  try {
    await read(["merge-base", "--is-ancestor", creation[1], revision])
  } catch (error) {
    if ((error as { code?: number }).code === 1) {
      return null
    }
    throw error
  }
  if ((await read(["symbolic-ref", "--quiet", "HEAD"])) !== ref) {
    throw new Error("Branch changed while reading its creation reflog; retry comparison")
  }
  return creation[1]
}
