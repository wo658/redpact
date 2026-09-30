import { expect, test } from "@playwright/test"

test("의존성 개요에서 고정 종류와 연결 근거를 읽고 실제 설정 편집으로 이동한다", async ({
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
          gateway: { services: ["gateway"], description: "Routes requests to the application" },
        },
        dependencies: {
          payment: {
            kind: "remote",
            env: { app: { PAYMENT_URL: "https://example.test" } },
          },
          search: { kind: "shared-local", env: { app: { SEARCH_URL: "http://search.test" } } },
        },
        relationships: [
          {
            from: "gateway",
            to: { kind: "application", name: "web" },
            description: "Forward incoming requests",
            evidence,
          },
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
        await page.getByRole("button", { name: "사이드바 전환", exact: true }).click()
      }
      await page.getByRole("button", { name: "Dependencies", exact: true }).click()
      if ((page.viewportSize()?.width ?? 1920) < 768) {
        await page.keyboard.press("Escape")
      }
      await expect(page.getByRole("tab", { name: "개요", selected: true })).toBeVisible()
      await expect(page.getByRole("button", { name: "앱 서비스: web", exact: true })).toBeVisible()
      const graph = page.getByRole("region", { name: "서비스 의존 관계" })
      await expect(
        graph.locator('.edgePaths path[data-id="edge_service0_service2_1"]'),
      ).toHaveCount(1)
      const details = page.getByRole("region", { name: "서비스 상세" })
      await expect(details.getByRole("heading", { name: "web", exact: true })).toBeVisible()
      await expect(details.getByText("앱 서비스", { exact: true }).first()).toBeVisible()
      const incoming = details.getByRole("region", { name: "사용하는 서비스 · 1" })
      const outgoing = details.getByRole("region", { name: "의존하는 서비스 · 1" })
      await expect(incoming.getByText("gateway", { exact: true })).toBeVisible()
      await expect(outgoing.getByText("payment", { exact: true })).toBeVisible()
      const left = await incoming.boundingBox()
      const right = await outgoing.boundingBox()
      expect(left).not.toBeNull()
      expect(right).not.toBeNull()
      if (!left || !right) {
        throw new Error("관계 영역의 위치를 읽을 수 없습니다.")
      }
      if ((page.viewportSize()?.width ?? 1920) < 768) {
        expect(right.y).toBeGreaterThan(left.y)
      } else {
        expect(Math.abs(right.y - left.y)).toBeLessThan(2)
        expect(right.x).toBeGreaterThan(left.x)
      }
      const compose = details.getByRole("button", { name: "Compose 서비스 · 1", exact: true })
      await compose.focus()
      await page.keyboard.press("Enter")
      await expect(compose).toHaveAttribute("aria-expanded", "true")
      await expect(details.getByText("app", { exact: true })).toBeVisible()
      await page.keyboard.press("Space")
      await expect(compose).toHaveAttribute("aria-expanded", "false")
      const payment = page.getByRole("button", { name: "의존 서비스: payment", exact: true })
      await payment.focus()
      await page.keyboard.press("Enter")
      await expect(payment).toBeFocused()
      await expect(payment).toHaveAttribute("aria-pressed", "true")
    })
    await test.step("서비스 상세에서 연결의 코드 근거를 확인한다", async () => {
      const details = page.getByRole("region", { name: "서비스 상세" })
      const evidence = details.getByRole("button", { name: "코드 근거 · 1", exact: true })
      await expect(evidence).toHaveAttribute("aria-expanded", "false")
      await expect(details.getByText("ui-tests/project/tests/dependencies.spec.ts:3")).toBeHidden()
      await evidence.focus()
      await page.keyboard.press("Enter")
      await expect(evidence).toHaveAttribute("aria-expanded", "true")
      await expect(details.getByText("ui-tests/project/tests/dependencies.spec.ts:3")).toBeVisible()
      await page.keyboard.press("Space")
      await expect(evidence).toHaveAttribute("aria-expanded", "false")
      await expect(details.getByText("Verify payment", { exact: true })).toBeVisible()
    })
    await test.step("연결 미작성 노드는 실행 상태를 추측하지 않고 빈 관계를 표시한다", async () => {
      const search = page.getByRole("button", { name: "의존 서비스: search", exact: true })
      await search.focus()
      await page.keyboard.press("Space")
      await expect(search).toBeFocused()
      const details = page.getByRole("region", { name: "서비스 상세" })
      await expect(details.getByRole("heading", { name: "search", exact: true })).toBeVisible()
      await expect(details.getByRole("region", { name: "사용하는 서비스 · 0" })).toBeVisible()
      await expect(details.getByText("작성된 의존 관계가 없습니다.", { exact: true })).toBeVisible()
      await expect(details.getByRole("region", { name: /의존하는 서비스/ })).toHaveCount(0)
      await expect(details.getByRole("button", { name: /코드 근거/ })).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        page.viewportSize()?.width ?? 1920,
      )
    })
    await test.step("설정 탭에서 기존 환경변수 편집 기능을 사용한다", async () => {
      await page.getByRole("tab", { name: "설정", exact: true }).click()
      await expect(
        page
          .getByRole("tabpanel", { name: "설정", exact: true })
          .getByText("원격 연결", { exact: true }),
      ).toBeVisible()
      await expect(page.getByText("https://example.test", { exact: true })).toBeVisible()
      await expect(page.getByRole("button", { name: "dependency 선택", exact: true })).toHaveCount(
        0,
      )
      await expect(page.getByRole("heading", { name: "payment", exact: true })).toBeVisible()
      await expect(page.getByRole("heading", { name: "search", exact: true })).toBeVisible()
      await expect(page.getByText("http://search.test", { exact: true })).toBeVisible()
      await expect(page.getByRole("button", { name: "환경변수 추가" })).toHaveCount(2)
      await page.getByRole("button", { name: "PAYMENT_URL 수정" }).click()
      await page
        .getByRole("textbox", { name: "value", exact: true })
        .fill("https://updated.example.test")
      await page.getByRole("button", { name: "저장", exact: true }).click()
      await expect(page.getByText("https://updated.example.test", { exact: true })).toBeVisible()
      const saved = JSON.parse((await (await request.get(endpoint)).json()).source)
      expect(saved.dependencies.payment.env.app.PAYMENT_URL).toBe("https://updated.example.test")
      expect(saved.dependencies.search.env.app.SEARCH_URL).toBe("http://search.test")
    })
  } finally {
    const latest = await (await request.get(endpoint)).json()
    const restored = await request.put(endpoint, {
      data: { source: original.source, revision: latest.revision },
    })
    expect(restored.ok()).toBeTruthy()
  }
})
