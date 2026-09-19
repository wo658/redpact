import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test } from "vitest"
import { parseSource } from "../src/adapters/parser/source.js"
import { discoverPlaywright } from "../src/adapters/playwright/catalog.js"
import { createSettingsService } from "../src/adapters/settings/json.js"
import { createLocalFiles } from "../src/adapters/sources/local.js"

test("관리 E2E 이미지가 호스트 경로를 포함하는 문서 생성물을 복사하지 않는다", async () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url))
  const excluded = (await readFile(join(root, ".dockerignore"), "utf8")).split(/\r?\n/)
  expect(excluded).toContain("**/.source")
  expect(excluded).toContain("**/.next")
})

test("the reusable self-E2E setup validates and discovers executable acceptance scenarios", async () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url))
  const rules = await mkdtemp(join(tmpdir(), "redpact-e2e-rules-"))
  try {
    await mkdir(join(rules, ".redpact"))
    await writeFile(
      join(rules, ".redpact/settings.json"),
      await readFile(join(root, "e2e/settings.example.json")),
    )
    const result = await createSettingsService(root, rules).read({ services: ["app"], select: {} })
    expect(result.valid, JSON.stringify(result.issues)).toBe(true)
    expect(result.plan?.activeServices).toEqual(["app"])
    if (!result.settings) {
      throw new Error("Validated E2E settings are missing")
    }
    if (!result.settings.playwright) {
      throw new Error("Validated E2E Playwright settings are missing")
    }
    expect(result.settings.playwright.uiLanguage).toBe("ko")
    const browserFiles = await discoverPlaywright(root, result.settings.playwright)
    expect(browserFiles.map(({ path, purpose }) => ({ path, purpose }))).toEqual([
      { path: "project/captures/application.spec.ts", purpose: "capture" },
      { path: "project/captures/dependencies.spec.ts", purpose: "capture" },
      { path: "project/captures/problem-notice.spec.ts", purpose: "capture" },
      { path: "project/captures/word-wrap.spec.ts", purpose: "capture" },
      { path: "project/tests/copy-handoff.spec.ts", purpose: "functional" },
      { path: "project/tests/dependencies.spec.ts", purpose: "functional" },
      { path: "project/tests/git-graph.spec.ts", purpose: "functional" },
      { path: "project/tests/material-icons.spec.ts", purpose: "functional" },
      { path: "project/tests/problem-notice.spec.ts", purpose: "functional" },
      { path: "project/tests/product-demo.spec.ts", purpose: "functional" },
      { path: "project/tests/review-header.spec.ts", purpose: "functional" },
      { path: "project/tests/settings.spec.ts", purpose: "functional" },
      { path: "project/tests/viewers.spec.ts", purpose: "functional" },
      { path: "project/tests/word-wrap.spec.ts", purpose: "functional" },
    ])
    expect(browserFiles.every((file) => file.scope === "project")).toBe(true)
    expect(
      browserFiles.find((file) => file.path === "project/tests/product-demo.spec.ts")?.target,
    ).toBe("demo")
    expect(browserFiles.filter((file) => file.target === "functional")).toHaveLength(9)
    const files = await createLocalFiles().readTests(root, result.settings.tests.directory)
    const scenarios = files
      .filter((file) => file.path.endsWith(".test.ts"))
      .flatMap((file) => parseSource(file.path, file.source).scenarios)
    expect(scenarios.length).toBeGreaterThanOrEqual(4)
  } finally {
    await rm(rules, { recursive: true, force: true })
  }
})
