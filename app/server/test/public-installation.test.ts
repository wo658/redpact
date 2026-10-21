import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test } from "vitest"

const root = fileURLToPath(new URL("../../../", import.meta.url))

test("npm과 Plugin 이외의 설치 배포 경로를 제공하지 않는다", () => {
  for (const path of ["install.sh", "Formula", "Casks", ".github/workflows/installation.yml"]) {
    expect(existsSync(join(root, path)), path).toBe(false)
  }
})

test("에이전트 카탈로그는 호스트에 맞는 Plugin 배포를 가리킨다", async () => {
  for (const file of [".agents/plugins/marketplace.json", ".claude-plugin/marketplace.json"]) {
    expect(existsSync(join(root, file)), file).toBe(true)
    const catalog = JSON.parse(await readFile(join(root, file), "utf8"))
    expect(catalog.name).toBe("redpact")
    const entry = catalog.plugins.find((plugin: { name: string }) => plugin.name === "redpact")
    if (file.startsWith(".agents/")) {
      expect(entry.source).toEqual({
        source: "npm",
        package: "@wo658/redpact-plugin",
        version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
        registry: "https://registry.npmjs.org",
      })
      continue
    }
    expect(typeof entry.source === "string" ? entry.source : entry.source.path).toBe(
      "./plugins/redpact",
    )
  }
  const manifest = JSON.parse(
    await readFile(join(root, "plugins/redpact/.claude-plugin/plugin.json"), "utf8"),
  )
  expect(manifest.name).toBe("redpact")
})
