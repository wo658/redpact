import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

type JsonObject = Record<string, unknown>

export interface RunMetadata {
  elapsedMs: number | null
  exitCode: number | null
  infrastructureError?: string | null
}

function object(value: unknown): JsonObject | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as JsonObject
}

function token(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null
}

function sumTokens(values: (number | null)[]): number | null {
  if (values.length === 0 || values.includes(null)) {
    return null
  }
  return token(values.reduce<number>((sum, value) => sum + (value ?? 0), 0))
}

function usageSummary(turns: (JsonObject | null)[], incomplete: boolean) {
  const rows = incomplete ? [...turns, null] : turns
  const inputTokens = sumTokens(rows.map((row) => token(row?.input_tokens)))
  const outputTokens = sumTokens(rows.map((row) => token(row?.output_tokens)))
  const cachedInputTokens = sumTokens(
    rows.map((row) => {
      const input = token(row?.input_tokens)
      const cached = token(row?.cached_input_tokens)
      return input !== null && cached !== null && cached <= input ? cached : null
    }),
  )
  const reasoningOutputTokens = sumTokens(
    rows.map((row) => {
      const output = token(row?.output_tokens)
      const reasoning = token(row?.reasoning_output_tokens)
      return output !== null && reasoning !== null && reasoning <= output ? reasoning : null
    }),
  )
  return {
    complete: inputTokens !== null && cachedInputTokens !== null && outputTokens !== null,
    inputTokens,
    cachedInputTokens,
    uncachedInputTokens:
      inputTokens !== null && cachedInputTokens !== null ? inputTokens - cachedInputTokens : null,
    outputTokens,
    reasoningOutputTokens,
    totalTokens:
      inputTokens !== null && outputTokens !== null ? token(inputTokens + outputTokens) : null,
  }
}

function parseTrace(trace: string) {
  const events: JsonObject[] = []
  let malformedLines = 0
  for (const line of trace.split(/\r?\n/)) {
    if (line.trim().length === 0) {
      continue
    }
    try {
      const event = object(JSON.parse(line))
      if (!event || typeof event.type !== "string") {
        malformedLines += 1
        continue
      }
      events.push(event)
    } catch {
      malformedLines += 1
    }
  }
  return { events, malformedLines }
}

function recordedOutputBytes(item: JsonObject): number | null {
  if (item.type === "command_execution" && typeof item.aggregated_output === "string") {
    return Buffer.byteLength(item.aggregated_output)
  }
  if (item.type === "mcp_tool_call" && item.result !== undefined && item.result !== null) {
    return Buffer.byteLength(JSON.stringify(item.result))
  }
  return null
}

function collectTools(events: JsonObject[]) {
  const kinds = new Map<string, string>()
  const outputs = new Map<string, number>()
  for (const event of events) {
    if (event.type !== "item.started" && event.type !== "item.completed") {
      continue
    }
    const item = object(event.item)
    if (!item || typeof item.id !== "string" || typeof item.type !== "string") {
      continue
    }
    kinds.set(item.id, item.type)
    if (event.type === "item.completed") {
      const bytes = recordedOutputBytes(item)
      if (bytes !== null) {
        outputs.set(item.id, bytes)
      }
    }
  }
  const types = [...kinds.values()]
  return {
    toolCalls: {
      command: types.filter((kind) => kind === "command_execution").length,
      mcp: types.filter((kind) => kind === "mcp_tool_call").length,
      webSearch: types.filter((kind) => kind === "web_search").length,
    },
    // Serialized recorded outputs are a byte proxy, not model-visible token counts.
    toolOutputBytes: [...outputs.values()].reduce((sum, bytes) => sum + bytes, 0),
  }
}

function collectTurns(events: JsonObject[]) {
  const usage: (JsonObject | null)[] = []
  let open = false
  let terminalSeen = false
  let completedTurns = 0
  let failedTurns = 0
  let duplicateTerminalEvents = 0
  for (const event of events) {
    if (event.type === "turn.started") {
      if (open) {
        usage.push(null)
      }
      open = true
      terminalSeen = false
      continue
    }
    if (event.type !== "turn.completed" && event.type !== "turn.failed") {
      continue
    }
    if (terminalSeen) {
      duplicateTerminalEvents += 1
      continue
    }
    terminalSeen = true
    open = false
    usage.push(object(event.usage))
    if (event.type === "turn.completed") {
      completedTurns += 1
    } else {
      failedTurns += 1
    }
  }
  return { usage, open, completedTurns, failedTurns, duplicateTerminalEvents }
}

export function summarizeRun(trace: string, metadata: RunMetadata) {
  const { events, malformedLines } = parseTrace(trace)
  const turns = collectTurns(events)
  const errorEvents = events.filter((event) => event.type === "error").length
  const thread = events.find((event) => event.type === "thread.started")
  let status: "completed" | "failed" | "incomplete" = "incomplete"
  if (
    metadata.infrastructureError ||
    turns.failedTurns > 0 ||
    (metadata.exitCode !== null && metadata.exitCode !== 0)
  ) {
    status = "failed"
  } else if (
    metadata.exitCode === 0 &&
    turns.completedTurns > 0 &&
    !turns.open &&
    malformedLines === 0
  ) {
    status = "completed"
  }
  return {
    schemaVersion: 1,
    threadId: typeof thread?.thread_id === "string" ? thread.thread_id : null,
    status,
    elapsedMs:
      typeof metadata.elapsedMs === "number" &&
      Number.isFinite(metadata.elapsedMs) &&
      metadata.elapsedMs >= 0
        ? metadata.elapsedMs
        : null,
    exitCode: metadata.exitCode,
    infrastructureError: metadata.infrastructureError ?? null,
    errorEvents,
    malformedLines,
    completedTurns: turns.completedTurns,
    failedTurns: turns.failedTurns,
    duplicateTerminalEvents: turns.duplicateTerminalEvents,
    usage: usageSummary(turns.usage, turns.open || malformedLines > 0),
    ...collectTools(events),
    peakContextTokens: null,
    compactionCount: null,
  }
}

// Metadata contains only timing/process status; raw event content stays in local evidence.
async function main() {
  const [tracePath, metadataPath] = process.argv.slice(2)
  if (!tracePath || !metadataPath) {
    throw new Error(
      "Usage: node --experimental-strip-types tools/pilot/metrics.ts TRACE.jsonl METADATA.json",
    )
  }
  const [trace, rawMetadata] = await Promise.all([
    readFile(tracePath, "utf8"),
    readFile(metadataPath, "utf8"),
  ])
  const metadata = object(JSON.parse(rawMetadata))
  if (!metadata || !("elapsedMs" in metadata) || !("exitCode" in metadata)) {
    throw new Error("Metadata must include elapsedMs and exitCode (null is allowed).")
  }
  if (metadata.exitCode !== null && !Number.isInteger(metadata.exitCode)) {
    throw new Error("Metadata exitCode must be an integer or null.")
  }
  console.log(JSON.stringify(summarizeRun(trace, metadata as unknown as RunMetadata), null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main()
}
