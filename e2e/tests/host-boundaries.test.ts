import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node, rpc } from "./target"

test("호스트의 작업 관리 API는 제거하고 실행 대상 연결과 검증만 유지한다", async (context) => {
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
  await step("Git·프로젝트·설정·환경 관리 경로는 요청을 받지 않는다", async () => {
    const retired = [
      ["GET", `${worktreePath}/merge`],
      ["POST", `${worktreePath}/merge`],
      ["POST", `${worktreePath}/git/commit`],
      ["POST", `${worktreePath}/git/discard`],
      ["GET", `${worktreePath}/pull-request`],
      ["POST", `${worktreePath}/pull-request`],
      ["POST", "/api/work-starts"],
      ["GET", `${projectPath}/git/graph`],
      ["POST", `${projectPath}/git/fetch`],
      ["GET", `${projectPath}/files`],
      ["PATCH", projectPath],
      ["DELETE", projectPath],
      ["POST", `${projectPath}/reconnect`],
      ["POST", "/api/dialogs/directory"],
      ["PUT", `${projectPath}/configuration`],
      ["PUT", "/api/instance/settings"],
      ["POST", `${projectPath}/tracking`],
      ["GET", `${projectPath}/test-container`],
      ["POST", `${projectPath}/test-container/start`],
      ["GET", "/api/plugin-updates"],
      ["POST", "/api/plugin-updates/install"],
    ]
    for (const [method, path] of retired) {
      expect((await http(path, method, method === "GET" ? undefined : {})).status).toBe(404)
    }
  })
  await step("요청 거부 뒤에도 원본 설정과 체크아웃 기록은 보존한다", async () => {
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
