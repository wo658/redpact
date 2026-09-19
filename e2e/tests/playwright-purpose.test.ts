import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node } from "./target"

/** 프로젝트는 실행 전에도 목적별 파일을 보여주고 카탈로그 밖 소스 접근을 거부한다. */
test("프로젝트 Playwright 파일은 실행 없이 목적별로 조회되고 중복 분류는 거부된다", async (context) => {
  const step = createSteps(context)
  const root = await step("임의 폴더 이름으로 캡처와 기능 검증 소스를 준비한다", () =>
    node<string>(`
    import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
    const root=mkdtempSync('/tmp/playwright-purpose-');
    mkdirSync(root+'/.redpact'); mkdirSync(root+'/browser');
    writeFileSync(root+'/browser/panel.ts', "throw new Error('Discovery must not execute capture code')");
    writeFileSync(root+'/browser/save.spec.ts', "throw new Error('Discovery must not execute functional code')");
    writeFileSync(root+'/outside.ts','private source');
    writeFileSync(root+'/compose.yaml','services:\\n  app:\\n    image: example\\n');
    writeFileSync(root+'/.redpact/settings.json',JSON.stringify({composeFiles:['compose.yaml'],playwright:{directory:'browser',service:'app',port:3000,targets:{screens:{purpose:'capture',testMatch:['panel.ts']},checks:{purpose:'functional',testMatch:['save.spec.ts']}}}}));
    console.log(JSON.stringify(root));
  `),
  )
  const project = await step("실제 프로젝트로 연결한다", async () => {
    const response = await http<{ id: string }>("/api/projects", "POST", { path: root })
    expect(response.status).toBe(201)
    return response.body
  })
  await step("스크린샷 코드와 기능 검증 파일의 목적을 구별한다", async () => {
    const response = await http<{ files: { path: string; purpose: string }[] }>(
      `/api/projects/${project.id}/playwright`,
    )
    expect(response.status).toBe(200)
    expect(response.body.files).toEqual([
      { path: "panel.ts", target: "screens", purpose: "capture", scope: "project" },
      { path: "save.spec.ts", target: "checks", purpose: "functional", scope: "project" },
    ])
    expect(
      (await http<{ runs: unknown[] }>(`/api/projects/${project.id}/playwright-runs`)).body.runs,
    ).toEqual([])
    const source = await http<string>(
      `/api/projects/${project.id}/playwright/source?path=save.spec.ts`,
    )
    expect(source.status).toBe(200)
    expect(source.body).toContain("Discovery must not execute functional code")
    expect(
      (await http(`/api/projects/${project.id}/playwright/source?path=../outside.ts`)).status,
    ).toBe(404)
  })
  await step("파일이 두 대상에 포함되면 공통 검증 오류로 표시한다", async () => {
    await node(
      `
      import {readFileSync,writeFileSync} from 'node:fs';
      const root=JSON.parse(process.argv[1]); const path=root+'/.redpact/settings.json';
      const settings=JSON.parse(readFileSync(path));settings.playwright.targets.checks.testMatch=['*.ts'];
      writeFileSync(path,JSON.stringify(settings));console.log('true');
    `,
      root,
    )
    const response = await http(`/api/projects/${project.id}/playwright`)
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(JSON.stringify(response.body)).toContain("multiple Playwright targets")
  })
})
