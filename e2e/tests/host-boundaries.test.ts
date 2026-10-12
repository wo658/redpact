import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node, rpc } from "./target"

test("앱의 프로젝트·환경·설정 관리와 채팅의 실행 조회·검증을 함께 제공한다", async (context) => {
  const step = createSteps(context)
  const root = await node<string>(`
    import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
    const root=mkdtempSync('/tmp/host-boundaries-');mkdirSync(root+'/.redpact');
    writeFileSync(root+'/.redpact/settings.json','{}');
    console.log(JSON.stringify(root));
  `)
  const project = await http<{ id: string }>("/api/projects", "POST", { path: root })
  expect(project.status).toBe(201)
  const worktree = await http<{ id: string }>(
    `/api/projects/${project.body.id}/worktrees`,
    "POST",
    {
      path: root,
    },
  )
  expect(worktree.status).toBe(201)
  const projectPath = `/api/projects/${project.body.id}`
  const worktreePath = `/api/worktrees/${worktree.body.id}`
  await step("프로젝트와 환경 관리 API를 제공하며 읽기만으로 실행하지 않는다", async () => {
    const renamed = await http(projectPath, "PATCH", { name: "Managed workspace" })
    expect(renamed.status).toBe(200)
    expect(renamed.body.name).toBe("Managed workspace")
    const environment = await http<{ environment: unknown }>(`${projectPath}/test-container`)
    expect(environment.status).toBe(200)
    expect(environment.body.environment).toBeNull()
    expect((await http("/api/instance/settings")).status).toBe(200)
  })
  await step("앱 관리와 채팅 조회는 같은 원본 설정과 체크아웃 기록을 사용한다", async () => {
    const source = await http<{ source: string }>(`${projectPath}/configuration`)
    expect(source.status).toBe(200)
    expect(source.body.source).toBe("{}")
    expect((await http<{ id: string }>(worktreePath)).body.id).toBe(worktree.body.id)
    const history = await rpc<{ structuredContent: { worktreeId: string; items: unknown[] } }>(
      "tools/call",
      { name: "list_executions", arguments: { path: root } },
    )
    expect(history.structuredContent).toMatchObject({ worktreeId: worktree.body.id, items: [] })
    const validation = await rpc<{ structuredContent: { validation: { valid: boolean } } }>(
      "tools/call",
      { name: "configure", arguments: { action: "validate", path: root } },
    )
    expect(validation.structuredContent.validation.valid).toBe(true)
    expect((await http("/api/health")).status).toBe(200)
  })
}, 30000)
