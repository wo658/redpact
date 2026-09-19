import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test } from "vitest"
import { createApp } from "../src/app.js"

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

test("serves a relocated UI and assets without replacing API errors or the local boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "redpact-ui-"))
  directories.push(root)
  await mkdir(join(root, "assets"))
  await mkdir(join(root, "api"))
  await writeFile(join(root, "index.html"), '<main id="root"></main>')
  await writeFile(join(root, "assets/app.js"), 'console.log("packaged UI")')
  await writeFile(join(root, "api/missing"), "must not shadow an API")
  const app = createApp({} as never, { uiDirectory: root })
  const page = await app.request("/")
  expect(page.status).toBe(200)
  expect(await page.text()).toContain('id="root"')
  expect(page.headers.get("cache-control")).toContain("no-cache")
  // Documentation CSP must remain scoped to documentation routes.
  expect(page.headers.get("content-security-policy")).toBeNull()
  expect(page.headers.get("x-content-type-options")).toBe("nosniff")
  const docs = await app.request("/docs")
  expect(docs.headers.get("content-security-policy")).toContain("default-src 'none'")
  const asset = await app.request("/assets/app.js")
  expect(asset.status).toBe(200)
  expect(asset.headers.get("content-type")).toContain("javascript")
  expect(await asset.text()).toContain("packaged UI")
  expect((await app.request("/api/health")).status).toBe(200)
  expect((await app.request("/api/missing")).status).toBe(404)
  expect((await app.request("/missing.js")).status).toBe(404)
  expect((await app.request("/", { headers: { Origin: "https://example.com" } })).status).toBe(403)
  expect((await app.request("http://evil.example/assets/app.js")).status).toBe(403)
})
