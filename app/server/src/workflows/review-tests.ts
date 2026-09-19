import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import { problem } from "../core/problems.js"
import type { Submission } from "../core/types/contracts.js"
import type {
  ReviewInput,
  ReviewRecord,
  ReviewStore,
  ReviewTests,
  ReviewView,
} from "../core/types/reviews.js"
import type { ExecuteTests, RunQueries, SubmissionsService } from "../core/types/services.js"
import type { SettingsResult, SettingsService, TestSelection } from "../core/types/settings.js"

export function createReviewTests(deps: {
  store: ReviewStore
  collect(
    input: ReviewInput,
  ): Promise<{ submission: Submission; settings: SettingsResult; selection: TestSelection }>
  settings(path: string): SettingsService | Promise<SettingsService>
  submissions: Pick<SubmissionsService, "get">
  execute: Pick<ExecuteTests, "start" | "cancel">
  runs: Pick<RunQueries, "get">
}): ReviewTests {
  const records = new Map(deps.store.list().map((record) => [record.id, record]))
  const active = new Map<string, Promise<ReviewView>>()
  const policyToken = randomBytes(32).toString("hex")
  let closing = false
  function save(record: ReviewRecord) {
    deps.store.save(record)
    records.set(record.id, record)
  }
  for (const record of records.values()) {
    if (record.state === "starting") {
      save({
        ...record,
        state: "interrupted",
        error:
          "Server stopped during run admission; inspect run history before starting a new request.",
      })
    }
  }
  function find(id: string) {
    return records.get(id) ?? [...records.values()].find((record) => record.runId === id)
  }
  function view(record: ReviewRecord): ReviewView {
    const { token: _token, ...review } = record
    return {
      review,
      submission: deps.submissions.get(record.submissionId),
      ...(record.runId ? { run: deps.runs.get(record.runId) } : {}),
    }
  }
  function authorized(token: string, expected: string) {
    const received = Buffer.from(token)
    const target = Buffer.from(expected)
    if (received.length !== target.length || !timingSafeEqual(received, target)) {
      problem("invalid_input", "Invalid UI capability")
    }
  }
  async function validate(record: ReviewRecord, selection = record.selection) {
    const settings = await (await deps.settings(record.path)).read(selection)
    if (!settings.valid || settings.digest !== record.settingsDigest) {
      problem(
        "configuration_error",
        "Settings changed or became invalid during review; call run_tests again",
      )
    }
    return settings
  }
  async function execute(record: ReviewRecord) {
    await validate(record)
    if (closing) {
      problem("closing", "Server is shutting down")
    }
    save({ ...record, state: "starting" })
    try {
      const run = await deps.execute.start(
        record.submissionId,
        record.selection,
        record.settingsDigest,
      )
      const started = { ...record, state: "started" as const, runId: run.id }
      save(started)
      return view(started)
    } catch (error) {
      save({
        ...record,
        state: "failed",
        error: error instanceof Error ? error.message : "Run admission failed",
      })
      throw error
    }
  }
  async function exclusive(id: string, operation: () => Promise<ReviewView>): Promise<ReviewView> {
    const previous = active.get(id)
    if (previous) {
      await previous.catch(() => {})
    }
    if (active.has(id)) {
      return exclusive(id, operation)
    }
    const task = operation()
    active.set(id, task)
    try {
      return await task
    } finally {
      active.delete(id)
    }
  }
  return {
    async start(input) {
      if (closing) {
        problem("closing", "Server is shutting down")
      }
      const policy = deps.store.policy()
      const { submission, settings, selection } = await deps.collect(input)
      if (!settings.digest || !settings.settings) {
        problem("configuration_error", "Settings are unavailable")
      }
      const record: ReviewRecord = {
        version: 1,
        id: randomUUID(),
        path: input.path,
        submissionId: submission.id,
        settingsDigest: settings.digest,
        selection,
        policy,
        state: "pending",
        revision: 0,
        environmentApproved: false,
        testsApproved: false,
        token: randomBytes(32).toString("hex"),
        createdAt: new Date().toISOString(),
        dependencies: Object.fromEntries(
          Object.entries(settings.settings.dependencies).map(([name, definition]) => [
            name,
            Object.keys(definition.modes),
          ]),
        ),
      }
      if (closing) {
        problem("closing", "Server is shutting down")
      }
      save(record)
      if (policy === "ask") {
        return view(record)
      }
      return exclusive(record.id, () => execute(record))
    },
    get(id) {
      const record = find(id)
      return record ? view(record) : undefined
    },
    async approve(input) {
      return exclusive(input.id, async () => {
        const record = records.get(input.id) ?? problem("not_found", "Review request not found")
        authorized(input.token, record.token)
        if (record.policy !== "ask") {
          problem("invalid_input", "Automatic requests do not record human approval")
        }
        if (record.state === "started") {
          return view(record)
        }
        if (record.state !== "pending" || record.revision !== input.revision) {
          problem("invalid_input", "Review changed; reopen the latest request")
        }
        if (input.subject === "tests" && !record.environmentApproved) {
          problem("invalid_input", "Approve the environment selection first")
        }
        if (input.subject === "tests" && input.selection) {
          problem("invalid_input", "Test approval cannot change environment selection")
        }
        const selection = input.selection ?? record.selection
        await validate(record, selection)
        const updated: ReviewRecord = { ...record, selection, revision: record.revision + 1 }
        if (input.subject === "environment") {
          updated.environmentApproved = true
          updated.testsApproved = false
        } else {
          updated.testsApproved = true
        }
        save(updated)
        if (updated.environmentApproved && updated.testsApproved) {
          return execute(updated)
        }
        return view(updated)
      })
    },
    async cancel(id) {
      const record = find(id)
      if (!record) {
        return undefined
      }
      return exclusive(record.id, async () => {
        const latest = records.get(record.id)!
        if (latest.runId) {
          await deps.execute.cancel(latest.runId)
          return view(latest)
        }
        const cancelled = { ...latest, state: "cancelled" as const, revision: latest.revision + 1 }
        save(cancelled)
        return view(cancelled)
      })
    },
    policy: () => deps.store.policy(),
    changePolicy(token, policy) {
      const valid =
        token === policyToken || [...records.values()].some((record) => record.token === token)
      if (!valid) {
        problem("invalid_input", "Invalid UI capability")
      }
      deps.store.setPolicy(policy)
      return policy
    },
    capability(id) {
      return id ? (find(id) ?? problem("not_found", "Review not found")).token : policyToken
    },
    async close() {
      closing = true
      await Promise.allSettled([...active.values()])
    },
  }
}
