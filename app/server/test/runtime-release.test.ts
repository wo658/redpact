import { readFile } from "node:fs/promises"
import { expect, test } from "vitest"
import { parse } from "yaml"

test("네이티브 데스크톱 배포 workflow를 제공하지 않는다", async () => {
  const { readdir } = await import("node:fs/promises")
  const workflows = await readdir(new URL("../../../.github/workflows/", import.meta.url))
  expect(workflows.filter((name) => name.startsWith("desktop-"))).toEqual([])
})

test("npm 게시 작업은 검증된 아티팩트를 받아 재빌드 없이 게시한다", async () => {
  const workflow = parse(
    await readFile(new URL("../../../.github/workflows/npm-publish.yml", import.meta.url), "utf8"),
  )
  const steps = workflow.jobs.publish.steps
  expect(
    steps.some((step: { uses?: string }) => step.uses === "actions/download-artifact@v4"),
  ).toBe(true)
  expect(
    steps.some((step: { run?: string }) =>
      /pack:runtime|test:package|pnpm install/.test(step.run ?? ""),
    ),
  ).toBe(false)
})

test("무거운 npm 설치 검증은 릴리스에서만 호출하고 지원 환경 전체를 검사한다", async () => {
  const workflow = parse(
    await readFile(
      new URL("../../../.github/workflows/runtime-verification.yml", import.meta.url),
      "utf8",
    ),
  )
  expect(Object.keys(workflow.on)).toEqual(["workflow_call"])
  expect(workflow.jobs.install.needs).toBe("package")
  expect(workflow.jobs.install.strategy.matrix).toEqual({
    runner: ["ubuntu-latest", "macos-14", "macos-15-intel", "windows-2022"],
    node: [24, 26],
  })
  const manual = parse(
    await readFile(new URL("../../../.github/workflows/npm-publish.yml", import.meta.url), "utf8"),
  )
  expect(manual.jobs.publish.needs).toBe("verify-npm")
  expect(manual.jobs["verify-npm"].uses).toBe("./.github/workflows/runtime-verification.yml")
})

test("검증 후 tarball 내용이나 소스·버전이 바뀌면 게시를 거부한다", async () => {
  const { verifyIdentity } = await import(
    new URL("../tools/runtime-artifact.mjs", import.meta.url).href
  )
  const expected = { version: "0.6.0", commit: "source-sha", sha256: "tarball-sha256" }
  expect(() => verifyIdentity({ ...expected }, expected)).not.toThrow()
  for (const key of ["version", "commit", "sha256"]) {
    expect(() => verifyIdentity({ ...expected, [key]: "changed" }, expected)).toThrow("mismatch")
  }
})
