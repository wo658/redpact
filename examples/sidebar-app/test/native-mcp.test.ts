import { readFile } from "node:fs/promises"
import { expect, test } from "vitest"

test("사이드바와 모델 도구는 같은 로컬 런타임에 연결한다", async () => {
  const root = new URL("../dist/redpact-marketplace/plugins/redpact-app/", import.meta.url)
  const manifest = JSON.parse(await readFile(new URL("mcp.json", root), "utf8"))
  const config = JSON.parse(await readFile(new URL("dist/config.json", root), "utf8"))
  expect(manifest.mcpServers["redpact-verification"]).toEqual({
    type: "http",
    url: `http://127.0.0.1:${config.port}/mcp`,
  })
  expect(manifest.mcpServers["redpact-app"].type).toBe("stdio")
})
