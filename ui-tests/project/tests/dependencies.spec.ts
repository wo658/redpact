import { expect, test } from "@playwright/test"

test("의존성 개요에서 구현 권장과 연결 근거를 읽고 실제 설정 편집으로 이동한다", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/projects", { data: { path: "/app", name: "Redpact" } })
  expect(response.ok()).toBeTruthy()
  const project = await response.json()
  const endpoint = `/api/projects/${project.id}/configuration`
  const read = await request.get(endpoint)
  expect(read.ok()).toBeTruthy()
  const original = await read.json()
  const source = JSON.parse(original.source)
  const evidence = [{ path: "ui-tests/project/tests/dependencies.spec.ts", line: 3 }]
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
            modes: { remote: { env: { app: { PAYMENT_URL: "https://example.test" } } } },
            assessments: {
              isolated: {
                status: "unavailable",
                reason: "Provider has no self-hosted service",
                evidence,
              },
              mock: {
                status: "implementation-needed",
                reason: "Implement payment adapter",
                evidence,
              },
            },
            recommendation: { mode: "mock", reason: "Local payment verification" },
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
      await page.getByRole("button", { name: "Dependencies", exact: true }).click()
      await expect(page.getByRole("tab", { name: "개요", selected: true })).toBeVisible()
      await expect(page.getByRole("button", { name: "앱 서비스: web", exact: true })).toBeVisible()
      const graph = page.getByRole("region", { name: "서비스 의존 관계" })
      await expect(
        graph.locator('.edgePaths path[data-id="edge_service0_service1_0"]'),
      ).toHaveCount(1)
      await page.getByRole("button", { name: "의존 서비스: payment", exact: true }).click()
    })
    await test.step("미구현 권장과 설정됨을 구분하고 코드 근거를 확인한다", async () => {
      const details = page.getByRole("region", { name: "서비스 상세" })
      await expect(details.getByText("구현 필요", { exact: true })).toBeVisible()
      await expect(details.getByText("사용 불가", { exact: true })).toBeVisible()
      await expect(details.getByText("Mode configured", { exact: true })).toBeVisible()
      await expect(details.getByText("Local payment verification", { exact: false })).toBeVisible()
      await expect(
        details.getByText("ui-tests/project/tests/dependencies.spec.ts:3").first(),
      ).toBeVisible()
      await expect(details.getByText("Verify payment", { exact: true })).toBeVisible()
    })
    await test.step("설정 탭에서 기존 환경변수 편집 기능을 사용한다", async () => {
      await page.getByRole("tab", { name: "설정", exact: true }).click()
      await expect(page.getByRole("tab", { name: "원격 연결", exact: true })).toBeVisible()
      await expect(page.getByText("https://example.test", { exact: true })).toBeVisible()
      await expect(page.getByRole("button", { name: "환경변수 추가" })).toBeVisible()
      await page.getByRole("button", { name: "PAYMENT_URL 수정" }).click()
      await page
        .getByRole("textbox", { name: "value", exact: true })
        .fill("https://updated.example.test")
      await page.getByRole("button", { name: "저장", exact: true }).click()
      await expect(page.getByText("https://updated.example.test", { exact: true })).toBeVisible()
    })
  } finally {
    const latest = await (await request.get(endpoint)).json()
    const restored = await request.put(endpoint, {
      data: { source: original.source, revision: latest.revision },
    })
    expect(restored.ok()).toBeTruthy()
  }
})
