import { expect, type Page, test } from "@playwright/test"
import { http, node } from "./target"

type FailedRun = {
  id: string
  state: string
  outcome: string
  stderr: string
  cleanup: { state: string }
}

// 실제 실행 실패를 발생시킨다. 실행 기록이나 로그 fixture를 직접 작성하지 않는다.
export async function openContainerFailureReview(page: Page) {
  const worktree = await test.step("격리된 단위 실행 프로젝트를 연결한다", async () => {
    const root = await node<string>(`
        import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
        const root=mkdtempSync('/tmp/container-log-ui-');
        mkdirSync(root+'/.redpact');mkdirSync(root+'/unit');
        writeFileSync(root+'/unit/check.test.ts','export const reviewed = true');
        writeFileSync(root+'/Dockerfile','FROM alpine:3.21\\nWORKDIR /workspace\\nCOPY . .\\n');
        writeFileSync(root+'/.redpact/settings.json',JSON.stringify({unitTests:{dockerfile:'Dockerfile',command:'echo container-command',patterns:['unit/*.test.ts']}}));
        console.log(JSON.stringify(root));
      `)
    const project = await http<{ id: string }>("/api/projects", "POST", { path: root })
    expect(project.status).toBe(201)
    const connected = await http<{ id: string }>(
      `/api/projects/${project.body.id}/worktrees`,
      "POST",
      { path: root },
    )
    expect(connected.status).toBe(201)
    return connected.body
  })
  const run = await test.step("Docker가 없는 대상의 실제 준비 실패와 진단을 기록한다", async () => {
    const started = await http<FailedRun>(
      `/api/worktrees/${worktree.id}/unit-tests/run`,
      "POST",
      {},
    )
    expect(started.status, JSON.stringify(started.body)).toBe(200)
    let recorded: FailedRun | undefined
    await expect
      .poll(
        async () => {
          recorded = (await http<FailedRun>(`/api/unit-runs/${started.body.id}`)).body
          return recorded.state
        },
        { timeout: 30000 },
      )
      .toBe("finished")
    if (!recorded) {
      throw new Error("실행 결과가 기록되지 않았습니다")
    }
    expect(recorded.outcome).toBe("execution_error")
    expect(recorded.cleanup.state).toBe("removed")
    expect(recorded.stderr).toContain("Could not find a working container runtime strategy")
    return recorded
  })
  await test.step("같은 워크트리의 검토 링크와 복사 원문이 상세 실패 로그를 제공한다", async () => {
    const review = await http<{ executionId: string; worktreeId: string; reviewPath: string }>(
      `/api/review-context?kind=unit&id=${run.id}`,
    )
    expect(review.status).toBe(200)
    expect(review.body.executionId).toBe(run.id)
    expect(review.body.worktreeId).toBe(worktree.id)
    const copied = await http<{ text: string }>(`/api/runs/executions/unit/${run.id}/copy`)
    expect(copied.status).toBe(200)
    expect(copied.body.text).toContain(run.stderr)
    await page.addInitScript(() => localStorage.setItem("redpact:language", "en"))
    await page.goto(review.body.reviewPath)
    await expect(page.getByRole("status", { name: "Unit progress" })).toContainText("Finished")
    await expect(page.getByRole("region", { name: "stderr", exact: true })).toContainText(
      run.stderr,
    )
  })
  return run
}
