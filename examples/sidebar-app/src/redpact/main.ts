import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createBridge } from "./bridge.js"
import { createInstaller } from "./installer.js"
import { localRuntime } from "./local.js"
import { createAppServer } from "./server.js"

const config = JSON.parse(await readFile(new URL("./config.json", import.meta.url), "utf8"))
const port = Number(process.env.REDPACT_APP_PORT ?? config.port)
const installer = createInstaller({
  root: process.env.REDPACT_APP_INSTALL_DIR ?? join(homedir(), ".redpact", "app-page", "packages"),
  version: config.runtimeVersion,
  npm: fileURLToPath(new URL("../tooling/npm/bin/npm-cli.js", import.meta.url)),
  pnpm: fileURLToPath(new URL("../tooling/pnpm/bin/pnpm.cjs", import.meta.url)),
})
const runtime = localRuntime({
  installer,
  port,
  dataDir:
    process.env.REDPACT_APP_DATA_DIR ?? join(homedir(), ".redpact", "app-page", String(port)),
})
const bridge = createBridge(`http://127.0.0.1:${port}`)
const server = createAppServer({
  bridge,
  icon: `data:image/svg+xml;base64,${(await readFile(new URL("../assets/favicon.svg", import.meta.url))).toString("base64")}`,
  runtime,
  html: await readFile(new URL("./app.html", import.meta.url), "utf8"),
  token: randomUUID(),
})
await server.connect(new StdioServerTransport())

let closing = false
async function close() {
  if (closing) {
    return
  }
  closing = true
  try {
    const status = await runtime.status()
    if (status.owned) {
      await runtime.stop()
    }
    bridge.close()
    await installer.close()
    await server.close()
    process.exit(0)
  } catch (error) {
    console.error(String(error))
    process.exit(1)
  }
}
server.server.onclose = () => {
  void close()
}
process.once("SIGINT", () => {
  void close()
})
process.once("SIGTERM", () => {
  void close()
})
