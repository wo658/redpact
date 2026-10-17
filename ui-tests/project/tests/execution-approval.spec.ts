import { expect, test } from "@playwright/test"
import { openExecutionReviewViewer, openIntegrationReviewViewer } from "../execution-review"

test("Integration 환경 승인 전에 요청에 저장된 앱 서비스와 테스트를 확인한다", async ({ page }) => {
  const review = await openIntegrationReviewViewer(page)
  try {
    await test.step("의존성이 없어도 실행할 앱 서비스를 승인 입력에서 보여준다", async () => {
      const preview = page.getByRole("region", { name: "Requested execution", exact: true })
      await expect(
        preview.getByRole("heading", { name: "Services · 1", exact: true }),
      ).toBeVisible()
      await expect(preview.getByText("reviewed-app", { exact: true })).toBeVisible()
      await expect(
        preview.getByRole("heading", { name: "Dependencies · 0", exact: true }),
      ).toBeVisible()
      await expect(
        preview.getByText("검토한 서비스만 환경 승인의 대상이다", { exact: true }),
      ).toBeVisible()
      await expect(
        page.getByRole("button", { name: "Approve environment", exact: true }),
      ).toBeEnabled()
      const result = await review.rpc("tools/call", {
        name: "get_review_context",
        arguments: { kind: "integration", id: review.id },
      })
      expect(result.structuredContent.executionId).toBeNull()
      expect(result.structuredContent.approval.environmentApproved).toBe(false)
    })
    await test.step("환경 승인만 클릭하면 테스트 승인을 별도로 기다린다", async () => {
      await page.getByRole("button", { name: "Approve environment", exact: true }).click()
      await expect(page.getByRole("button", { name: "Approve tests", exact: true })).toBeEnabled()
      const result = await review.rpc("tools/call", {
        name: "get_review_context",
        arguments: { kind: "integration", id: review.id },
      })
      expect(result.structuredContent.executionId).toBeNull()
      expect(result.structuredContent.approval.environmentApproved).toBe(true)
      expect(result.structuredContent.approval.testsApproved).toBe(false)
      expect(result.structuredContent.approval.preview.services).toEqual(["reviewed-app"])
    })
  } finally {
    await review.restore()
  }
})

for (const width of [1280, 390]) {
  test(`${width}px 실행 검토 링크는 승인 입력을 같은 요청에 유지하고 취소를 노출하지 않는다`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const review = await openExecutionReviewViewer(page)
    try {
      await test.step("MCP가 반환한 상세 링크에서 실제 요청의 명령과 입력 식별자를 확인한다", async () => {
        const preview = page.getByRole("region", { name: "Requested execution", exact: true })
        await expect(preview.getByText("echo reviewed-command", { exact: true })).toBeVisible()
        await expect(preview.getByText("Dockerfile", { exact: true })).toHaveCount(2)
        await expect(
          preview.getByText(review.context.approval.preview.settingsDigest, { exact: true }),
        ).toBeVisible()
        await expect(
          preview.getByText(review.context.approval.preview.inputDigest, { exact: true }),
        ).toBeVisible()
        await expect(
          page.getByText("Human acceptance is not recorded.", { exact: true }),
        ).toBeVisible()
        await expect(
          page.getByRole("button", { name: "Approve execution", exact: true }),
        ).toBeEnabled()
        await page.reload()
        await expect(page.getByText(review.id, { exact: true })).toBeVisible()
        expect(new URL(page.url()).searchParams.get("id")).toBe(review.id)
        const globalReview = new URL(page.url())
        globalReview.searchParams.delete("project")
        globalReview.searchParams.delete("worktree")
        await page.goto(`${globalReview.pathname}${globalReview.search}`)
        await expect(page.getByText(review.id, { exact: true })).toBeVisible()
        await expect(
          page
            .getByRole("region", { name: "Requested execution" })
            .getByText("echo reviewed-command", { exact: true }),
        ).toBeVisible()
        expect(new URL(page.url()).searchParams.has("project")).toBe(false)
        await page.goto(review.context.reviewPath)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        )
      })
      await test.step("입력 변경 후 뷰어의 승인 버튼은 실행을 시작하지 않는다", async () => {
        await review.changeInputs()
        await page.getByRole("button", { name: "Approve execution", exact: true }).click()
        await expect(page.getByText(/Execution inputs changed during review/)).toBeVisible()
        const response = await review.rpc("tools/call", {
          name: "get_run",
          arguments: { kind: "unit", id: review.id },
        })
        expect(response.structuredContent.state).toBe("awaiting_approval")
        expect(response.structuredContent.run).toBeUndefined()
      })
      await test.step("새로고침해도 취소 제어가 없고 같은 요청을 유지한다", async () => {
        await expect(page.getByRole("button", { name: "Cancel request", exact: true })).toHaveCount(
          0,
        )
        await page.reload()
        await expect(page.getByText(review.id, { exact: true })).toBeVisible()
        await expect(page.getByRole("button", { name: "Cancel request", exact: true })).toHaveCount(
          0,
        )
      })
    } finally {
      await review.restore()
    }
  })
}
