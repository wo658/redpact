import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { cp, lstat, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { promisify } from "node:util"
import { type Evaluation, evaluateCandidate } from "./evaluate.ts"
import { measureRun } from "./measure.ts"
import { summarizeRun } from "./metrics.ts"
import { probe } from "./preflight.ts"
import { makeTaskPrompt } from "./prompts.ts"
import { aggregateConditions } from "./report.ts"

const exec = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
type Condition = "A" | "B" | "C"
interface Task {
  id: "api" | "ui" | "retry"
  title: string
  files: string[]
  acceptance: string[]
}
export interface BatchConfig {
  root: string
  model: string
  reasoningEffort: string
  conditions: Condition[]
  repetitions: number
  seed: number
  timeoutMs: number
  evaluationTimeoutMs: number
  redpactOrigin?: string
  playwrightModule: string
  approvalMode?: "sandbox_only" | "auto_review"
  httpGuideFile?: string
}
interface Subject {
  id: string
  condition: Condition
  repetition: number
  task: Task
  checkout: string
  promptFile: string
  promptDigest: string
}
export interface Manifest {
  schemaVersion: 1
  config: BatchConfig
  baseline: string
  primary: string
  evaluationDigest: string
  batches: { condition: Condition; repetition: number; subjects: Subject[] }[]
}

export function planBatches(conditions: string[], repetitions: number, seed: number) {
  if (
    !conditions.length ||
    new Set(conditions).size !== conditions.length ||
    conditions.some((c) => !["A", "B", "C"].includes(c)) ||
    !Number.isSafeInteger(repetitions) ||
    repetitions < 1 ||
    repetitions > 20 ||
    !Number.isSafeInteger(seed)
  ) {
    throw new Error("Use unique A/B/C conditions, 1–20 repetitions and an integer seed")
  }
  let state = seed >>> 0
  const rows = []
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    const order = [...conditions]
    for (let i = order.length - 1; i > 0; i -= 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      const index = state % (i + 1)
      ;[order[i], order[index]] = [order[index], order[i]]
    }
    for (const condition of order) {
      rows.push({ condition: condition as Condition, repetition })
    }
  }
  return rows
}
async function git(cwd: string, ...args: string[]) {
  return (
    await exec("git", ["-c", "core.hooksPath=/dev/null", ...args], {
      cwd,
      maxBuffer: 20 * 1024 * 1024,
    })
  ).stdout.trim()
}
async function save(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 })
}
export async function treeDigest(root: string): Promise<string> {
  const hash = createHash("sha256")
  async function visit(path: string) {
    for (const name of (await readdir(path)).sort()) {
      if (name === ".git" || name === "node_modules") {
        continue
      }
      const target = join(path, name)
      const stat = await lstat(target)
      if (stat.isSymbolicLink()) {
        throw new Error(`Symlink is not allowed in captured source: ${target}`)
      }
      if (stat.isDirectory()) {
        await visit(target)
      } else {
        hash.update(relative(root, target))
        hash.update("\0")
        hash.update(await readFile(target))
        hash.update("\0")
      }
    }
  }
  await visit(root)
  return hash.digest("hex")
}
function validate(config: BatchConfig) {
  planBatches(config.conditions, config.repetitions, config.seed)
  if (
    config.approvalMode !== undefined &&
    !["sandbox_only", "auto_review"].includes(config.approvalMode)
  ) {
    throw new Error("Invalid approvalMode")
  }
  if (
    !isAbsolute(config.root) ||
    !config.model?.trim() ||
    !config.reasoningEffort?.trim() ||
    !isAbsolute(config.playwrightModule)
  ) {
    throw new Error("Absolute root/playwrightModule and explicit model/reasoningEffort required")
  }
  for (const value of [config.timeoutMs, config.evaluationTimeoutMs]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) {
      throw new Error("Finite positive timeout required")
    }
  }
  if (config.conditions.some((c) => c !== "A")) {
    const url = new URL(config.redpactOrigin ?? "")
    if (
      url.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.username ||
      url.password
    ) {
      throw new Error("Use the connected loopback HTTP runtime")
    }
  }
  if (config.conditions.includes("B") && !isAbsolute(config.httpGuideFile ?? "")) {
    throw new Error("B requires an inspected HTTP operation guide file")
  }
}

export async function prepareBatch(config: BatchConfig): Promise<Manifest> {
  validate(config)
  const tasks: Task[] = JSON.parse(await readFile(join(here, "tasks.json"), "utf8")).tasks
  const httpGuide = config.httpGuideFile ? await readFile(config.httpGuideFile, "utf8") : ""
  if (config.conditions.includes("B") && !httpGuide.trim()) {
    throw new Error("B HTTP operation guide is empty")
  }
  await mkdir(config.root, { mode: 0o700 })
  await writeFile(join(config.root, ".gitignore"), "*\n")
  for (const dir of ["private", "worktrees", "evidence", "snapshots"]) {
    await mkdir(join(config.root, dir))
  }
  await cp(join(here, "evaluation"), join(config.root, "private/evaluation"), { recursive: true })
  const primary = join(config.root, "primary")
  await cp(join(here, "fixture"), primary, { recursive: true })
  // Preparation-only assertions deliberately assert the unsolved baseline.
  await rm(join(primary, "test"), { recursive: true })
  await writeFile(join(primary, ".gitignore"), "node_modules/\nartifacts/\n")
  await writeFile(
    join(primary, "AGENTS.md"),
    "# Experiment subject\nFollow only your assigned task and transport condition. Do not inspect other worktrees, history branches, evaluator files, previous traces or reference implementations. Do not create commits or delegate. Keep verification evidence and report blockers.\n",
  )
  await git(primary, "init", "-b", "baseline")
  await git(primary, "add", ".")
  await git(
    primary,
    "-c",
    "user.name=Pilot fixture",
    "-c",
    "user.email=pilot@localhost",
    "commit",
    "-m",
    "Frozen experiment baseline",
  )
  const baseline = await git(primary, "rev-parse", "HEAD")
  const batches: Manifest["batches"] = []
  for (const batch of planBatches(config.conditions, config.repetitions, config.seed)) {
    const subjects: Subject[] = []
    for (const task of tasks) {
      const id = `${batch.condition}-${batch.repetition}-${task.id}`
      const checkout = join(config.root, "worktrees", id)
      await git(primary, "worktree", "add", "-b", id, checkout, baseline)
      const promptFile = join(config.root, "private", `${id}.txt`)
      const prompt = makeTaskPrompt({
        task,
        condition: batch.condition,
        checkout,
        redpactOrigin: config.redpactOrigin ?? "",
        verificationGuide: batch.condition === "B" ? httpGuide : undefined,
        timeoutSeconds: Math.ceil(config.timeoutMs / 1000),
      })
      await writeFile(promptFile, prompt, { flag: "wx", mode: 0o600 })
      subjects.push({
        id,
        ...batch,
        task,
        checkout,
        promptFile,
        promptDigest: createHash("sha256").update(prompt).digest("hex"),
      })
    }
    batches.push({ ...batch, subjects })
  }
  const manifest: Manifest = {
    schemaVersion: 1,
    config,
    baseline,
    primary,
    batches,
    evaluationDigest: await treeDigest(join(config.root, "private/evaluation")),
  }
  await save(join(config.root, "manifest.json"), manifest)
  return manifest
}

async function rpc(origin: string, name: string, args: object) {
  const response = await fetch(new URL("/mcp", origin), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
    signal: AbortSignal.timeout(15000),
  })
  const value = await response.json()
  if (!response.ok || value.error || value.result?.isError) {
    throw new Error(`Setup ${name} failed`)
  }
  // Never retain App-only metadata or capabilities in experiment traces.
  return value.result.structuredContent
}
async function setupRuntime(manifest: Manifest) {
  const { config, primary } = manifest
  if (config.conditions.every((c) => c === "A")) {
    return
  }
  const origin = config.redpactOrigin as string
  const capability = await probe(origin)
  await save(join(config.root, "evidence", `preflight-${Date.now()}.json`), capability)
  if (!capability.ready) {
    throw new Error(`Runtime blocked: ${capability.missing.join(", ")}`)
  }
  const described = await rpc(origin, "configure", { action: "describe", path: primary })
  if (resolve(described.rulesRoot) !== resolve(primary)) {
    throw new Error("Unexpected settings root; existing project settings were not changed")
  }
  await mkdir(join(primary, ".redpact"), { recursive: true })
  const settingsPath = join(primary, ".redpact/settings.json")
  const template = await readFile(join(primary, "settings.example.json"), "utf8")
  try {
    await writeFile(settingsPath, template, { flag: "wx" })
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code !== "EEXIST" ||
      (await readFile(settingsPath, "utf8")) !== template
    ) {
      throw error
    }
  }
  for (const subject of manifest.batches.flatMap((batch) => batch.subjects)) {
    const result = await rpc(origin, "configure", { action: "validate", path: subject.checkout })
    if (result.validation?.valid !== true) {
      throw new Error(`Settings validation failed: ${subject.id}`)
    }
  }
}

async function scoreCandidate(
  manifest: Manifest,
  subject: Subject,
  status: string,
  evaluate: typeof evaluateCandidate,
) {
  const { root } = manifest.config
  const changed = (await git(subject.checkout, "diff", "--name-only", manifest.baseline))
    .split("\n")
    .filter(Boolean)
  const untracked = (await git(subject.checkout, "ls-files", "--others", "--exclude-standard"))
    .split("\n")
    .filter(Boolean)
  const scopeViolations = [
    ...changed.filter((path) => !subject.task.files.includes(path)),
    ...untracked.filter((path) => !/^(test|tests|task-tests|integration|ui-tests)\//.test(path)),
  ]
  const snapshot = join(root, "snapshots", subject.id)
  await cp(subject.checkout, snapshot, {
    recursive: true,
    filter: (source) => ![".git", "node_modules"].includes(source.split("/").at(-1) ?? ""),
  })
  const digest = await treeDigest(snapshot)
  let evaluation: Evaluation
  if (status !== "completed") {
    evaluation = {
      status: "infrastructure_error" as const,
      tests: null,
      passed: null,
      failed: null,
      accuracy: null,
      infrastructureError: "Subject did not complete; candidate is not scored.",
    }
  } else {
    try {
      evaluation = await evaluate({
        checkout: snapshot,
        taskId: subject.task.id,
        evidenceDirectory: join(root, "evidence", `${subject.id}-evaluation`),
        evaluationRoot: join(root, "private/evaluation"),
        playwrightModule: manifest.config.playwrightModule,
        timeoutMs: manifest.config.evaluationTimeoutMs,
      })
    } catch (error) {
      evaluation = {
        status: "infrastructure_error" as const,
        tests: null,
        passed: null,
        failed: null,
        accuracy: null,
        infrastructureError: String(error),
      }
    }
  }
  if (
    (await treeDigest(snapshot)) !== digest ||
    (await treeDigest(join(root, "private/evaluation"))) !== manifest.evaluationDigest
  ) {
    throw new Error("Captured source/evaluator changed during evaluation")
  }
  return { evaluation, digest, scopeViolations }
}

export async function runBatch(
  manifest: Manifest,
  deps = { measure: measureRun, evaluate: evaluateCandidate, setup: setupRuntime },
) {
  validate(manifest.config)
  const { root } = manifest.config
  const lock = join(root, "running.lock")
  await writeFile(lock, String(process.pid), { flag: "wx" })
  try {
    if ((await treeDigest(join(root, "private/evaluation"))) !== manifest.evaluationDigest) {
      throw new Error("Evaluator changed after preparation")
    }
    for (const subject of manifest.batches.flatMap((batch) => batch.subjects)) {
      if (
        createHash("sha256")
          .update(await readFile(subject.promptFile))
          .digest("hex") !== subject.promptDigest
      ) {
        throw new Error(`Prompt changed: ${subject.id}`)
      }
      if (
        (await git(subject.checkout, "rev-parse", "HEAD")) !== manifest.baseline ||
        (await git(subject.checkout, "status", "--porcelain"))
      ) {
        throw new Error(`Subject must start clean at baseline: ${subject.id}`)
      }
    }
    await deps.setup(manifest)
    const threadIds = new Set<string>()
    const rows = []
    const batches = []
    for (const batch of manifest.batches) {
      const started = performance.now()
      // One batch's three subjects run concurrently. Conditions never compete on this host.
      const developed = await Promise.all(
        batch.subjects.map(async (subject) => {
          const start = performance.now()
          try {
            const measurement = await deps.measure({
              cwd: subject.checkout,
              promptFile: subject.promptFile,
              outputDirectory: join(root, "evidence", subject.id),
              condition: subject.condition,
              approvalMode: manifest.config.approvalMode,
              model: manifest.config.model,
              reasoningEffort: manifest.config.reasoningEffort,
              redpactUrl: new URL("/mcp", manifest.config.redpactOrigin ?? "http://127.0.0.1").href,
              timeoutMs: manifest.config.timeoutMs,
            })
            return { subject, measurement }
          } catch (error) {
            const metadata = {
              elapsedMs: performance.now() - start,
              exitCode: null,
              infrastructureError: String(error),
              timedOut: false,
            }
            return { subject, measurement: { metadata, summary: summarizeRun("", metadata) } }
          }
        }),
      )
      const developmentElapsedMs = performance.now() - started
      for (const { subject, measurement } of developed) {
        const { evaluation, digest, scopeViolations } = await scoreCandidate(
          manifest,
          subject,
          measurement.summary.status,
          deps.evaluate,
        )
        const threadId = measurement.summary.threadId
        const freshContext = threadId !== null && !threadIds.has(threadId)
        if (threadId) {
          threadIds.add(threadId)
        }
        const row = {
          freshContext,
          comparisonEligible: false,
          condition: subject.condition,
          taskId: subject.task.id,
          repetition: subject.repetition,
          measurement,
          evaluation,
          subjectId: subject.id,
          sourceDigest: digest,
          scopeViolations,
          conditionCompliance: "requires_trace_review",
          resourceCleanupVerified: false,
        }
        rows.push(row)
        await save(join(root, "evidence", `${subject.id}-result.json`), row)
      }
      batches.push({
        condition: batch.condition,
        repetition: batch.repetition,
        developmentElapsedMs,
        totalElapsedMs: performance.now() - started,
      })
    }
    const report = {
      schemaVersion: 1,
      baseline: manifest.baseline,
      rows,
      batches,
      conditions: aggregateConditions(rows),
      coordinator: { kind: "deterministic-process", modelTokens: 0 },
      limitations: [
        "Independent candidate scoring; no merged-batch integration score.",
        "Transport restrictions are instructions, not a security boundary; review traces before causal claims.",
        "Resource cleanup requires independent inspection.",
      ],
    }
    await save(join(root, "report.json"), report)
    return report
  } catch (error) {
    await save(join(root, `blocked-${Date.now()}.json`), {
      status: "blocked",
      reason: String(error),
    })
    throw error
  } finally {
    await rm(lock)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [action, path] = process.argv.slice(2)
  if (!path || !["prepare", "run"].includes(action)) {
    throw new Error("Usage: node tools/pilot/batch.ts prepare CONFIG.json | run MANIFEST.json")
  }
  const input = JSON.parse(await readFile(path, "utf8"))
  if (action === "prepare") {
    const manifest = await prepareBatch(input)
    console.log(join(manifest.config.root, "manifest.json"))
  } else {
    const report = await runBatch(input)
    console.log(JSON.stringify(report, null, 2))
    if (
      report.rows.some(
        (row) =>
          row.measurement.summary.status !== "completed" ||
          row.evaluation.status === "infrastructure_error",
      )
    ) {
      process.exitCode = 2
    }
  }
}
