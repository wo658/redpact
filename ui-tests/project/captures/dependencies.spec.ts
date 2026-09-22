import { expect, type Page, type TestInfo, test } from "@playwright/test"

test("의존성 페이지의 빈 상태와 설정된 상태를 검토한다", async ({ page, request }, info) => {
  const response = await request.post("/api/projects", { data: { path: "/app", name: "Redpact" } })
  expect(response.ok()).toBeTruthy()
  const project = await response.json()
  const endpoint = `/api/projects/${project.id}/configuration`
  const read = await request.get(endpoint)
  expect(read.ok()).toBeTruthy()
  const original = await read.json()
  const source = JSON.parse(original.source)
  const evidence = [{ path: "ui-tests/project/tests/dependencies.spec.ts", line: 3 }]
  await page.addInitScript((id) => {
    localStorage.setItem("redpact:language", "ko")
    localStorage.setItem("redpact:project", id)
    localStorage.setItem("redpact:theme", "light")
  }, project.id)
  await page.goto("/")
  await page.getByRole("button", { name: "Dependencies", exact: true }).click()
  await expect(
    page.getByRole("region", { name: "프로젝트 Dependencies", exact: true }),
  ).toBeVisible()
  await expect(page.getByText("선언된 dependency가 없습니다.", { exact: true })).toBeVisible()
  await capture(page, info, "Dependencies / 개요 / 빈 상태")
  const configured = await request.put(endpoint, {
    data: {
      revision: original.revision,
      source: JSON.stringify({
        ...source,
        applicationServices: {
          web: { services: ["app"], description: "Application under review" },
        },
        dependencies: {
          payment: {
            kind: "remote",
            env: { app: { PAYMENT_URL: "https://example.test" } },
          },
        },
        relationships: [
          {
            from: "web",
            to: { kind: "dependency", name: "payment" },
            description: "Verify payment",
            evidence,
          },
        ],
      }),
    },
  })
  expect(configured.ok()).toBeTruthy()
  try {
    await page.addInitScript((id) => {
      localStorage.setItem("redpact:language", "ko")
      localStorage.setItem("redpact:project", id)
    }, project.id)
    await page.goto("/")
    await test.step("개요에서 앱과 의존 서비스의 연결을 확인한다", async () => {
      if (!(await page.getByRole("button", { name: "Dependencies", exact: true }).isVisible())) {
        await page.getByRole("button", { name: "사이드바 토글", exact: true }).click()
      }
      await page.getByRole("button", { name: "Dependencies", exact: true }).click()
      await expect(page.getByRole("tab", { name: "개요", selected: true })).toBeVisible()
      await expect(page.getByRole("button", { name: "앱 서비스: web", exact: true })).toBeVisible()
      const graph = page.getByRole("region", { name: "서비스 의존 관계" })
      await expect(
        graph.locator('.edgePaths path[data-id="edge_service0_service1_0"]'),
      ).toHaveCount(1)
      await capture(page, info, "Dependencies / 개요 / 연결된 서비스")
      await page.getByRole("button", { name: "의존 서비스: payment", exact: true }).click()
    })
    await test.step("미고정 종류과 설정됨을 구분하고 코드 근거를 확인한다", async () => {
      const details = page.getByRole("region", { name: "서비스 상세" })
      await expect(
        details.getByText("ui-tests/project/tests/dependencies.spec.ts:3").first(),
      ).toBeVisible()
      await expect(details.getByText("Verify payment", { exact: true })).toBeVisible()
      await capture(page, info, "Dependencies / 개요 / 서비스 상세")
    })
    await test.step("설정 탭에서 기존 환경변수 편집 기능을 사용한다", async () => {
      await page.getByRole("tab", { name: "설정", exact: true }).click()
      await expect(page.getByText("원격 연결", { exact: true })).toBeVisible()
      await expect(page.getByText("https://example.test", { exact: true })).toBeVisible()
      await expect(page.getByRole("button", { name: "환경변수 추가" })).toBeVisible()
      await capture(page, info, "Dependencies / 설정 / 환경변수 목록")
      await page.getByRole("button", { name: "PAYMENT_URL 수정" }).click()
      await expect(page.getByRole("textbox", { name: "value", exact: true })).toBeVisible()
      await capture(page, info, "Dependencies / 설정 / 환경변수 편집")
      await page
        .getByRole("textbox", { name: "value", exact: true })
        .fill("https://updated.example.test")
      await page.getByRole("button", { name: "저장", exact: true }).click()
      await expect(page.getByText("https://updated.example.test", { exact: true })).toBeVisible()
      await capture(page, info, "Dependencies / 설정 / 저장된 값")
      await page.getByRole("button", { name: "dependency mode 및 env override 도움말" }).click()
      await expect(page.getByRole("dialog")).toBeVisible()
      await capture(page, info, "Dependencies / 도움말 / 열린 대화상자")
      await page.getByRole("dialog").getByRole("button", { name: "닫기", exact: true }).click()
    })
  } finally {
    const latest = await (await request.get(endpoint)).json()
    const restored = await request.put(endpoint, {
      data: { source: original.source, revision: latest.revision },
    })
    expect(restored.ok()).toBeTruthy()
  }
})

async function capture(page: Page, info: TestInfo, name: string) {
  await test.step(`${name} 페이지를 캡처한다`, async () => {
    await page.evaluate(() => document.fonts.ready)
    await info.attach(name, {
      body: await page.screenshot({ animations: "disabled", scale: "css" }),
      contentType: "image/png",
    })
  })
}
