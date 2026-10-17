import { resolve } from "node:path"
import { Command, CommanderError, Option } from "commander"

export interface CliIO {
  cwd: string
  env: Record<string, string | undefined>
  stdout: (text: string) => void
  stderr: (text: string) => void
  stdin: () => Promise<string>
  fetch: (url: string, init?: RequestInit) => Promise<Response>
  write: (path: string, bytes: Uint8Array) => Promise<void>
  open: (url: string) => Promise<void>
  now: () => number
  sleep: (ms: number) => Promise<void>
  start?: (server: string, dataDir?: string) => Promise<unknown>
  version?: string
}
type Options = Record<string, string | boolean | string[] | undefined>
class CliError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly exit = 2,
    readonly details?: unknown,
  ) {
    super(message)
  }
}
const encode = encodeURIComponent
const choices = (flag: string, values: string[], required = false) =>
  new Option(flag).choices(values).makeOptionMandatory(required)
const kindOption = () => choices("--kind <kind>", ["unit", "integration", "playwright"], true)
function input(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new CliError("INVALID_INPUT", message)
  }
}
function json(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new CliError("INVALID_JSON", "Expected valid JSON input; supplied values are not echoed.")
  }
}

function parseViewport(value: string) {
  const match = /^(\d+)x(\d+)$/.exec(value)
  input(match, "Viewport must be WIDTHxHEIGHT")
  const width = Number(match[1])
  const height = Number(match[2])
  input(
    width >= 320 && width <= 3840 && height >= 240 && height <= 2160,
    "Viewport dimensions are outside supported bounds",
  )
  return { width, height }
}

export async function runAgentCli(args: string[], io: CliIO): Promise<number> {
  let result: unknown
  let exit = 0
  const root = new Command("redpact")
    .description("Manage Redpact execution, settings and evidence")
    .version(io.version ?? "development")
    .option(
      "--server <url>",
      "Explicit runtime origin",
      io.env.REDPACT_SERVER_URL ?? "http://127.0.0.1:54318",
    )
    .option("--json", "Emit one versioned JSON document")
    .exitOverride()
    .configureOutput({ writeOut: io.stdout, writeErr: () => {} })
  const options = (cmd: Command): Options => cmd.optsWithGlobals<Options>()
  function server(): string {
    let url: URL
    try {
      url = new URL(String(root.opts().server))
    } catch {
      throw new CliError("INVALID_SERVER", "Expected an HTTP loopback server origin")
    }
    input(
      ["http:", "https:"].includes(url.protocol) &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
        !url.username &&
        !url.password &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash,
      "Expected an HTTP loopback server origin",
    )
    return url.origin
  }
  async function request(
    path: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
    binary = false,
  ): Promise<unknown> {
    const response = await io.fetch(`${server()}${path}`, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    })
    if (!response.ok) {
      let details: unknown
      try {
        details = await response.json()
      } catch {
        details = undefined
      }
      const status = response.status
      let code = status < 500 ? "INVALID_INPUT" : "SERVER_ERROR"
      let exitCode = status < 500 ? 2 : 1
      if (status === 409) {
        code = "CONFLICT"
        exitCode = 6
      }
      if (status === 404) {
        code = "NOT_FOUND"
      }
      throw new CliError(code, `Redpact request failed (HTTP ${status}).`, exitCode, details)
    }
    if (binary) {
      return new Uint8Array(await response.arrayBuffer())
    }
    if (response.headers.get("content-type")?.includes("application/json")) {
      return response.json()
    }
    return { text: await response.text() }
  }
  function query(path: string, values: Record<string, unknown>): string {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined) {
        params.set(key, String(value))
      }
    }
    return `${path}?${params}`
  }
  const pathOf = (o: Options) => resolve(io.cwd, String(o.path ?? "."))
  const withPath = (c: Command) =>
    c.option("--path <path>", "Execution checkout; defaults to current directory")
  const withId = (c: Command) => c.requiredOption("--id <id>", "Recorded identity")
  const withProject = (c: Command) => c.requiredOption("--project <id>", "Project identity")
  const action = (c: Command, fn: (o: Options) => Promise<unknown>) =>
    c.action(async (_opts, command: Command) => {
      const selected = options(command)
      if (selected.wait || command.name() === "wait") {
        input(
          Number.isFinite(Number(selected.waitTimeout)) && Number(selected.waitTimeout) > 0,
          "Wait timeout must be positive seconds",
        )
      }
      result = await fn(selected)
    })
  async function binding(o: Options): Promise<{ projectId: string; worktreeId: string }> {
    const status = (await request(query("/api/workspace-status", { path: pathOf(o) }))) as {
      observedBinding: { projectId: string; worktreeId: string; disconnected: boolean } | null
    }
    input(
      status.observedBinding && !status.observedBinding.disconnected,
      "Checkout is not connected. Use projects connect explicitly.",
    )
    return status.observedBinding
  }
  const workspace = root.command("workspace")
  action(withPath(workspace.command("status")), (o) =>
    request(query("/api/workspace-status", { path: pathOf(o) })),
  )
  action(withProject(workspace.command("list")), (o) =>
    request(`/api/projects/${encode(String(o.project))}/worktrees`),
  )
  const projects = root.command("projects")
  action(
    projects
      .command("list")
      .addOption(
        choices("--state <state>", ["connected", "disconnected", "all"]).default("connected"),
      ),
    async (o) => {
      const records = await request(
        query("/api/projects", { includeDisconnected: o.state !== "connected" }),
      )
      if (o.state === "disconnected" && Array.isArray(records)) {
        return records.filter((record) => record.disconnectedAt)
      }
      return records
    },
  )
  action(withPath(projects.command("connect")).option("--name <name>"), async (o) => {
    const path = pathOf(o)
    const project = (await request("/api/projects", {
      path,
      ...(o.name ? { name: o.name } : {}),
    })) as { id: string }
    await request(`/api/projects/${encode(project.id)}/worktrees`, { path })
    return project
  })
  action(withProject(projects.command("show")), (o) =>
    request(`/api/projects/${encode(String(o.project))}`),
  )
  action(withProject(projects.command("rename")).requiredOption("--name <name>"), (o) =>
    request(`/api/projects/${encode(String(o.project))}`, { name: o.name }, "PATCH"),
  )
  action(withProject(projects.command("disconnect")), (o) =>
    request(`/api/projects/${encode(String(o.project))}`, undefined, "DELETE"),
  )
  action(withProject(projects.command("reconnect")), (o) =>
    request(`/api/projects/${encode(String(o.project))}/reconnect`, {}),
  )
  const settings = root.command("settings")
  for (const name of ["describe", "get", "patch", "validate", "repair"]) {
    const cmd = withPath(settings.command(name)).addOption(
      choices("--scope <scope>", ["project", "instance"], true),
    )
    if (name === "get") {
      cmd.option("--pointer <pointer>")
    }
    if (name === "patch") {
      cmd
        .option("--revision <revision>")
        .option("--create")
        .option("--patch <json>")
        .option("--patch-stdin")
    }
    if (name === "repair") {
      cmd
        .requiredOption("--revision <revision>")
        .option("--document <json>")
        .option("--document-stdin")
    }
    action(cmd, async (o) => {
      input(o.scope === "project" || !o.path, "--path is only supported for project settings")
      const body: Record<string, unknown> = {
        scope: o.scope,
        ...(o.scope === "project" ? { path: pathOf(o) } : {}),
      }
      if (o.pointer !== undefined) {
        body.pointer = o.pointer
      }
      if (name === "patch") {
        input(
          Boolean(o.revision) !== Boolean(o.create),
          "Supply exactly one of --revision or --create",
        )
        input(
          Boolean(o.patch) !== Boolean(o.patchStdin),
          "Supply exactly one of --patch or --patch-stdin",
        )
        body.patch = json(o.patchStdin ? await io.stdin() : String(o.patch))
        input(Array.isArray(body.patch), "Patch must be an operation array")
        if (o.create) {
          body.create = true
        } else {
          body.revision = o.revision
        }
      }
      if (name === "repair") {
        input(
          Boolean(o.document) !== Boolean(o.documentStdin),
          "Supply exactly one of --document or --document-stdin",
        )
        body.revision = o.revision
        body.value = json(o.documentStdin ? await io.stdin() : String(o.document))
      }
      const response = await request(`/api/agent/settings/${name}`, body)
      if (name === "validate" && (response as { valid?: boolean }).valid === false) {
        exit = 2
      }
      return response
    })
  }
  action(withPath(root.command("dependencies").command("inspect")), async (o) =>
    request(`/api/worktrees/${encode((await binding(o)).worktreeId)}/dependencies`),
  )
  const environment = root.command("environment")
  for (const name of ["inspect", "start", "restart", "stop"]) {
    action(withPath(environment.command(name)), (o) =>
      request("/api/agent/environment", { path: pathOf(o), action: name }),
    )
  }
  const environments = root.command("environments")
  action(withPath(environments.command("list")), async (o) =>
    request(query("/api/environments", { worktreeId: (await binding(o)).worktreeId })),
  )
  action(withId(environments.command("show")), (o) =>
    request(`/api/environments/${encode(String(o.id))}`),
  )
  action(withId(environments.command("stop")), (o) =>
    request(`/api/environments/${encode(String(o.id))}/stop`, {}),
  )
  const waitOptions = (c: Command) =>
    c
      .option("--wait", "Wait until terminal or human approval")
      .option("--wait-timeout <seconds>", "Client-only wait deadline", "600")
  async function wait(initial: unknown, o: Options): Promise<unknown> {
    input(
      Number.isFinite(Number(o.waitTimeout)) && Number(o.waitTimeout) > 0,
      "Wait timeout must be positive seconds",
    )
    const deadline = io.now() + Number(o.waitTimeout) * 1000
    let current = initial as Record<string, unknown>
    for (;;) {
      if (current.state === "awaiting_approval") {
        exit = 4
        return current
      }
      const cleanup = current.cleanup as { state?: string } | undefined
      if (
        ["finished", "passed", "failed", "cancelled", "error", "rejected", "interrupted"].includes(
          String(current.state),
        )
      ) {
        exit = current.outcome === "passed" ? 0 : 3
        if (cleanup?.state === "failed" || cleanup?.state === "stop_failed") {
          exit = 7
        }
        return current
      }
      if (io.now() >= deadline) {
        exit = 5
        return { ...current, wait: { state: "deadline", executionCancelled: false } }
      }
      await io.sleep(Math.min(500, deadline - io.now()))
      current = (await request(
        `/api/agent/runs/${encode(String(current.kind ?? o.kind))}/${encode(String(current.id ?? o.id))}`,
      )) as Record<string, unknown>
    }
  }
  const tests = root.command("tests")
  action(
    withPath(tests.command("list"))
      .addOption(kindOption())
      .addOption(choices("--scope <scope>", ["all", "changed"])),
    async (o) => {
      input(o.kind !== "playwright" || !o.scope, "Playwright catalog has no --scope option")
      const id = encode((await binding(o)).worktreeId)
      return request(
        query(
          `/api/worktrees/${id}/${o.kind === "playwright" ? "playwright/catalog" : `${o.kind}-tests`}`,
          { scope: o.scope },
        ),
      )
    },
  )
  action(withPath(tests.command("targets")), async (o) =>
    request(`/api/worktrees/${encode((await binding(o)).worktreeId)}/playwright`),
  )
  action(
    waitOptions(
      withPath(tests.command("run"))
        .addOption(kindOption())
        .addOption(choices("--execution-scope <scope>", ["all", "changed"]))
        .option(
          "--test <path>",
          "Integration test path (repeatable)",
          (value: string, previous: string[]) => [...previous, value],
          [],
        )
        .option("--target <target>")
        .option("--viewport <WIDTHxHEIGHT>", "Explicit browser viewport dimensions"),
    ),
    async (o) => {
      input(
        o.kind === "integration" || !(o.test as string[]).length,
        "--test is only supported for Integration",
      )
      input(
        o.kind === "playwright" || (!o.target && !o.viewport),
        "--target and --viewport require Playwright",
      )
      input(o.kind !== "playwright" || o.target, "Playwright requires --target")
      const body = {
        path: pathOf(o),
        kind: o.kind,
        ...(o.executionScope ? { executionScope: o.executionScope } : {}),
        ...((o.test as string[]).length ? { tests: o.test } : {}),
        ...(o.target ? { target: o.target } : {}),
        ...(o.viewport ? { viewport: parseViewport(String(o.viewport)) } : {}),
      }
      const accepted = await request("/api/agent/tests", body)
      return o.wait ? wait(accepted, o) : accepted
    },
  )
  const submissions = root.command("submissions")
  action(withPath(submissions.command("list")).option("--before <cursor>"), async (o) =>
    request(
      query("/api/submissions", { worktreeId: (await binding(o)).worktreeId, before: o.before }),
    ),
  )
  action(withId(submissions.command("show")), (o) =>
    request(`/api/submissions/${encode(String(o.id))}`),
  )
  action(waitOptions(withId(submissions.command("run"))), async (o) => {
    const accepted = await request(`/api/agent/submissions/${encode(String(o.id))}/run`, {})
    return o.wait ? wait(accepted, { ...o, kind: "integration" }) : accepted
  })
  const runs = root.command("runs")
  action(
    withPath(runs.command("list"))
      .addOption(choices("--kind <kind>", ["unit", "integration", "playwright"]))
      .option("--before <cursor>"),
    (o) => request(query("/api/agent/runs", { path: pathOf(o), kind: o.kind, before: o.before })),
  )
  for (const name of ["show", "context", "wait", "logs", "source", "artifacts", "artifact"]) {
    const cmd = withId(runs.command(name)).addOption(kindOption())
    if (name === "wait") {
      waitOptions(cmd)
    }
    if (name === "source") {
      cmd.requiredOption("--file <path>")
    }
    if (name === "artifacts") {
      cmd.option("--before <cursor>")
    }
    if (name === "artifact") {
      cmd
        .requiredOption("--artifact <id>")
        .requiredOption("--output <path>")
        .addOption(choices("--side <side>", ["before", "after"]))
    }
    action(cmd, async (o) => {
      const base = `/api/agent/runs/${encode(String(o.kind))}/${encode(String(o.id))}`
      if (name === "artifact") {
        input(o.kind === "playwright", "Binary artifacts require Playwright")
        const bytes = (await request(
          query(`${base}/artifacts/${encode(String(o.artifact))}`, { side: o.side }),
          undefined,
          "GET",
          true,
        )) as Uint8Array
        const output = resolve(io.cwd, String(o.output))
        await io.write(output, bytes)
        return { id: o.id, kind: o.kind, artifactId: o.artifact, output, bytes: bytes.byteLength }
      }
      const suffix = ["show", "wait"].includes(name) ? "" : `/${name}`
      const record = await request(
        query(`${base}${suffix}`, { sourcePath: o.file, before: o.before }),
      )
      return name === "wait" ? wait(record, o) : record
    })
  }
  for (const family of ["updates", "plugins"]) {
    const group = root.command(family)
    const base = family === "updates" ? "/api/updates" : "/api/plugin-updates"
    action(group.command("status"), () => request(base))
    action(group.command("check"), () => request(`${base}/check`, {}))
    const install = group.command("install").requiredOption("--version <version>")
    if (family === "plugins") {
      install.addOption(choices("--agent <agent>", ["codex", "claude"], true))
    }
    action(install, (o) =>
      request(`${base}/install`, { version: o.version, ...(o.agent ? { agent: o.agent } : {}) }),
    )
  }
  const runtime = root.command("runtime")
  action(runtime.command("status"), () => request("/api/health"))
  action(runtime.command("stop"), () => request("/api/agent/runtime/stop", {}))
  action(runtime.command("start").option("--data-dir <path>"), async (o) => {
    input(io.start, "Runtime start is unavailable in this host")
    return io.start(server(), o.dataDir ? resolve(io.cwd, String(o.dataDir)) : undefined)
  })
  action(
    withPath(root.command("open"))
      .addOption(choices("--kind <kind>", ["unit", "integration", "playwright"]))
      .option("--id <id>"),
    async (o) => {
      input(Boolean(o.kind) === Boolean(o.id), "Exact review requires both --kind and --id")
      let destination = "/"
      if (o.id) {
        const review = (await request(
          query("/api/review-context", { kind: o.kind, id: o.id }),
        )) as { reviewPath: string }
        destination = review.reviewPath
      } else if (o.path) {
        const target = await binding(o)
        destination = `/?page=history&worktree=${encode(target.worktreeId)}`
      }
      const url = new URL(destination, server())
      input(url.origin === server(), "Review destination must belong to the selected runtime")
      await io.open(url.href)
      return { url: url.href }
    },
  )
  try {
    await root.parseAsync(args, { from: "user" })
    if (result === undefined) {
      return 0
    }
    io.stdout(
      `${JSON.stringify({ version: 1, ok: true, data: result }, null, root.opts().json ? undefined : 2)}\n`,
    )
    return exit
  } catch (error) {
    if (
      error instanceof CommanderError &&
      ["commander.helpDisplayed", "commander.help", "commander.version"].includes(error.code)
    ) {
      return 0
    }
    let failure = new CliError(
      "TRANSPORT_ERROR",
      "Cannot complete the Redpact request. Check the selected runtime.",
      1,
    )
    if (error instanceof CommanderError) {
      failure = new CliError("INVALID_INPUT", "Invalid command or option. Use --help.")
    }
    if (error instanceof CliError) {
      failure = error
    }
    const payload = {
      version: 1,
      ok: false,
      error: {
        code: failure.code,
        message: failure.message,
        ...(failure.details ? { details: failure.details } : {}),
      },
    }
    if (args.includes("--json")) {
      io.stdout(`${JSON.stringify(payload)}\n`)
    } else {
      io.stderr(`${failure.message}\n`)
    }
    return failure.exit
  }
}
