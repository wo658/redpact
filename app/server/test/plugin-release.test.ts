import { expect, test } from "vitest"

const { checkPublishedPlugin } = await import(
  new URL("../../../tools/plugins/check-release.mjs", import.meta.url).href
)
const source = {
  source: "npm",
  package: "@wo658/redpact-plugin",
  version: "0.7.0",
  registry: "https://registry.npmjs.org",
}
const published = {
  name: source.package,
  "dist-tags": { latest: "0.7.0" },
  versions: { "0.7.0": { name: source.package, version: "0.7.0" } },
}

test("카탈로그 버전이 npm에 없거나 latest와 다르면 CI 검증을 거부한다", async () => {
  await expect(checkPublishedPlugin(source, async () => published)).resolves.toBeUndefined()
  await expect(
    checkPublishedPlugin(source, async () => ({ ...published, versions: {} })),
  ).rejects.toThrow("not published")
  await expect(
    checkPublishedPlugin(source, async () => ({ ...published, "dist-tags": { latest: "0.6.0" } })),
  ).rejects.toThrow("latest")
  await expect(
    checkPublishedPlugin(source, async () => ({ ...published, name: "another-package" })),
  ).rejects.toThrow("identity")
})

test("레지스트리 장애는 버전 일치 성공으로 처리하지 않는다", async () => {
  await expect(
    checkPublishedPlugin(source, async () => {
      throw new Error("registry unavailable")
    }),
  ).rejects.toThrow("registry unavailable")
})
