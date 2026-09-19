import path from "node:path"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import {
  defineConfig,
  type Plugin,
  type PreviewServer,
  type ProxyOptions,
  type ViteDevServer,
} from "vite"

import { materialIcons } from "./tools/material-icons.ts"

function localApiBoundary(): Plugin {
  const install = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((req, res, next) => {
      if (!/^\/api(?:\/|\?|$)/.test(req.url ?? "")) {
        return next()
      }
      const address = server.httpServer?.address()
      const port = address && typeof address === "object" ? address.port : undefined
      const allowed = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`])
      const site = req.headers["sec-fetch-site"]
      const host = req.headers.host
      if (
        !host ||
        !allowed.has(host) ||
        (site && site !== "same-origin" && site !== "none") ||
        (req.headers.origin && req.headers.origin !== `http://${host}`)
      ) {
        res.writeHead(403, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Origin is not allowed" }))
        return
      }
      next()
    })
  }
  return {
    name: "redpact-local-api-boundary",
    configureServer: install,
    configurePreviewServer: install,
  }
}

export default defineConfig(() => {
  const target = new URL(process.env.REDPACT_API_URL ?? "http://127.0.0.1:54318")
  if (
    target.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
    target.username ||
    target.password ||
    target.pathname !== "/" ||
    target.search ||
    target.hash
  ) {
    throw new Error("REDPACT_API_URL must be a loopback HTTP origin")
  }
  const proxy: Record<string, ProxyOptions> = {
    "^/api(?:/|\\?|$)": {
      target: target.origin,
      changeOrigin: true,
      configure(proxy) {
        proxy.on("proxyReq", (request, incoming) => {
          if (incoming.headers.origin) {
            request.setHeader("Origin", target.origin)
          }
        })
      },
    },
  }
  return {
    plugins: [localApiBoundary(), materialIcons(), react(), tailwindcss()],
    server: { host: "127.0.0.1", proxy },
    preview: { host: "127.0.0.1", proxy },
    resolve: {
      alias: { "@": path.resolve(fileURLToPath(new URL(".", import.meta.url)), "src") },
      dedupe: ["react", "react-dom"],
    },
  }
})
