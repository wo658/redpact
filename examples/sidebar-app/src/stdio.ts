import { readFile } from "node:fs/promises"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createServer } from "./server.js"

const html = await readFile(new URL("./app.html", import.meta.url), "utf8")
await createServer(html).connect(new StdioServerTransport())
