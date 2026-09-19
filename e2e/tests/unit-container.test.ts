import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node } from "./target"

type Run = {
  id: string
  state: string
  outcome: string
  projectRoot: string
  settings: { dockerfile: string; command: string }
  cleanup: { state: string }
  error: string
}

/** 컨테이너 정의는 프로젝트가 공유하고, Docker가 없을 때 호스트 실행으로 대체하지 않아야 한다. */
test("프로젝트 공용 단위 컨테이너 설정을 사용하고 Docker 부재를 실행 오류로 보존한다", async (context) => {
  const step = createSteps(context)
  const fixture = await step("별도 프로젝트와 워크트리에 서로 다른 단위 설정 준비", () =>
    node<{ primary: string; checkout: string }>(`
    import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
    import {execFileSync} from 'node:child_process';
    const primary = mkdtempSync('/tmp/unit-project-'); const checkout = primary + '-wt';
    const git = (...args) => execFileSync('git', ['-C', primary, '-c', 'core.hooksPath=/dev/null', ...args]);
    git('init', '-b', 'main'); git('config', 'user.name', 'Unit E2E'); git('config', 'user.email', 'unit@redpact.invalid');
    mkdirSync(primary + '/.redpact');
    const unitTests = {dockerfile:'unit.Dockerfile', command:'printf host-fallback > marker.txt', cwd:'.', patterns:['**/*.test.ts']};
    writeFileSync(primary + '/unit.Dockerfile', 'FROM alpine:3.21\\nWORKDIR /workspace\\nCOPY . .\\n');
    writeFileSync(primary + '/.redpact/settings.json', JSON.stringify({unitTests}));
    git('add', '.'); git('commit', '-m', 'Unit fixture'); git('worktree', 'add', '-b', 'feature', checkout);
    writeFileSync(checkout + '/.redpact/settings.json', JSON.stringify({unitTests:{...unitTests, dockerfile:'ignored.Dockerfile', command:'exit 99'}}));
    console.log(JSON.stringify({primary, checkout}));
  `),
  )
  const project = await step("공개 API로 프로젝트 연결", () =>
    http<{ id: string }>("/api/projects", "POST", { path: fixture.primary }),
  )
  await step("프로젝트 연결 성공 확인", () => expect(project.status).toBe(201))
  const worktree = await step("같은 프로젝트의 실행 워크트리 연결", () =>
    http<{ id: string }>(`/api/projects/${project.body.id}/worktrees`, "POST", {
      path: fixture.checkout,
    }),
  )
  await step("공유 설정이 워크트리 덮어쓰기보다 우선하는지 확인", async () => {
    expect(worktree.status).toBe(201)
    const inspected = await http<{ settings: Run["settings"] }>(
      `/api/worktrees/${worktree.body.id}/unit-tests`,
    )
    expect(inspected.status).toBe(200)
    // 실행 정의는 primary에서 읽고 소스만 선택된 WT에서 가져온다.
    expect(inspected.body.settings).toMatchObject({
      dockerfile: "unit.Dockerfile",
      command: "printf host-fallback > marker.txt",
    })
  })
  const started = await step("컨테이너 단위 명령 실행 요청", () =>
    http<Run>(`/api/worktrees/${worktree.body.id}/unit-tests/run`, "POST"),
  )
  await step("Docker가 없는 대상에서 호스트 실행 없이 오류와 정리 결과 보존 확인", async () => {
    expect(started.status).toBe(200)
    let result: Run | undefined
    await expect
      .poll(
        async () => {
          result = (await http<Run>(`/api/unit-runs/${started.body.id}`)).body
          return result.state
        },
        { timeout: 10000 },
      )
      .toBe("finished")
    expect(result).toMatchObject({
      outcome: "execution_error",
      projectRoot: fixture.checkout,
      cleanup: { state: "removed" },
    })
    expect(result?.error).toBeTruthy()
    const marker = await node<boolean>(
      `import {existsSync} from 'node:fs'; console.log(JSON.stringify(existsSync(JSON.parse(process.argv[1]) + '/marker.txt')));`,
      fixture.checkout,
    )
    expect(marker).toBe(false)
    const listed = await http<{ runs: Run[] }>(`/api/worktrees/${worktree.body.id}/unit-tests`)
    expect(listed.body.runs.map((run) => run.id)).toContain(started.body.id)
    const retry = await http<Run>(`/api/unit-runs/${started.body.id}/cancel`, "POST")
    expect(retry.body).toEqual(result)
  })
}, 60000)
