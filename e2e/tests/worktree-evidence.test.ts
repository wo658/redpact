import { beforeAll, expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node, rpc } from "./target"

type Submission = { id: string; worktreeId: string; files: { path: string; source: string }[] }
type Page = { items: { id: string }[] }
let checkout: string
let worktreeId: string
let primaryId: string
let projectId: string
const source =
  'import { test, expect } from "vitest"; test("제출된 테스트 검증", () => expect(2 + 2).toBe(4))'

beforeAll(async () => {
  checkout = await node<string>(`
    import {execFileSync} from 'node:child_process';
    import {randomUUID} from 'node:crypto';
    const id = randomUUID(); const path = '/tmp/redpact-e2e-' + id;
    execFileSync('git', ['-C', '/app', '-c', 'core.hooksPath=/dev/null', 'worktree', 'add', '-b', 'e2e-' + id, path, 'HEAD']);
    console.log(JSON.stringify(path));
  `)
  const project = await http<{ id: string }>("/api/projects", "POST", { path: "/app" })
  expect(project.status).toBe(201)
  projectId = project.body.id
  const primary = await http<{ id: string }>(`/api/projects/${projectId}/worktrees`, "POST", {
    path: "/app",
  })
  const linked = await http<{ id: string }>(`/api/projects/${projectId}/worktrees`, "POST", {
    path: checkout,
  })
  expect(primary.status).toBe(201)
  expect(linked.status).toBe(201)
  primaryId = primary.body.id
  worktreeId = linked.body.id
}, 30000)

/** 제출 증거가 선택한 체크아웃에 연결되고 기본 체크아웃에 섞이지 않아야 한다. */
test("선택한 워크트리에만 제출한 테스트 증거가 표시된다", async (context) => {
  const step = createSteps(context)
  const work = await step("선택한 워크트리에 작업 생성", () =>
    http<{ id: string }>("/api/work-items", "POST", {
      worktreeId,
      intent: "워크트리별 증거 연결 검증",
    }),
  )
  await step("작업 생성 결과 확인", () => expect(work.status).toBe(201))
  const submission = await step("검증할 테스트 소스 제출", () =>
    http<Submission>(`/api/work-items/${work.body.id}/submissions`, "POST", {
      files: [{ path: "acceptance.test.ts", source }],
    }),
  )
  await step("선택한 워크트리에만 제출이 나타나는지 확인", async () => {
    expect(submission.status).toBe(201)
    expect(submission.body.worktreeId).toBe(worktreeId)
    const selected = await http<Page>(`/api/submissions?worktreeId=${worktreeId}`)
    const primary = await http<Page>(`/api/submissions?worktreeId=${primaryId}`)
    expect(selected.status).toBe(200)
    expect(selected.body.items.map((item) => item.id)).toContain(submission.body.id)
    expect(primary.body.items.map((item) => item.id)).not.toContain(submission.body.id)
  })
}, 30000)

/** 경로 이탈 요청으로 제출된 원본과 이력이 변경되지 않아야 한다. */
test("잘못된 소스는 거부하고 제출한 소스는 그대로 보존한다", async (context) => {
  const step = createSteps(context)
  const work = await step("선택한 워크트리에 작업 생성", () =>
    http<{ id: string }>("/api/work-items", "POST", {
      worktreeId,
      intent: "제출된 소스 보존 검증",
    }),
  )
  const accepted = await step("원본 테스트 소스 제출", () =>
    http<Submission>(`/api/work-items/${work.body.id}/submissions`, "POST", {
      files: [{ path: "immutable.test.ts", source }],
    }),
  )
  await step("원본 소스 제출 성공 확인", () => expect(accepted.status).toBe(201))
  await step("경로 이탈 소스 거부와 원본 증거 보존 확인", async () => {
    const before = await http<Page>(`/api/submissions?worktreeId=${worktreeId}`)
    const rejected = await http(`/api/work-items/${work.body.id}/submissions`, "POST", {
      files: [{ path: "../escape.test.ts", source }],
    })
    expect(rejected.status).toBe(400)
    const after = await http<Page>(`/api/submissions?worktreeId=${worktreeId}`)
    expect(after.body.items).toEqual(before.body.items)
    const stored = await http<Submission>(`/api/submissions/${accepted.body.id}`)
    expect(stored.body.files).toEqual([{ path: "immutable.test.ts", source }])
  })
}, 30000)

test("MCP가 선택한 워크트리를 확인하고 테스트 결과 카드를 제공한다", async (context) => {
  const step = createSteps(context)
  await step("MCP에서 실행 경로와 공유 설정 유효성 확인", async () => {
    const inspected = await rpc<{
      isError?: boolean
      structuredContent: { projectRoot: string; rulesRoot: string; validation: { valid: boolean } }
    }>("tools/call", {
      name: "configure",
      arguments: {
        action: "validate",
        path: checkout,
      },
    })
    expect(inspected.isError).not.toBe(true)
    expect(inspected.structuredContent.projectRoot).toBe(checkout)
    expect(inspected.structuredContent.rulesRoot).toBe("/app")
    expect(inspected.structuredContent.validation.valid).toBe(true)
  })
  await step("MCP 도구가 제공하는 결과 카드 리소스 확인", async () => {
    const tools = await rpc<{
      tools: { name: string; _meta?: { ui?: { resourceUri: string } } }[]
    }>("tools/list", {})
    const uri = tools.tools.find((tool) => tool.name === "get_run")?._meta?.ui?.resourceUri
    expect(uri).toBe("ui://redpact/tests.html")
    const resource = await rpc<{ contents: { mimeType: string; text: string }[] }>(
      "resources/read",
      {
        uri,
      },
    )
    expect(resource.contents[0].mimeType).toBe("text/html;profile=mcp-app")
    expect(resource.contents[0].text).toContain('<div id="root">')
  })
}, 30000)

/** 파일 감시기는 저장 버스트를 모으고 일반 소스 변경으로 중복 제출하지 않아야 한다. */
test("연속 저장한 테스트는 최종 내용으로 한 번만 제출된다", async (context) => {
  const step = createSteps(context)
  const initial =
    'import { test, expect } from "vitest"; test("저장된 값 검증", () => expect(0).toBe(0))'
  await step("초기 테스트 파일을 저장하고 프로젝트 관찰 설정", async () => {
    await node(
      `import {writeFileSync} from 'node:fs'; const {checkout, source} = JSON.parse(process.argv[1]); writeFileSync(checkout + '/e2e/tests/saved.test.ts', source); console.log('null');`,
      { checkout, source: initial },
    )
    const settings = await http<{ source: string; revision: string }>("/api/instance/settings")
    const value = JSON.parse(settings.body.source)
    value.projects = [...new Set([...(value.projects ?? []), checkout])]
    const saved = await http("/api/instance/settings", "PUT", {
      source: JSON.stringify(value),
      revision: settings.body.revision,
    })
    expect(saved.status).toBe(200)
  })
  async function latestSource() {
    const page = await http<Page>(`/api/submissions?worktreeId=${worktreeId}`)
    if (!page.body.items[0]) {
      return undefined
    }
    const record = await http<Submission>(`/api/submissions/${page.body.items[0].id}`)
    return record.body.files.find((file) => file.path === "saved.test.ts")?.source
  }
  await step("초기 테스트 제출 관찰", () =>
    expect.poll(latestSource, { timeout: 20000, interval: 250 }).toBe(initial),
  )
  const before = await step("저장 전 제출 목록 확인", () =>
    http<Page>(`/api/submissions?worktreeId=${worktreeId}`),
  )
  const final = await step("테스트 파일을 연속으로 20회 저장", () =>
    node<string>(
      `
    import {writeFileSync} from 'node:fs';
    const {checkout} = JSON.parse(process.argv[1]); let source;
    for(let i=1; i<=20; i++) {
      source = 'import {test, expect} from "vitest"; test("저장된 값 검증", () => expect(' + i + ').toBe(' + i + '))';
      writeFileSync(checkout + '/e2e/tests/saved.test.ts', source);
    }
    console.log(JSON.stringify(source));
  `,
      { checkout },
    ),
  )
  await step("최종 저장 내용으로 제출되는지 확인", () =>
    expect.poll(latestSource, { timeout: 10000, interval: 250 }).toBe(final),
  )
  await step("일반 소스 변경은 추가 테스트 제출을 만들지 않는지 확인", async () => {
    await node(
      `import {writeFileSync} from 'node:fs'; const {checkout} = JSON.parse(process.argv[1]); writeFileSync(checkout + '/ordinary-source.ts', 'export const value = 1'); await new Promise(r=>setTimeout(r,2200)); console.log('null');`,
      { checkout },
    )
    const after = await http<Page>(`/api/submissions?worktreeId=${worktreeId}`)
    expect(after.body.items).toHaveLength(before.body.items.length + 1)
  })
}, 60000)
