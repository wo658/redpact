import { readFile } from "node:fs/promises"
import { expect, test } from "vitest"

const root = new URL("../dist/redpact-marketplace/plugins/redpact-app/", import.meta.url)

test("공개 Plugin 패키지는 플랫폼과 도구를 명시하고 설치 스크립트를 실행하지 않는다", async () => {
  const manifest = JSON.parse(await readFile(new URL("plugin.json", root), "utf8"))
  expect(manifest.name).toBe("redpact")
  const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8").catch(() => "{}"))
  expect(pkg.name).toBe("@wo658/redpact-plugin")
  expect(pkg.os).toEqual(["darwin"])
  expect(pkg.cpu).toEqual(["arm64"])
  expect(pkg.scripts).toBeUndefined()
  expect(pkg.version).toBe(manifest.version)
  const metadata = JSON.parse(await readFile(new URL("runtime-artifact.json", root), "utf8"))
  expect(metadata.redpact).toBe("installed on demand")
})
