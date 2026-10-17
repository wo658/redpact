import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node, rpc } from "./target"

type Status = {
  projectRoot: string
  rulesRoot: string
  observedBinding: { projectId: string; worktreeId: string } | null
  settings: { valid: boolean }
  readiness: string
  executions: { recent: { id: string; kind: string }[] }
  freshness: { state: string }
  humanAcceptance: string
}
type Review = {
  id: string
  executionId: string | null
  projectId: string
  worktreeId: string
  outcome: string
  reviewPath: string
  failures: { classification: string }[]
  evidence: { type: string; tool: string; arguments: Record<string, unknown> }[]
  freshness: { state: string }
  humanAcceptance: string
}

test("채팅 상태 조회는 등록 없이 진단하고 실제 실행의 검토 주소와 증거를 연결한다", async (context) => {
  const step = createSteps(context)
  const path = await step("컨테이너 안에 별도 단위 검증 프로젝트를 준비한다", () =>
    node<string>(`
    import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
    const path = mkdtempSync('/tmp/chat-context-');
    mkdirSync(path+'/.redpact');
    writeFileSync(path+'/unit.Dockerfile', 'FROM alpine:3.21\\nWORKDIR /workspace\\nCOPY . .\\n');
    writeFileSync(path+'/.redpact/settings.json', JSON.stringify({unitTests:{dockerfile:'unit.Dockerfile',command:'echo verification',patterns:['unit/*.test.ts']}}));
    console.log(JSON.stringify(path));
  `),
  )
  await step("관찰 전 상태는 빈 이력과 별도 최신성·수락 상태를 반환한다", async () => {
    const result = await rpc<{ isError?: boolean; structuredContent: Status }>("tools/call", {
      name: "get_workspace_status",
      arguments: { path },
    })
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({
      projectRoot: path,
      rulesRoot: path,
      observedBinding: null,
      settings: { valid: true },
      readiness: "not_checked",
      executions: { recent: [] },
      freshness: { state: "unknown" },
      humanAcceptance: "not_recorded",
    })
    const projects = await http<{ location: { root?: string } }[]>("/api/projects")
    expect(projects.body.some((project) => project.location.root === path)).toBe(false)
    const read = await http<Status>(`/api/workspace-status?path=${encodeURIComponent(path)}`)
    expect(read.status).toBe(200)
    expect(read.body).toEqual(result.structuredContent)
  })
  const checkout = await step(
    "공개 API에서 명시적으로 프로젝트와 체크아웃을 연결한다",
    async () => {
      const project = await http<{ id: string }>("/api/projects", "POST", { path })
      expect(project.status).toBe(201)
      const worktree = await http<{ id: string }>(
        `/api/projects/${project.body.id}/worktrees`,
        "POST",
        { path },
      )
      expect(worktree.status).toBe(201)
      return { projectId: project.body.id, worktreeId: worktree.body.id }
    },
  )
  const execution = await step("실제 단위 실행 요청에서 Docker 부재 오류를 기록한다", async () => {
    const run = await http<{ id: string }>(
      `/api/worktrees/${checkout.worktreeId}/unit-tests/run`,
      "POST",
      { executionScope: "all" },
    )
    expect(run.status).toBe(200)
    await expect
      .poll(
        async () => (await http<{ state: string }>(`/api/unit-runs/${run.body.id}`)).body.state,
        { timeout: 15000 },
      )
      .toBe("finished")
    return run.body.id
  })
  await step(
    "검토 주소와 로그 참조는 요청한 실행을 가리키며 실행 오류를 TDD 실패로 단정하지 않는다",
    async () => {
      const result = await rpc<{ isError?: boolean; structuredContent: Review }>("tools/call", {
        name: "get_review_context",
        arguments: { kind: "unit", id: execution },
      })
      expect(result.isError).not.toBe(true)
      const review = result.structuredContent
      expect(review).toMatchObject({
        id: execution,
        executionId: execution,
        ...checkout,
        outcome: "execution_error",
        freshness: { state: "unknown" },
        humanAcceptance: "not_recorded",
      })
      expect(review.failures.some((failure) => failure.classification === "assertion_failed")).toBe(
        false,
      )
      expect(review.evidence).toContainEqual(
        expect.objectContaining({
          type: "log",
          tool: "get_run",
          arguments: { kind: "unit", id: execution, detail: "log" },
        }),
      )
      const link = new URL(review.reviewPath, "http://localhost")
      expect(link.searchParams.get("page")).toBe("review")
      expect(link.searchParams.get("id")).toBe(execution)
      expect(link.searchParams.get("worktree")).toBe(checkout.worktreeId)
      const status = await http<Status>(`/api/workspace-status?path=${encodeURIComponent(path)}`)
      expect(status.body.observedBinding).toMatchObject(checkout)
      expect(status.body.executions.recent).toContainEqual(
        expect.objectContaining({ kind: "unit", id: execution }),
      )
      const read = await http<Review>(`/api/review-context?kind=unit&id=${execution}`)
      expect(read.body).toEqual(review)
    },
  )
}, 60000)
