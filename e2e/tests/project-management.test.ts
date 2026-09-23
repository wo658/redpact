import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node } from "./target"

/** 연결 해제는 프로젝트 파일과 과거 제출을 보존하고 명시적인 재연결을 요구한다. */
test("프로젝트 이름과 연결 상태를 저장하고 같은 기록으로 재연결한다", async (context) => {
  const step = createSteps(context)
  const path = await step("독립된 프로젝트 폴더를 준비한다", () =>
    node<string>(`
    import {mkdtempSync, writeFileSync} from 'node:fs';
    const root = mkdtempSync('/tmp/project-management-');
    writeFileSync(root + '/keep.txt', 'preserved');
    console.log(JSON.stringify(root));
  `),
  )
  const project = await step("프로젝트를 연결하고 중복 연결을 확인한다", async () => {
    const created = await http<{ id: string }>("/api/projects", "POST", { path, name: "Original" })
    expect(created.status).toBe(201)
    const again = await http<{ id: string }>("/api/projects", "POST", { path })
    expect(again.body.id).toBe(created.body.id)
    return created.body
  })
  await step("표시 이름을 수정하고 다시 읽는다", async () => {
    const renamed = await http(`/api/projects/${project.id}`, "PATCH", { name: "Renamed" })
    expect(renamed.status).toBe(200)
    expect((await http(`/api/projects/${project.id}`)).body.name).toBe("Renamed")
    expect((await http(`/api/projects/${project.id}`, "PATCH", { name: "  " })).status).toBe(400)
  })
  const worktree = await step("실행 대상 식별자를 보관한다", async () => {
    const response = await http<{ id: string }>(`/api/projects/${project.id}/worktrees`, "POST", {
      path,
    })
    expect(response.status).toBe(201)
    return response.body
  })
  await step("연결 해제 후 목록과 실행 진입을 확인한다", async () => {
    expect((await http(`/api/projects/${project.id}`, "DELETE")).status).toBe(200)
    const connected = await http<{ id: string }[]>("/api/projects")
    expect(connected.body.some((item) => item.id === project.id)).toBe(false)
    const all = await http<{ id: string; disconnectedAt?: string }[]>(
      "/api/projects?includeDisconnected=true",
    )
    expect(all.body.find((item) => item.id === project.id)?.disconnectedAt).toBeTruthy()
    expect((await http(`/api/projects/${project.id}/worktrees`, "POST", { path })).status).toBe(409)
    expect((await http(`/api/worktrees/${worktree.id}`)).status).toBe(200)
  })
  await step("파일을 보존하고 같은 ID와 이름으로 재연결한다", async () => {
    const contents = await node<string>(
      `
      import {readFileSync} from 'node:fs';
      console.log(JSON.stringify(readFileSync(JSON.parse(process.argv[1]) + '/keep.txt','utf8')));
    `,
      path,
    )
    expect(contents).toBe("preserved")
    const restored = await http(`/api/projects/${project.id}/reconnect`, "POST", {})
    expect(restored.status).toBe(200)
    expect(restored.body).toMatchObject({ id: project.id, name: "Renamed" })
    expect(restored.body.disconnectedAt).toBeUndefined()
    expect((await http(`/api/projects/${project.id}/worktrees`, "POST", { path })).body.id).toBe(
      worktree.id,
    )
  })
})
