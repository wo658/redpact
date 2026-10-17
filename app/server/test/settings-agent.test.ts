import { expect, test } from "vitest"
import { createApp } from "../src/app.js"

test("CLI 설정 조회는 서버의 설정 workflow를 사용한다", async () => {
  const get = async () => ({ scope: "instance", revision: "revision", value: {}, issues: [] })
  const app = createApp({ settingsAgent: { get } } as never)
  const response = await app.request("/api/agent/settings/get", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope: "instance" }),
  })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ revision: "revision" })
})

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createSettingsFiles } from "../src/adapters/settings/editor-files.js"
import { readJsonSettings } from "../src/adapters/settings/json.js"
import { createSettingsAgent } from "../src/workflows/settings-agent.js"
import { createSettingsEditor } from "../src/workflows/settings-editor.js"

async function fixture(
  run: (context: {
    root: string
    file: string
    agent: ReturnType<typeof createSettingsAgent>
  }) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), "redpact-agent-settings-"))
  const file = join(root, ".redpact/settings.json")
  await mkdir(join(root, ".redpact"))
  const editor = createSettingsEditor({
    projects: { root: async () => root },
    directory: root,
    files: createSettingsFiles(),
    validateProject: (path, source) => readJsonSettings(path, undefined, { file, source }),
  })
  const agent = createSettingsAgent({
    editor,
    settings: async () => ({
      projectRoot: root,
      rulesRoot: root,
      read: () => readJsonSettings(root),
    }),
  })
  try {
    await run({ root, file, agent })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test("부분 수정은 형제 값과 생략된 기본값을 보존하고 배열 연산을 원자적으로 적용한다", async () =>
  fixture(async ({ root, file, agent }) => {
    await writeFile(file, '{"tests":{"timeoutMs":12000,"env":{"TOKEN":"secret"}}}')
    const target = { scope: "project" as const, path: root }
    const before = await agent.get(target)
    const saved = await agent.patch({
      ...target,
      revision: before.revision ?? "",
      patch: [
        { op: "test", path: "/tests/timeoutMs", value: 12000 },
        { op: "replace", path: "/tests/timeoutMs", value: 14000 },
        { op: "add", path: "/services", value: ["one", "two"] },
        { op: "remove", path: "/services/0" },
        { op: "remove", path: "/services" },
      ],
    })
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
      tests: { timeoutMs: 14000, env: { TOKEN: "secret" } },
    })
    expect(saved).not.toHaveProperty("value")
    expect(await agent.get({ ...target, pointer: "/tests/env/TOKEN" })).toMatchObject({
      value: "secret",
      revision: saved.revision,
      redaction: "none",
    })
    expect(await agent.get(target)).not.toHaveProperty("source")
  }))

test("오류와 오래된 revision은 원본을 변경하지 않고 잘못된 값을 노출하지 않는다", async () =>
  fixture(async ({ root, file, agent }) => {
    const source = '{"tests":{"timeoutMs":12000}}'
    await writeFile(file, source)
    const target = { scope: "project" as const, path: root }
    const { revision } = await agent.get(target)
    for (const patch of [
      [{ op: "replace" as const, path: "/tests/timeoutMs", value: 0 }],
      [{ op: "add" as const, path: "/missing/child", value: "secret" }],
      [{ op: "test" as const, path: "/tests/timeoutMs", value: "secret" }],
      [{ op: "add" as const, path: "/__proto__/polluted", value: true }],
      [{ op: "add" as const, path: "/tests~2bad", value: true }],
      [{ op: "add" as const, path: "/composeFiles", value: ["missing.yaml"] }],
    ]) {
      await expect(agent.patch({ ...target, revision: revision ?? "", patch })).rejects.toThrow()
      expect(await readFile(file, "utf8")).toBe(source)
    }
    await expect(
      agent.patch({ ...target, revision: "stale", patch: [{ op: "remove", path: "/tests" }] }),
    ).rejects.toMatchObject({ code: "environment_conflict" })
    const results = await Promise.allSettled(
      [12001, 12002].map((value) =>
        agent.patch({
          ...target,
          revision: revision ?? "",
          patch: [{ op: "replace", path: "/tests/timeoutMs", value }],
        }),
      ),
    )
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1)
  }))

test("없는 문서는 명시적 create로만 생성하고 잘못된 JSON은 revision과 백업을 통해 복구한다", async () =>
  fixture(async ({ root, file, agent }) => {
    const target = { scope: "project" as const, path: root }
    expect(await agent.get(target)).toMatchObject({ exists: false, revision: null, value: null })
    await expect(
      agent.patch({ ...target, patch: [{ op: "add", path: "/tests", value: {} }] }),
    ).rejects.toThrow()
    await agent.patch({
      ...target,
      create: true,
      patch: [{ op: "add", path: "/tests", value: {} }],
    })
    await expect(
      agent.patch({ ...target, create: true, patch: [{ op: "remove", path: "/tests" }] }),
    ).rejects.toMatchObject({ code: "environment_conflict" })
    await writeFile(file, '{"tests":broken secret')
    const malformed = await agent.get(target)
    expect(malformed).toMatchObject({ value: null, exists: true })
    expect(JSON.stringify(malformed)).not.toContain("secret")
    await expect(
      agent.patch({
        ...target,
        revision: malformed.revision ?? "",
        patch: [{ op: "add", path: "", value: {} }],
      }),
    ).rejects.toThrow("repair")
    const repaired = await agent.repair({
      ...target,
      revision: malformed.revision ?? "",
      value: {},
    })
    expect(await readFile(repaired.backupFile ?? "", "utf8")).toBe('{"tests":broken secret')
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({})
    expect((await readdir(join(root, ".redpact"))).filter((name) => name.endsWith(".tmp"))).toEqual(
      [],
    )
  }))

test("인스턴스 수정은 승인과 Git 설정을 보호하고 복구 시 명시적 승인을 유지한다", async () =>
  fixture(async ({ root, agent }) => {
    const file = join(root, "settings.json")
    await writeFile(
      file,
      '{"approval":"ask","github":{"cliPath":"/usr/bin/gh"},"projects":["/one","/two"]}',
    )
    const target = { scope: "instance" as const }
    const { revision } = await agent.get(target)
    for (const path of ["", "/approval", "/github", "/github/cliPath"]) {
      await expect(
        agent.patch({ ...target, revision: revision ?? "", patch: [{ op: "remove", path }] }),
      ).rejects.toThrow("not agent-writable")
    }
    await agent.patch({
      ...target,
      revision: revision ?? "",
      patch: [
        { op: "add", path: "/projects/-", value: "/three" },
        { op: "remove", path: "/projects/0" },
      ],
    })
    expect((await agent.get(target)).value).toEqual({
      approval: "ask",
      github: { cliPath: "/usr/bin/gh" },
      projects: ["/two", "/three"],
    })
    await writeFile(file, "{broken")
    const invalid = await agent.get(target)
    await expect(
      agent.repair({ ...target, revision: invalid.revision ?? "", value: { approval: "auto" } }),
    ).rejects.toThrow("approval ask")
    await agent.repair({ ...target, revision: invalid.revision ?? "", value: { approval: "ask" } })
    expect((await agent.get(target)).value).toEqual({ approval: "ask" })
  }))

test("포인터 이스케이프는 저장된 키를 정확하게 선택한다", async () =>
  fixture(async ({ root, file, agent }) => {
    await writeFile(file, '{"a/b":{"~key":7}}')
    expect(await agent.get({ scope: "project", path: root, pointer: "/a~1b/~0key" })).toMatchObject(
      { value: 7 },
    )
  }))

test("저장된 null은 없는 문서처럼 취급하지 않는다", async () =>
  fixture(async ({ root, file, agent }) => {
    await writeFile(file, "null")
    const target = { scope: "project" as const, path: root }
    const { revision } = await agent.get(target)
    await expect(
      agent.patch({
        ...target,
        revision: revision ?? "",
        patch: [{ op: "add", path: "/tests", value: {} }],
      }),
    ).rejects.toThrow()
    expect(await readFile(file, "utf8")).toBe("null")
  }))

test("실행 계획 검증 실패는 입력 비밀 값을 반환하지 않는다", async () =>
  fixture(async ({ root, agent }) => {
    let failure: unknown
    try {
      await agent.patch({
        scope: "project",
        path: root,
        create: true,
        patch: [
          { op: "add", path: "/composeFiles", value: ["missing.yaml"] },
          { op: "add", path: "/tests", value: { env: { TOKEN: "private-secret" } } },
        ],
      })
    } catch (error) {
      failure = error
    }
    expect(failure).toMatchObject({ code: "settings_invalid" })
    expect(JSON.stringify(failure)).not.toContain("private-secret")
  }))

import { describeSettings } from "../src/core/settings.js"

test("생성된 설정 안내는 직접 파일 편집 대신 revision 기반 CLI 명령을 제공한다", () => {
  const specification = describeSettings()
  expect(specification.workflow.join(" ")).toContain("redpact settings patch")
  expect(specification.workflow.join(" ")).toContain("redpact settings validate")
  expect(specification.workflow.join(" ")).not.toContain("Write one fixed project configuration")
  expect(specification.limits.join(" ")).not.toContain("manually rewritten")
})

test("복구 재시도는 같은 원본 백업을 보존하고 완료한다", async () =>
  fixture(async ({ root, file, agent }) => {
    const original = "{broken"
    await writeFile(file, original)
    const target = { scope: "project" as const, path: root }
    const { revision } = await agent.get(target)
    const backup = `${file}.repair-${revision}.bak`
    await writeFile(backup, original)
    await agent.repair({ ...target, revision: revision ?? "", value: {} })
    expect(await readFile(backup, "utf8")).toBe(original)
    expect(await readFile(file, "utf8")).toBe("{}\n")
  }))

test("실행 checkout과 공유 설정 root를 구분하여 조회하고 실행 파일을 검증한다", async () =>
  fixture(async ({ root, file }) => {
    const execution = join(root, "linked")
    await mkdir(execution)
    await writeFile(file, "{}")
    await writeFile(join(execution, "compose.yaml"), "services:\n  app:\n    image: node:24\n")
    const editor = createSettingsEditor({
      projects: { root: async () => root },
      directory: root,
      files: createSettingsFiles(),
      validateProject: (path, source) => readJsonSettings(path, undefined, { file, source }),
    })
    const agent = createSettingsAgent({
      editor,
      settings: async () => ({
        projectRoot: execution,
        rulesRoot: root,
        read: async () =>
          readJsonSettings(execution, undefined, { file, source: await readFile(file, "utf8") }),
      }),
    })
    const target = { scope: "project" as const, path: execution }
    expect(await agent.describe(target)).toMatchObject({
      projectRoot: execution,
      rulesRoot: root,
      file,
    })
    const { revision } = await agent.get(target)
    await agent.patch({
      ...target,
      revision: revision ?? "",
      patch: [
        { op: "add", path: "/composeFiles", value: ["compose.yaml"] },
        { op: "add", path: "/services", value: ["app"] },
      ],
    })
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
      composeFiles: ["compose.yaml"],
      services: ["app"],
    })
    await expect(readFile(join(execution, ".redpact/settings.json"))).rejects.toMatchObject({
      code: "ENOENT",
    })
    expect(await agent.validate(target)).toMatchObject({
      valid: true,
      readiness: "not_checked",
      approval: "not_checked",
    })
  }))

test("중복 키는 부분 수정할 수 없고 원본 백업을 남겨 복구한다", async () =>
  fixture(async ({ root, file, agent }) => {
    await writeFile(file, '{"tests":{},"tests":{}}')
    const target = { scope: "project" as const, path: root }
    const snapshot = await agent.get(target)
    expect(snapshot.value).toBe(null)
    expect(snapshot.issues).not.toEqual([])
    await expect(
      agent.patch({
        ...target,
        revision: snapshot.revision ?? "",
        patch: [{ op: "remove", path: "/tests" }],
      }),
    ).rejects.toThrow("repair")
    const result = await agent.repair({ ...target, revision: snapshot.revision ?? "", value: {} })
    expect(await readFile(result.backupFile ?? "", "utf8")).toBe('{"tests":{},"tests":{}}')
  }))

test("HTTP 잘못된 patch는 비밀 값을 포함하지 않는 오류를 반환한다", async () =>
  fixture(async ({ root, agent }) => {
    const app = createApp({ settingsAgent: agent } as never)
    const response = await app.request("/api/agent/settings/patch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: "project",
        path: root,
        create: true,
        patch: [{ op: "move", path: "/private-secret", from: "/tests" }],
      }),
    })
    expect(response.status).toBe(400)
    expect(await response.text()).not.toContain("private-secret")
  }))
