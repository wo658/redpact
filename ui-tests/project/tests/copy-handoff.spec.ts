import { expect, test } from "@playwright/test"

const fixtureRoot = "/tmp/redpact-copy-handoff-fixture"

test("머지 충돌에서 해결 요청을 확인하고 복사한다", async ({ page, request }) => {
  const connected = await request.post("/api/projects", {
    data: { path: fixtureRoot, name: "Copy handoff fixture" },
  })
  if (!connected.ok()) {
    expect.fail(`Could not connect the copy-handoff fixture: ${await connected.text()}`)
  }
  const project = await connected.json()
  await test.step("충돌 fixture의 main branch와 feature worktree를 연결한다", async () => {
    expect(
      (
        await request.post(`/api/projects/${project.id}/tracking`, {
          data: { mainBranch: "main", hideMerged: false, showBranches: false },
        })
      ).ok(),
    ).toBeTruthy()
    expect(
      (
        await request.post(`/api/projects/${project.id}/worktrees`, {
          data: { path: `${fixtureRoot}-feature` },
        })
      ).ok(),
    ).toBeTruthy()
  })
  await page.addInitScript((id) => {
    localStorage.setItem("redpact:project", id)
    localStorage.setItem("redpact:language", "en")
  }, project.id)
  await page.goto("/")
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(page.url()).origin,
  })
  await test.step("feature worktree에서 Merge를 실행해 충돌 결과를 연다", async () => {
    await page.getByText("feature", { exact: true }).first().click()
    await page.getByRole("button", { name: "Merge", exact: true }).click()
    await expect(page.getByRole("heading", { name: "Resolve merge issue" })).toBeVisible()
  })
  await test.step("공통 복사 shell이 본문과 상세 Git 출력을 유지한다", async () => {
    await expect(page.locator("pre").filter({ hasText: "Resolve Redpact merge" })).toBeVisible()
    await page.getByRole("button", { name: "Copy", exact: true }).click()
    await expect(page.getByRole("button", { name: "Copied", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Git output", exact: true }).click()
    await expect(page.locator('[data-slot="collapsible-content"] pre')).toContainText(
      "Auto-merging file.txt",
    )
  })
})
