import { expect, test } from "@playwright/test"
import { verifyProblems } from "../problems"

test.use({
  channel: "chromium",
  launchOptions: {
    args: ["--unsafely-treat-insecure-origin-as-secure=http://app.redpact.test:54320"],
  },
})

test.beforeEach(async ({ request, page }) => {
  const response = await request.post("/api/projects", {
    data: { path: process.env.REDPACT_TEST_PROJECT_ROOT ?? "/app", name: "Redpact" },
  })
  expect(response.ok()).toBeTruthy()
  const project = await response.json()
  await page.addInitScript((id: string) => localStorage.setItem("redpact:project", id), project.id)
})

for (const width of [1280, 390]) {
  test(`${width}px에서 백그라운드 503은 본문을 가리지 않고 문제 목록에서 확인한다`, async ({
    page,
  }) => {
    const { recover } = await verifyProblems(page, expect, width)
    await recover()
  })
}
