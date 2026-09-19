import { randomUUID } from "node:crypto"
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, resolve } from "node:path"
import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { environmentSchema } from "../../core/environment-schema.js"
import { testSelectionSchema } from "../../core/settings-schema.js"
import { startWorkInput } from "../../core/start-work-schema.js"
import { stepResultSchema } from "../../core/step-schema.js"
import { resourceLimitSchema } from "../../core/test-resource-schema.js"
import { trackingSchema } from "../../core/tracking-schema.js"
import type { Run, Store, Submission, WorkItem } from "../../core/types/contracts.js"

const id = z.string().regex(/^[a-zA-Z0-9_-]+$/)
const workStartSchema = z.strictObject({
  id,
  input: startWorkInput,
  checkoutRoot: z.string(),
  revision: z.string(),
  worktreeId: id,
  workItemId: id,
  createdAt: z.string(),
  state: z.enum(["prepared", "attempted", "created", "completed"]),
})
const binding = { projectId: id, worktreeId: id }
const workSchema = z.strictObject({ id, intent: z.string(), createdAt: z.string(), ...binding })
const projectSchema = z.strictObject({
  tracking: trackingSchema.optional(),
  id,
  name: z.string(),
  createdAt: z.string(),
  location: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("git"), commonGitdir: z.string(), projectPath: z.string() }),
    z.strictObject({ kind: z.literal("directory"), root: z.string() }),
  ]),
})
const worktreeSchema = z.strictObject({
  id,
  projectId: id,
  checkoutRoot: z.string(),
  projectRoot: z.string(),
  gitdir: z.string().nullable(),
  createdAt: z.string(),
})
const targetSchema = z.strictObject({
  projectId: id,
  worktreeId: id,
  projectRoot: z.string(),
  checkoutRoot: z.string(),
})
const submissionSchema = z.strictObject({
  id,
  workItemId: id,
  ...binding,
  files: z.array(z.strictObject({ path: z.string(), source: z.string() })),
  digest: z.string(),
  runnerVersion: z.string(),
  createdAt: z.string(),
  projectRoot: z.string().optional(),
  parsed: z.array(
    z.strictObject({
      path: z.string(),
      review: z.strictObject({
        scenarios: z.array(
          z.strictObject({
            title: z.string(),
            intent: z.string().nullable(),
            line: z.number(),
            assertions: z.array(
              z.strictObject({
                code: z.string(),
                reason: z.string().nullable(),
                line: z.number(),
                observed: z.literal("unknown"),
              }),
            ),
          }),
        ),
        limitations: z.array(z.string()),
      }),
    }),
  ),
})
const runSchema = z.strictObject({
  environmentPolicy: z
    .strictObject({
      source: z.literal("new"),
      retain: z.literal("never"),
    })
    .optional(),
  environmentId: z.string().uuid().optional(),
  target: targetSchema,
  id,
  submissionId: id,
  state: z.enum(["queued", "running", "finished"]),
  result: z
    .strictObject({
      outcome: z.enum([
        "passed",
        "assertion_failed",
        "collection_error",
        "execution_error",
        "environment_error",
        "configuration_error",
        "cancelled",
        "interrupted",
        "unknown",
      ]),
      cases: z.array(
        z.strictObject({
          steps: z.array(stepResultSchema).max(200).optional(),
          name: z.string(),
          file: z.string(),
          state: z.string(),
          errors: z.array(
            z.strictObject({ name: z.string(), message: z.string(), stack: z.string().optional() }),
          ),
        }),
      ),
      errors: z.array(z.string()),
      resourceLimit: resourceLimitSchema.optional(),
    })
    .nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  limitations: z.array(z.string()),
  git: z
    .discriminatedUnion("available", [
      z.strictObject({ available: z.literal(false), reason: z.string() }),
      z.strictObject({
        available: z.literal(true),
        root: z.string(),
        gitdir: z.string(),
        commonGitdir: z.string(),
        branch: z.string().nullable().optional(),
        revision: z.string().nullable(),
        dirty: z.boolean(),
        changes: z.array(
          z.strictObject({
            path: z.string(),
            head: z.number(),
            worktree: z.number(),
            stage: z.number(),
          }),
        ),
      }),
    ])
    .optional(),
  settings: z.strictObject({ file: z.string(), source: z.string(), digest: z.string() }).optional(),
})

const worktreeSelectionSchema = z.strictObject({
  id: z.string().uuid(),
  selection: testSelectionSchema,
  updatedAt: z.iso.datetime(),
})

export function openStore(directory: string) {
  const root = resolve(directory)
  mkdirSync(root, { recursive: true, mode: 0o700 })
  const lockPath = join(root, ".writer.lock")
  let lock: number
  try {
    lock = openSync(lockPath, "wx", 0o600)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error
    }
    throw new Error(
      `State directory is locked: ${lockPath}. Stop its owner before removing a stale lock.`,
    )
  }
  // The writer owns immutable records; keep only ordering metadata, never source bundles.
  type SubmissionOrder = Pick<Submission, "id" | "createdAt" | "worktreeId">
  let submissionOrder: Map<string, SubmissionOrder[]> | undefined
  const submissionCursors = new Map<string, SubmissionOrder>()
  function compareSubmissions(a: SubmissionOrder, b: SubmissionOrder) {
    return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
  }
  function insertionIndex(items: SubmissionOrder[], value: SubmissionOrder) {
    let low = 0
    let high = items.length
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (compareSubmissions(items[middle], value) < 0) {
        low = middle + 1
      } else {
        high = middle
      }
    }
    return low
  }
  function rememberSubmission(
    value: Submission,
    index: Map<string, SubmissionOrder[]>,
    ordered = true,
  ) {
    if (!value.worktreeId) {
      throw new Error("Submission worktree binding is required")
    }
    const entry = { id: value.id, createdAt: value.createdAt, worktreeId: value.worktreeId }
    const items = index.get(value.worktreeId) ?? []
    if (ordered) {
      items.splice(insertionIndex(items, entry), 0, entry)
    } else {
      items.push(entry)
    }
    index.set(value.worktreeId, items)
    submissionCursors.set(entry.id, entry)
  }
  function submissionsByWorktree() {
    ensureOpen()
    if (submissionOrder) {
      return submissionOrder
    }
    const index = new Map<string, SubmissionOrder[]>()
    const path = join(root, "submissions")
    // Rebuild after restart from canonical records; a failed scan never publishes a partial index.
    submissionCursors.clear()
    const names = existsSync(path) ? readdirSync(path) : []
    for (const name of names) {
      if (!name.endsWith(".json")) {
        continue
      }
      const value = store.getSubmission(name.slice(0, -5))
      if (!value) {
        throw new Error(`Missing persisted submission: ${name}`)
      }
      rememberSubmission(value, index, false)
    }
    for (const items of index.values()) {
      items.sort(compareSubmissions)
    }
    submissionOrder = index
    return submissionOrder
  }
  let closed = false
  function close() {
    if (closed) {
      return
    }
    closed = true
    closeSync(lock)
    unlinkSync(lockPath)
  }
  function ensureOpen() {
    if (closed) {
      throw new Error("State store is closed")
    }
  }
  function pathFor(kind: string, key: string) {
    id.parse(key)
    return kind === "runs" ? join(root, kind, key, "state.json") : join(root, kind, `${key}.json`)
  }
  function read<T>(kind: string, key: string, schema: z.ZodType<T>): T | undefined {
    ensureOpen()
    if (!id.safeParse(key).success) {
      return undefined
    }
    let source: string
    const path = pathFor(kind, key)
    try {
      source = readFileSync(path, "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined
      }
      throw error
    }
    try {
      const record = z
        .strictObject({ version: z.literal(1), data: schema })
        .parse(JSON.parse(source))
      if ((record.data as { id: string }).id !== key) {
        throw new Error("Mismatched record ID")
      }
      return record.data
    } catch {
      throw new Error(
        `Invalid persisted record: ${path}. Restore it from a backup before continuing.`,
      )
    }
  }
  function write(kind: string, value: { id: string }, replace = false) {
    ensureOpen()
    const path = pathFor(kind, value.id)
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    const temporary = `${path}.${randomUUID()}.tmp`
    const file = openSync(temporary, "wx", 0o600)
    try {
      const record = { version: 1, data: value }
      writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
      fsyncSync(file)
    } finally {
      closeSync(file)
    }
    try {
      if (replace) {
        renameSync(temporary, path)
      } else {
        linkSync(temporary, path)
      }
    } finally {
      if (existsSync(temporary)) {
        unlinkSync(temporary)
      }
    }
  }
  function list<T>(kind: string, get: (key: string) => T | undefined): T[] {
    ensureOpen()
    const path = join(root, kind)
    if (!existsSync(path)) {
      return []
    }
    return readdirSync(path)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .flatMap((name) => {
        const value = get(name.slice(0, -5))
        return value ? [value] : []
      })
  }
  function checkBinding(value: { projectId?: string; worktreeId?: string }) {
    const worktree = value.worktreeId ? store.getWorktree(value.worktreeId) : undefined
    if (!worktree || worktree.projectId !== value.projectId) {
      throw new Error("Invalid worktree binding")
    }
  }
  const store: Store = {
    getWorktreeSelection(key) {
      const value = read("worktree-selections", key, worktreeSelectionSchema)
      if (value && !store.getWorktree(key)) {
        throw new Error("Selection worktree does not exist")
      }
      return value
    },
    saveWorktreeSelection(value) {
      const parsed = worktreeSelectionSchema.parse(value)
      if (!store.getWorktree(parsed.id)) {
        throw new Error("Selection worktree does not exist")
      }
      const previous = store.getWorktreeSelection(parsed.id)
      if (previous && isDeepStrictEqual(previous.selection, parsed.selection)) {
        return
      }
      write("worktree-selections", parsed, Boolean(previous))
    },
    saveEnvironment(value) {
      checkBinding(value.target)
      const previous = store.getEnvironment(value.id)
      if (
        previous &&
        (previous.requestId !== value.requestId ||
          previous.ownerId !== value.ownerId ||
          JSON.stringify(previous.target) !== JSON.stringify(value.target) ||
          previous.inputDigest !== value.inputDigest ||
          previous.projectName !== value.projectName ||
          previous.settingsDigest !== value.settingsDigest ||
          JSON.stringify(previous.settings) !== JSON.stringify(value.settings) ||
          previous.lifecycle !== value.lifecycle ||
          !isDeepStrictEqual(previous.specification, value.specification) ||
          !isDeepStrictEqual(previous.projectRules, value.projectRules) ||
          !isDeepStrictEqual(previous.selection, value.selection) ||
          !isDeepStrictEqual(previous.plan, value.plan) ||
          !isDeepStrictEqual(previous.bundle, value.bundle) ||
          previous.runIds.some((id, index) => value.runIds[index] !== id))
      ) {
        throw new Error("Environment identity cannot change")
      }
      write("environments", environmentSchema.parse(value), Boolean(previous))
    },
    getEnvironment(key) {
      const value = read("environments", key, environmentSchema)
      if (value) {
        checkBinding(value.target)
      }
      return value
    },
    listEnvironments: () => list("environments", store.getEnvironment),
    saveWorkStart(value) {
      const parsed = workStartSchema.parse(value)
      if (parsed.id !== parsed.input.requestId || !store.getProject(parsed.input.projectId)) {
        throw new Error("Invalid work start project or request ID")
      }
      const previous = store.getWorkStart(value.id)
      if (
        previous &&
        JSON.stringify({ ...previous, state: value.state }) !== JSON.stringify(value)
      ) {
        throw new Error("Work start identity cannot change")
      }
      const states = ["prepared", "attempted", "created", "completed"]
      if (!previous && value.state !== "prepared") {
        throw new Error("Invalid initial work start transition")
      }
      if (
        previous &&
        (states.indexOf(value.state) < states.indexOf(previous.state) ||
          states.indexOf(value.state) > states.indexOf(previous.state) + 1)
      ) {
        throw new Error("Invalid work start transition")
      }
      write("work-starts", parsed, Boolean(previous))
    },
    getWorkStart: (key) => read("work-starts", key, workStartSchema),
    listWorkStarts: () => list("work-starts", store.getWorkStart),
    createProject(value) {
      write("projects", projectSchema.parse(value))
    },
    promoteProject(value) {
      const previous = store.getProject(value.id)
      if (
        previous?.location.kind !== "directory" ||
        value.location.kind !== "git" ||
        JSON.stringify({ ...previous, location: value.location }) !== JSON.stringify(value) ||
        store
          .listProjects()
          .some(
            (item) =>
              item.id !== value.id &&
              JSON.stringify(item.location) === JSON.stringify(value.location),
          )
      ) {
        throw new Error("Only an unclaimed directory-to-Git promotion is allowed")
      }
      write("projects", projectSchema.parse(value), true)
    },
    updateProject(value) {
      const previous = store.getProject(value.id)
      if (
        !previous ||
        JSON.stringify({ ...previous, tracking: value.tracking }) !== JSON.stringify(value)
      ) {
        throw new Error("Project identity cannot change")
      }
      write("projects", projectSchema.parse(value), true)
    },
    getProject: (key) => read("projects", key, projectSchema),
    listProjects: () => list("projects", store.getProject),
    saveWorktree(value) {
      if (!store.getProject(value.projectId)) {
        throw new Error("Worktree project does not exist")
      }
      const previous = store.getWorktree(value.id)
      const parsed = worktreeSchema.parse(value)
      if (previous) {
        if (!isDeepStrictEqual(previous, parsed)) {
          throw new Error("Worktree identity cannot change")
        }
        return
      }
      write("worktrees", parsed)
    },
    getWorktree(key) {
      const value = read("worktrees", key, worktreeSchema)
      if (value && !store.getProject(value.projectId)) {
        throw new Error("Worktree project does not exist")
      }
      return value
    },
    listWorktrees: () => list("worktrees", store.getWorktree),
    listWorkItems: () => list("work-items", store.getWorkItem),
    createWorkItem(value: WorkItem) {
      checkBinding(value)
      write("work-items", workSchema.parse(value))
    },
    getWorkItem(key) {
      const value = read("work-items", key, workSchema)
      if (value) {
        checkBinding(value)
      }
      return value
    },
    listSubmissions: () => list("submissions", store.getSubmission),
    submissionPage(worktreeId, before, limit) {
      const items = submissionsByWorktree().get(worktreeId) ?? []
      let start = 0
      if (before) {
        const cursor = submissionCursors.get(before)
        if (!cursor || cursor.worktreeId !== worktreeId) {
          return undefined
        }
        start = insertionIndex(items, cursor) + 1
      }
      return items.slice(start, start + limit).map((entry) => {
        const value = store.getSubmission(entry.id)
        if (!value || compareSubmissions(value, entry) !== 0 || value.worktreeId !== worktreeId) {
          throw new Error(`Persisted submission changed outside its writer: ${entry.id}`)
        }
        return value
      })
    },
    listRuns() {
      ensureOpen()
      const path = join(root, "runs")
      if (!existsSync(path)) {
        return []
      }
      return readdirSync(path, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((entry) => {
          const run = store.getRun(entry.name)
          return run ? [run] : []
        })
    },
    createSubmission(value: Submission) {
      if (!store.getWorkItem(value.workItemId)) {
        throw new Error("Submission work item does not exist")
      }
      checkBinding(value)
      const parent = store.getWorkItem(value.workItemId)
      if (parent?.worktreeId !== value.worktreeId || parent?.projectId !== value.projectId) {
        throw new Error("Submission binding differs from work item")
      }
      const parsed = submissionSchema.parse(value)
      write("submissions", parsed)
      if (submissionOrder) {
        rememberSubmission(parsed, submissionOrder)
      }
    },
    getSubmission(key) {
      const value = read("submissions", key, submissionSchema)
      if (value) {
        checkBinding(value)
        const parent = store.getWorkItem(value.workItemId)
        if (
          !parent ||
          parent.worktreeId !== value.worktreeId ||
          parent.projectId !== value.projectId
        ) {
          throw new Error("Invalid submission parent")
        }
      }
      return value
    },
    saveRun(value: Run) {
      if (!store.getSubmission(value.submissionId)) {
        throw new Error("Run submission does not exist")
      }
      if (value.environmentId) {
        const environment = store.getEnvironment(value.environmentId)
        if (
          !environment ||
          !environment.runIds.includes(value.id) ||
          environment.target.worktreeId !== value.target?.worktreeId
        ) {
          throw new Error("Invalid run environment")
        }
      }
      const previous = store.getRun(value.id)
      if (
        previous &&
        JSON.stringify(previous.environmentPolicy) !== JSON.stringify(value.environmentPolicy)
      ) {
        throw new Error("Run environment policy cannot change")
      }
      if (previous && previous.environmentId !== value.environmentId) {
        const preparation = value.environmentId
          ? store.getEnvironment(value.environmentId)
          : undefined
        if (
          previous.environmentId ||
          previous.environmentPolicy?.source !== "new" ||
          preparation?.requestId !== value.id ||
          previous.state === "running"
        ) {
          throw new Error("Run environment cannot change")
        }
      }
      if (previous && previous.submissionId !== value.submissionId) {
        throw new Error("Run submission cannot change")
      }
      if (previous && JSON.stringify(previous.target) !== JSON.stringify(value.target)) {
        throw new Error("Run target cannot change")
      }
      const submission = store.getSubmission(value.submissionId)
      if (
        submission?.worktreeId !== value.target?.worktreeId ||
        submission?.projectId !== value.target?.projectId
      ) {
        throw new Error("Run target differs from submission")
      }
      if (value.target) {
        const worktree = store.getWorktree(value.target.worktreeId)
        if (
          !worktree ||
          worktree.projectRoot !== value.target.projectRoot ||
          worktree.checkoutRoot !== value.target.checkoutRoot
        ) {
          throw new Error("Invalid run target paths")
        }
      }
      write("runs", runSchema.parse(value), true)
    },
    getRun(key) {
      const value = read("runs", key, runSchema)
      if (value?.environmentId) {
        const environment = store.getEnvironment(value.environmentId)
        if (
          !environment ||
          !environment.runIds.includes(value.id) ||
          environment.target.worktreeId !== value.target?.worktreeId
        ) {
          throw new Error("Invalid run environment linkage")
        }
      }
      if (value) {
        const parent = store.getSubmission(value.submissionId)
        if (
          !parent ||
          parent.worktreeId !== value.target?.worktreeId ||
          parent.projectId !== value.target?.projectId
        ) {
          throw new Error("Invalid run target or submission parent")
        }
        if (value.target) {
          const worktree = store.getWorktree(value.target.worktreeId)
          if (
            !worktree ||
            worktree.projectRoot !== value.target.projectRoot ||
            worktree.checkoutRoot !== value.target.checkoutRoot
          ) {
            throw new Error("Invalid run target paths")
          }
        }
      }
      return value
    },
    unfinishedRuns() {
      ensureOpen()
      const path = join(root, "runs")
      if (!existsSync(path)) {
        return []
      }
      return readdirSync(path, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((entry) => {
          const run = store.getRun(entry.name)
          return run && run.state !== "finished" ? [run] : []
        })
    },
  }
  try {
    writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }))
    fsyncSync(lock)
  } catch (error) {
    close()
    throw error
  }
  return { store, close }
}
