import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { delimiter, isAbsolute, join, resolve } from "node:path"
import { execa } from "execa"
import { z } from "zod"
import type {
  PluginAgent,
  PluginClient,
  PluginInstallation,
} from "../../core/types/plugin-updates.js"

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

export function createPluginClient(
  options: { command?: Command; read?: typeof readFile } = {},
): PluginClient {
  const run = options.command ?? command
  const read = options.read ?? readFile
  async function marketplace(agent: PluginAgent, name: string, cliPath?: string) {
    const result = await run(agent, ["plugin", "marketplace", "list", "--json"], cliPath)
    if (agent === "codex") {
      const entry = codexMarkets
        .parse(JSON.parse(result.stdout))
        .marketplaces.find((item) => item.name === name)
      if (!entry) {
        throw new Error("The installed plugin marketplace is not configured.")
      }
      return {
        root: entry.root,
        refresh: entry.marketplaceSource?.sourceType === "git",
        identity: entry.marketplaceSource ?? null,
      }
    }
    const entry = claudeMarkets.parse(JSON.parse(result.stdout)).find((item) => item.name === name)
    if (!entry) {
      throw new Error("The installed plugin marketplace is not configured.")
    }
    return {
      root: entry.installLocation,
      refresh: !["directory", "file"].includes(entry.source),
      identity: { source: entry.source, repo: entry.repo, url: entry.url, branch: entry.branch },
    }
  }
  async function catalog(agent: PluginAgent, name: string, cliPath?: string) {
    const market = await marketplace(agent, name, cliPath)
    const file =
      agent === "codex" ? ".agents/plugins/marketplace.json" : ".claude-plugin/marketplace.json"
    const value = z
      .object({ plugins: z.array(z.object({ name: z.string(), source: z.unknown() })) })
      .parse(JSON.parse(await read(join(market.root, file), "utf8")))
    const entries = value.plugins.filter((item) => item.name === "redpact")
    if (entries.length !== 1) {
      throw new Error("The marketplace must contain one Redpact entry.")
    }
    const source = entries[0].source
    let path: string | undefined
    if (agent === "claude" && typeof source === "string" && source.startsWith("./")) {
      path = source
    } else if (agent === "codex") {
      const local = z
        .object({ source: z.literal("local"), path: z.string().min(1) })
        .safeParse(source)
      if (local.success) {
        path = local.data.path
      }
    }
    return {
      ...market,
      path: path ? resolve(market.root, path) : undefined,
      sourceKey: JSON.stringify([name, market.root, market.identity, source]),
    }
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
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
      throw new Error("The plugin marketplace name is invalid.")
    }
    const source = await catalog(agent, name, cliPath)
    return { ...entry, sourceKey: source.sourceKey, supported: Boolean(source.path) }
  }
  async function candidate(agent: PluginAgent, cliPath?: string) {
    const installed = await inspect(agent, cliPath)
    if (!installed?.supported || !installed.id) {
      throw new Error("This marketplace plugin source is not supported. Manage it in the agent.")
    }
    const name = installed.id.slice("redpact@".length)
    const source = await catalog(agent, name, cliPath)
    if (source.refresh) {
      await run(
        agent,
        ["plugin", "marketplace", agent === "codex" ? "upgrade" : "update", name],
        cliPath,
      )
    }
    const refreshed = await catalog(agent, name, cliPath)
    if (
      refreshed.sourceKey !== installed.sourceKey ||
      !refreshed.path ||
      !isAbsolute(refreshed.path)
    ) {
      throw new Error("The plugin marketplace source changed. Check again before installing.")
    }
    const value = manifest.parse(
      JSON.parse(await read(join(refreshed.path, manifestPath(agent)), "utf8")),
    )
    return { installed, version: value.version }
  }
  return {
    inspect,
    async latest(agent, cliPath) {
      const result = await candidate(agent, cliPath)
      return result.version
    },
    async install(agent, version, cliPath, expected) {
      const result = await candidate(agent, cliPath)
      if (expected && result.installed.sourceKey !== expected) {
        throw new Error("The plugin marketplace source changed. Check again before installing.")
      }
      if (result.version !== version) {
        throw new Error("The marketplace version changed. Check again before installing.")
      }
      if (agent === "codex") {
        await run(agent, ["plugin", "add", result.installed.id, "--json"], cliPath)
      } else {
        await run(agent, ["plugin", "update", result.installed.id, "--scope", "user"], cliPath)
      }
    },
  }
}
