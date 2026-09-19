import { expect, test } from "vitest"
import { parseSettings } from "../src/adapters/settings/json.js"

test("unit commands and file patterns validate without a Compose environment", () => {
  const result = parseSettings(
    JSON.stringify({
      composeFiles: [],
      unitTests: {
        dockerfile: "unit.Dockerfile",
        cwd: "app/server",
        command: "pnpm test",
        patterns: ["tests/unit/**/*.test.ts", "tests/unit/test_*.py"],
      },
    }),
    "settings.json",
  )
  expect(result.valid).toBe(true)
  expect(result.settings).toMatchObject({ unitTests: { command: "pnpm test", cwd: "app/server" } })
})

test("integration sources default to the root integration directory", () => {
  const result = parseSettings("{}", "settings.json")

  expect(result.settings?.tests.directory).toBe("integration")
})

test("unit patterns cannot include the configured integration directory", () => {
  const result = parseSettings(
    JSON.stringify({
      tests: { directory: "integration" },
      unitTests: {
        dockerfile: "unit.Dockerfile",
        command: "pnpm test",
        patterns: ["**/*.test.ts"],
      },
    }),
    "settings.json",
  )

  expect(result.valid).toBe(false)
  expect(result.issues.map((issue) => issue.message).join("\n")).toContain(
    "Unit test patterns cannot include integration",
  )
})

test("unit patterns may use a separate configured directory", () => {
  const result = parseSettings(
    JSON.stringify({
      tests: { directory: "integration" },
      unitTests: {
        dockerfile: "unit.Dockerfile",
        command: "pnpm test",
        patterns: ["tests/unit/**/*.test.ts"],
      },
    }),
    "settings.json",
  )

  expect(result.valid).toBe(true)
})

test("unit configuration rejects escaping directories and empty commands", () => {
  for (const unitTests of [
    { cwd: "../outside", command: "pytest", patterns: ["**/*.py"] },
    { cwd: ".", command: " ", patterns: ["**/*.py"] },
    { cwd: ".", command: "pytest", patterns: ["../*.py"] },
  ]) {
    expect(
      parseSettings(JSON.stringify({ composeFiles: [], unitTests }), "settings.json").valid,
    ).toBe(false)
  }
})

test("unit commands preserve authored shell whitespace while rejecting blank input", () => {
  const command = "  printf 'exact command'\n"
  const result = parseSettings(
    JSON.stringify({
      unitTests: { dockerfile: "unit.Dockerfile", command, patterns: ["tests/unit/**/*.py"] },
    }),
    "settings.json",
  )
  expect(result.settings?.unitTests?.command).toBe(command)
})

test("프로젝트 공용 단위 테스트 Dockerfile 설정을 허용하고 호스트 전용 설정을 거부한다", () => {
  const unitTests = {
    command: "pnpm test",
    patterns: ["tests/unit/**/*.test.ts"],
    dockerfile: "tests/unit.Dockerfile",
  }
  const result = parseSettings(JSON.stringify({ unitTests }), "settings.json")
  expect(result.valid).toBe(true)
  expect(result.settings?.unitTests).toMatchObject({ dockerfile: "tests/unit.Dockerfile" })
  const { dockerfile: _dockerfile, ...hostOnly } = unitTests
  expect(parseSettings(JSON.stringify({ unitTests: hostOnly }), "settings.json").valid).toBe(false)
  expect(
    parseSettings(
      JSON.stringify({ unitTests: { ...unitTests, dockerfile: "../Dockerfile" } }),
      "settings.json",
    ).valid,
  ).toBe(false)
})

test("공유 설정의 Dockerfile은 실행 WT에서 검사하고 누락을 진단한다", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { readJsonSettings } = await import("../src/adapters/settings/json.js")
  const root = await mkdtemp(join(tmpdir(), "unit-settings-"))
  const rules = {
    file: "/primary/.redpact/settings.json",
    source: JSON.stringify({
      unitTests: {
        dockerfile: "unit.Dockerfile",
        command: "pytest",
        patterns: ["tests/unit/**/*.py"],
      },
    }),
  }
  try {
    expect((await readJsonSettings(root, undefined, rules)).valid).toBe(false)
    await writeFile(join(root, "unit.Dockerfile"), "FROM python:3.12-slim\n")
    expect((await readJsonSettings(root, undefined, rules)).valid).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
