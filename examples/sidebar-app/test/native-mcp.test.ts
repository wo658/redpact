import { readdir, readFile } from "node:fs/promises"
import { expect, test } from "vitest"

test("앱 표시 이름은 Redpact다", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../dist/redpact-marketplace/plugins/redpact-app/plugin.json", import.meta.url),
      "utf8",
    ),
  )
  expect(manifest.extensions["com.openai"].interface.displayName).toBe("Redpact")
})

test("App 플러그인은 서버가 꺼져 있어도 사용할 단일 MCP 연결만 등록한다", async () => {
  const root = new URL("../dist/redpact-marketplace/plugins/redpact-app/", import.meta.url)
  const manifest = JSON.parse(await readFile(new URL("mcp.json", root), "utf8"))
  expect(Object.keys(manifest.mcpServers)).toEqual(["redpact-app"])
  expect(manifest.mcpServers["redpact-app"].type).toBe("stdio")
})

test("작업 스킬은 App MCP에 연결하고 작업 실행은 CLI로 안내한다", async () => {
  const root = new URL("../dist/redpact-marketplace/plugins/redpact-app/", import.meta.url)
  expect(await readdir(root)).toContain("skills")
  for (const name of ["redpact", "redpact-init"]) {
    const source = await readFile(
      new URL(`../../../plugins/redpact/skills/${name}/SKILL.md`, import.meta.url),
      "utf8",
    )
    expect(await readFile(new URL(`skills/${name}/SKILL.md`, root), "utf8")).toBe(source)
    const metadata = await readFile(new URL(`skills/${name}/agents/openai.yaml`, root), "utf8")
    expect(metadata).toContain('value: "redpact-app"')
    expect(metadata).toContain('transport: "stdio"')
    expect(metadata).not.toContain("url:")
    expect(metadata).not.toContain("through MCP")
    expect(metadata).not.toContain("54321")
  }
})
