import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { readPluginSource } from "../../tools/plugins/check-release.mjs"

const dist = new URL("dist/", import.meta.url)
const artifact = JSON.parse(await readFile(new URL("plugin-artifact.json", dist), "utf8"))
const archive = new URL(artifact.filename, dist)
assert.equal(
  createHash("sha256")
    .update(await readFile(archive))
    .digest("hex"),
  artifact.sha256,
)
const stage = await mkdtemp(join(tmpdir(), "redpact-plugin-package-"))
const client = new Client({ name: "plugin-package-verification", version: "1.0.0" })
try {
  execFileSync("tar", ["-xzf", fileURLToPath(archive), "-C", stage])
  const root = join(stage, "package")
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"))
  assert.equal(pkg.version, artifact.version)
  assert.equal(pkg.name, "@wo658/redpact-plugin")
  const source = await readPluginSource()
  assert.equal(pkg.name, source.package)
  assert.equal(pkg.version, source.version)
  const plugin = JSON.parse(await readFile(join(root, "plugin.json"), "utf8"))
  assert.equal(plugin.version, source.version)
  const node = join(root, "bin/node")
  for (const tool of ["tooling/npm/bin/npm-cli.js", "tooling/pnpm/bin/pnpm.cjs"]) {
    assert.match(
      execFileSync(node, [join(root, tool), "--version"], { encoding: "utf8" }),
      /^\d+\./,
    )
  }
  await client.connect(
    new StdioClientTransport({
      command: node,
      args: [join(root, "dist/server.mjs")],
      cwd: root,
      env: {
        ...process.env,
        REDPACT_APP_INSTALL_DIR: join(stage, "packages"),
        REDPACT_APP_DATA_DIR: join(stage, "data"),
      },
    }),
  )
  const manifest = JSON.parse(await readFile(join(root, "mcp.json"), "utf8"))
  assert.deepEqual(Object.keys(manifest.mcpServers), ["redpact-app"])
  const tools = await client.listTools()
  assert.deepEqual(
    tools.tools
      .filter((tool) => !tool._meta?.ui?.visibility || tool._meta.ui.visibility.includes("model"))
      .map((tool) => tool.name),
    ["get_redpact_status", "start_redpact_runtime", "stop_redpact_runtime", "open_redpact_app"],
  )
  const app = tools.tools.find((tool) => tool.name === "open_redpact_app")
  assert.ok(app)
  assert.ok(app._meta["openai/ui"].entrypoints.some((entry) => entry.type === "global"))
  const resources = await client.listResources()
  assert.ok(resources.resources.length > 0)
  for (const resource of resources.resources) {
    const result = await client.readResource({ uri: resource.uri })
    assert.ok(result.contents.length > 0)
  }
  console.log(`Verified extracted Plugin ${pkg.version}: bundled tools, MCP and sidebar resource`)
} finally {
  await client.close()
  await rm(stage, { recursive: true, force: true })
}
