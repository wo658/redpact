import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { http, node } from "./target"

/** 데스크톱이 없는 서버에서도 폴더 선택 실패를 명확히 알리고 경로 입력 연결은 유지한다. */
test("데스크톱이 없으면 폴더 선택 불가를 알리고 직접 입력한 프로젝트는 연결한다", async (context) => {
  const step = createSteps(context)
  const response = await step("폴더 선택 요청", () => http("/api/dialogs/directory", "POST"))
  await step("선택 불가 원인 확인", () => {
    // 컨테이너에는 OS 데스크톱이 없어 선택을 성공으로 처리하면 안 된다.
    expect(response.status).toBe(503)
    expect(response.body.code).toBe("directory_picker_unavailable")
  })
  const connected = await step("직접 입력 경로로 프로젝트 연결", () =>
    http("/api/projects", "POST", { path: "/app" }),
  )
  await step("프로젝트 연결 성공 확인", () => {
    expect(connected.status).toBe(201)
    expect(connected.body.id).toBeTypeOf("string")
  })
})

/** 외부 웹 페이지에서 사용자 컴퓨터의 폴더 선택 창을 열 수 없어야 한다. */
test("외부 Origin과 같은 사이트의 다른 Origin은 폴더 선택 요청을 차단한다", async (context) => {
  const step = createSteps(context)
  const statuses = await step("외부 웹 Origin으로 폴더 선택 요청", () =>
    node<number[]>(`
    const statuses = [];
    for (const headers of [{Origin: 'https://evil.example'}, {'Sec-Fetch-Site':'same-site'}]) {
      const response = await fetch('http://127.0.0.1:54318/api/dialogs/directory', {method:'POST', headers});
      statuses.push(response.status);
    }
    console.log(JSON.stringify(statuses));
  `),
  )
  await step("두 요청의 접근 거부 확인", () => {
    expect(statuses).toEqual([403, 403])
  })
})
