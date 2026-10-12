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

test("App 플러그인이 작업 스킬과 같은 인스턴스의 검증 연결을 함께 제공한다", async () => {
  const root = new URL("../dist/redpact-marketplace/plugins/redpact-app/", import.meta.url)
  expect(await readdir(root)).toContain("skills")
  const config = JSON.parse(await readFile(new URL("dist/config.json", root), "utf8"))
  for (const name of ["redpact", "redpact-init"]) {
    const source = await readFile(
      new URL(`../../../plugins/redpact/skills/${name}/SKILL.md`, import.meta.url),
      "utf8",
    )
    expect(await readFile(new URL(`skills/${name}/SKILL.md`, root), "utf8")).toBe(source)
    const metadata = await readFile(new URL(`skills/${name}/agents/openai.yaml`, root), "utf8")
    expect(metadata).toContain('value: "redpact-verification"')
    expect(metadata).toContain(`url: "http://127.0.0.1:${config.port}/mcp"`)
    expect(metadata).not.toContain("54321")
  }
})
