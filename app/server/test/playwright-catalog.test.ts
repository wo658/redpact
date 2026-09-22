import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { readJsonSettings } from "../src/adapters/settings/json.js"

test("같은 Playwright 파일을 두 목적에 연결하면 설정 검증에서 거부한다", async () => {
  const root = await mkdtemp(join(tmpdir(), "playwright-targets-"))
  try {
    await mkdir(join(root, ".redpact"))
    await mkdir(join(root, "browser"))
    await writeFile(
      join(root, "browser", "settings.ts"),
      "throw new Error('Do not execute sources during discovery')",
    )
    await writeFile(join(root, "compose.yaml"), "services:\n  app:\n    image: app\n")
    await writeFile(
      join(root, ".redpact/settings.json"),
      JSON.stringify({
        composeFiles: ["compose.yaml"],
        playwright: {
          directory: "browser",
          service: "app",
          port: 3000,
          targets: {
            screens: { purpose: "capture", testMatch: ["*.ts"] },
            checks: { purpose: "functional", testMatch: ["settings.ts"] },
          },
        },
        services: ["app"],
      }),
    )
    const result = await readJsonSettings(root)
    expect(result.valid).toBe(false)
    expect(JSON.stringify(result.issues)).toContain("multiple Playwright targets")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("워크트리 캡처와 지속 테스트의 관리 범위를 설정에 보존한다", async () => {
  const { settingsSchema } = await import("../src/core/settings-schema.js")
  const parsed = settingsSchema.safeParse({
    playwright: {
      directory: "browser",
      service: "app",
      port: 3000,
      targets: {
        "worktree-captures": {
          scope: "worktree",
          purpose: "capture",
          testMatch: ["worktree/captures/**/*.ts"],
        },
        "project-tests": {
          scope: "project",
          purpose: "functional",
          testMatch: ["project/tests/**/*.ts"],
        },
      },
    },
  })
  expect(parsed.success).toBe(true)
  if (parsed.success) {
    expect(parsed.data.playwright?.targets["worktree-captures"].scope).toBe("worktree")
  }
})

test("Playwright UI 언어는 브라우저 locale과 별도로 명시한다", async () => {
  const { settingsSchema } = await import("../src/core/settings-schema.js")
  const parsed = settingsSchema.parse({
    playwright: {
      service: "app",
      port: 3000,
      locale: "ko-KR",
      uiLanguage: "ko",
      targets: { review: { purpose: "functional", testMatch: ["project/tests/**/*.ts"] } },
    },
  })

  expect(parsed.playwright?.locale).toBe("ko-KR")
  expect(parsed.playwright?.uiLanguage).toBe("ko")
})

test("프로젝트 파일 목록은 워크트리 소스를 제외하며 잘못된 관리 범위는 거부한다", async () => {
  const { discoverPlaywright } = await import("../src/adapters/playwright/catalog.js")
  const { createPlaywrightCatalog } = await import("../src/workflows/playwright-catalog.js")
  const { settingsSchema } = await import("../src/core/settings-schema.js")
  const root = await mkdtemp(join(tmpdir(), "playwright-scopes-"))
  try {
    await mkdir(join(root, "browser/worktree/tests"), { recursive: true })
    await mkdir(join(root, "browser/project/tests"), { recursive: true })
    await writeFile(
      join(root, "browser/worktree/tests/draft.ts"),
      "throw new Error('do not execute')",
    )
    await writeFile(
      join(root, "browser/project/tests/saved.ts"),
      "throw new Error('do not execute')",
    )
    const settings = settingsSchema.parse({
      playwright: {
        directory: "browser",
        service: "app",
        port: 3000,
        targets: {
          worktree: {
            scope: "worktree",
            purpose: "functional",
            testMatch: ["worktree/tests/*.ts"],
          },
          project: { scope: "project", purpose: "functional", testMatch: ["project/tests/*.ts"] },
        },
      },
    })
    const catalog = createPlaywrightCatalog({
      projects: {
        root: async () => root,
        tracking: async () => ({ mainBranch: "main", hideMerged: true }),
      },
      worktrees: {
        projectSettings: async () => ({ read: async () => ({ valid: true, settings }) }),
      } as never,
      discover: discoverPlaywright,
      changedPaths: async () => [],
      read: async () => "source",
    })
    expect((await catalog.inspect("p")).files.map((file) => file.path)).toEqual([
      "project/tests/saved.ts",
    ])
    await expect(catalog.source("p", "worktree/tests/draft.ts")).rejects.toThrow("not found")
    settings.playwright!.targets.worktree.scope = "project"
    await expect(discoverPlaywright(root, settings.playwright!)).rejects.toThrow(
      "cannot belong to a project target",
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
