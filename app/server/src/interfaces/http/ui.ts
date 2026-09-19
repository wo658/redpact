import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"

export function uiRoutes(root = fileURLToPath(new URL("../../ui/", import.meta.url))) {
  const routes = new Hono()
  if (!existsSync(root)) {
    return routes
  }
  const serve = serveStatic({ root })
  routes.get("*", async (c, next) => {
    if (/^\/(api|mcp|docs)(\/|$)/.test(c.req.path)) {
      return next()
    }
    // Revalidate entrypoints so a local package update cannot retain stale asset URLs.
    c.header("Cache-Control", "no-cache")
    return serve(c, next)
  })
  return routes
}
