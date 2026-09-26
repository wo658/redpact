import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { delimiter, join } from "node:path"
import { execa } from "execa"
import { z } from "zod"
import type {
  PluginAgent,
  PluginClient,
  PluginInstallation,
} from "../../core/types/plugin-updates.js"

const repository = "https://github.com/wo658/redpact"
const manifest = z.object({ name: z.literal("redpact"), version: z.string().min(1).max(100) })
const codexPlugin = z.object({
  pluginId: z.string(),
  version: z.string(),
  installed: z.boolean(),
  enabled: z.boolean(),
  marketplaceName: z.string(),
})
const claudePlugin = z.object({
  id: z.string(),
  version: z.string(),
  enabled: z.boolean(),
  scope: z.string(),
})
const codexMarkets = z.object({
  marketplaces: z.array(
    z.object({
      name: z.string(),
      root: z.string(),
      marketplaceSource: z
        .object({ sourceType: z.string(), source: z.string(), ref: z.string().optional() })
        .optional(),
    }),
  ),
})
const claudeMarkets = z.array(
  z.object({
    name: z.string(),
    source: z.string(),
    repo: z.string().optional(),
    url: z.string().optional(),
    branch: z.string().optional(),
    installLocation: z.string(),
  }),
)
const manifestPath = (agent: PluginAgent) =>
  agent === "codex" ? ".codex-plugin/plugin.json" : ".claude-plugin/plugin.json"

type Command = (
  agent: PluginAgent,
  args: string[],
  cliPath?: string,
) => Promise<{ stdout: string; stderr: string }>
async function command(agent: PluginAgent, args: string[], cliPath?: string) {
  try {
    return await execa(cliPath ?? agent, args, {
      cwd: homedir(),
      stdin: "ignore",
      timeout: 120000,
      forceKillAfterDelay: 1000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
      env: {
        ...process.env,
        CI: "1",
        GIT_TERMINAL_PROMPT: "0",
        PATH: [
          process.env.PATH,
          join(homedir(), ".local/bin"),
          "/opt/homebrew/bin",
          "/usr/local/bin",
        ]
          .filter(Boolean)
          .join(delimiter),
      },
    })
  } catch {
    throw new Error(
      `${agent} CLI failed or timed out. Check its path, sign-in and plugin command support; use the agent for interactive approvals.`,
    )
  }
}

async function latest(agent: PluginAgent) {
  const response = await fetch(
    `https://raw.githubusercontent.com/wo658/redpact/main/plugins/redpact/${manifestPath(agent)}`,
    {
      signal: AbortSignal.timeout(10000),
      redirect: "error",
      headers: { Accept: "application/json" },
    },
  )
  if (!response.ok) {
    throw new Error(`Plugin marketplace returned HTTP ${response.status}.`)
  }
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error("Plugin marketplace returned no manifest.")
  }
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const value = await reader.read()
      if (value.done) {
        break
      }
      size += value.value.byteLength
      if (size > 65536) {
        throw new Error("Plugin manifest is too large.")
      }
      chunks.push(value.value)
    }
    return manifest.parse(JSON.parse(Buffer.concat(chunks).toString("utf8"))).version
  } finally {
    await reader.cancel()
  }
}

export function createPluginClient(
  options: { command?: Command; latest?: typeof latest; read?: typeof readFile } = {},
): PluginClient {
  const run = options.command ?? command
  const read = options.read ?? readFile
  async function marketplace(agent: PluginAgent, name: string, cliPath?: string) {
    const result = await run(agent, ["plugin", "marketplace", "list", "--json"], cliPath)
    if (agent === "codex") {
      const entry = codexMarkets
        .parse(JSON.parse(result.stdout))
        .marketplaces.find((item) => item.name === name)
      const source = entry?.marketplaceSource
      return {
        root: entry?.root,
        official:
          source?.sourceType === "git" &&
          [repository, `${repository}.git`].includes(source.source) &&
          (!source.ref || source.ref === "main"),
      }
    }
    const entry = claudeMarkets.parse(JSON.parse(result.stdout)).find((item) => item.name === name)
    const official =
      entry?.source === "github" &&
      entry.repo === "wo658/redpact" &&
      (!entry.branch || entry.branch === "main")
    return { root: entry?.installLocation, official }
  }
  async function inspect(agent: PluginAgent, cliPath?: string): Promise<PluginInstallation | null> {
    const result = await run(agent, ["plugin", "list", "--json"], cliPath)
    const value: unknown = JSON.parse(result.stdout)
    const entries =
      agent === "codex"
        ? z
            .object({ installed: z.array(codexPlugin) })
            .parse(value)
            .installed.filter((item) => item.installed && item.pluginId.startsWith("redpact@"))
            .map((item) => ({
              id: item.pluginId,
              version: item.version,
              enabled: item.enabled,
              scope: "user",
            }))
        : z
            .array(claudePlugin)
            .parse(value)
            .filter((item) => item.id.startsWith("redpact@"))
    if (!entries.length) {
      if (/fail|error/i.test(result.stderr)) {
        throw new Error("The agent returned an incomplete plugin list. Retry in the agent.")
      }
      return null
    }
    if (entries.length !== 1) {
      throw new Error(
        "Multiple Redpact installations were found. Manage their scopes in the agent.",
      )
    }
    const entry = entries[0]
    const name = entry.id.slice("redpact@".length)
    if (name !== "redpact") {
      return { ...entry, official: false }
    }
    const source = await marketplace(agent, name, cliPath)
    return { ...entry, official: source.official }
  }
  return {
    inspect,
    latest: options.latest ?? latest,
    async install(agent, version, cliPath) {
      const source = await marketplace(agent, "redpact", cliPath)
      if (!source.official || !source.root) {
        throw new Error("The public Redpact marketplace is not configured.")
      }
      const refresh = agent === "codex" ? "upgrade" : "update"
      await run(agent, ["plugin", "marketplace", refresh, "redpact"], cliPath)
      const refreshed = await marketplace(agent, "redpact", cliPath)
      if (!refreshed.official || !refreshed.root) {
        throw new Error("The plugin marketplace source changed.")
      }
      const path = join(refreshed.root, "plugins/redpact", manifestPath(agent))
      const candidate = manifest.parse(JSON.parse(await read(path, "utf8")))
      if (candidate.version !== version) {
        throw new Error("The marketplace version changed. Check again before installing.")
      }
      if (agent === "codex") {
        await run(agent, ["plugin", "add", "redpact@redpact", "--json"], cliPath)
      } else {
        await run(agent, ["plugin", "update", "redpact@redpact", "--scope", "user"], cliPath)
      }
    },
  }
}
