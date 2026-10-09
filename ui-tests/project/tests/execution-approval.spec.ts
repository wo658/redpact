import { expect, test } from "@playwright/test"
import {
  openExecutionReview,
  openExecutionReviewViewer,
  openIntegrationReviewViewer,
} from "../execution-review"

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

test("채팅의 Unit 승인 카드는 변경된 입력을 실행하지 않고 취소를 반영한다", async ({ page }) => {
  const review = await openExecutionReview(page)
  try {
    await test.step("실제 MCP 요청의 명령과 승인 대기 상태를 확인한다", async () => {
      await expect(review.card.getByText("echo reviewed-command", { exact: true })).toBeVisible()
      await expect(review.card.getByRole("button", { name: "Approve execution" })).toBeEnabled()
      await review.card.getByText("Inputs", { exact: true }).click()
      await expect(review.card.getByText("Settings", { exact: true })).toBeVisible()
    })
    await test.step("검토 후 파일이 바뀌면 실제 승인 요청이 실행을 거부한다", async () => {
      await review.changeInputs()
      await review.card.getByRole("button", { name: "Approve execution" }).click()
      await expect(review.frame.getByText(/Execution inputs changed during review/)).toBeVisible()
      const state = await review.rpc("tools/call", {
        name: "get_execution",
        arguments: { kind: "unit", id: review.id },
      })
      expect(state.structuredContent.state).toBe("awaiting_approval")
      expect(state.structuredContent.run).toBeUndefined()
    })
    await test.step("채팅에서 취소한 검토를 다시 읽으면 승인 버튼을 제거한다", async () => {
      await review.rpc("tools/call", {
        name: "cancel_execution",
        arguments: { kind: "unit", id: review.id },
      })
      await review.refresh()
      await expect(review.card.getByText("cancelled", { exact: true })).toBeVisible()
      await expect(review.card.getByRole("button", { name: "Approve execution" })).toHaveCount(0)
    })
  } finally {
    await review.restore()
  }
})

for (const width of [1280, 390]) {
  test(`${width}px 실행 검토 링크는 승인 입력과 취소 상태를 같은 요청에 유지한다`, async ({
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
          name: "get_execution",
          arguments: { kind: "unit", id: review.id },
        })
        expect(response.structuredContent.state).toBe("awaiting_approval")
        expect(response.structuredContent.run).toBeUndefined()
      })
      await test.step("명시적인 뷰어 취소가 MCP 상태와 재열기에도 반영된다", async () => {
        await page.getByRole("button", { name: "Cancel request", exact: true }).click()
        await expect(page.getByText("cancelled", { exact: true })).toBeVisible()
        await expect(
          page.getByRole("button", { name: "Approve execution", exact: true }),
        ).toHaveCount(0)
        const response = await review.rpc("tools/call", {
          name: "get_review_context",
          arguments: { kind: "unit", id: review.id },
        })
        expect(response.structuredContent.state).toBe("cancelled")
        expect(response.structuredContent.id).toBe(review.id)
        await page.reload()
        await expect(page.getByText("cancelled", { exact: true })).toBeVisible()
        await expect(page.getByRole("button", { name: "Cancel request", exact: true })).toHaveCount(
          0,
        )
      })
    } finally {
      await review.restore()
    }
  })
}

test("채팅에서 만든 요청과 취소는 현재 작업과 실행 상세에 새로고침 없이 반영된다", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeEvents = window.EventSource
    const opened = new Set<string>()
    Object.assign(window, { redpactOpenEvents: opened })
    window.EventSource = class extends NativeEvents {
      constructor(url: string | URL, options?: EventSourceInit) {
        super(url, options)
        this.addEventListener("open", () => opened.add(this.url))
        this.addEventListener("error", () => opened.delete(this.url))
      }
      close() {
        opened.delete(this.url)
        super.close()
      }
    }
  })
  const review = await openExecutionReviewViewer(page)
  let nextId: string | undefined
  async function waitForEvidence() {
    await expect
      .poll(() =>
        page.evaluate((worktreeId) => {
          const opened = (window as unknown as { redpactOpenEvents: Set<string> }).redpactOpenEvents
          return [...opened].some((value) => {
            const url = new URL(value)
            return (
              url.searchParams.get("scope") === "evidence" &&
              url.searchParams.get("worktreeId") === worktreeId
            )
          })
        }, review.context.worktreeId),
      )
      .toBe(true)
  }
  try {
    await test.step("현재 작업의 근거 구독이 열린 뒤 채팅 취소가 목록에서 사라진다", async () => {
      await page.goto(
        `/?project=${review.context.projectId}&page=current&worktree=${review.context.worktreeId}`,
      )
      await expect(page.getByText(review.id, { exact: true })).toBeVisible()
      await waitForEvidence()
      await review.rpc("tools/call", {
        name: "cancel_execution",
        arguments: { kind: "unit", id: review.id },
      })
      await expect(page.getByText("No requests awaiting approval.", { exact: true })).toBeVisible()
    })
    await test.step("같은 checkout의 새 채팅 요청이 목록에 나타나고 정확한 상세로 열린다", async () => {
      const result = await review.rpc("tools/call", {
        name: "run_unit_tests",
        arguments: { path: review.root },
      })
      expect(result.isError).not.toBe(true)
      nextId = result.structuredContent.reviewId
      expect(nextId).toBeTruthy()
      if (typeof nextId !== "string") {
        throw new Error("MCP did not return the pending review identity")
      }
      await expect(page.getByText(nextId, { exact: true })).toBeVisible()
      await page.getByRole("button", { name: "Review request", exact: true }).click()
      await expect(
        page.getByRole("button", { name: "Approve execution", exact: true }),
      ).toBeEnabled()
      expect(new URL(page.url()).searchParams.get("id")).toBe(nextId)
      await waitForEvidence()
    })
    await test.step("상세를 보는 동안 채팅에서 취소하면 승인 제어가 사라진다", async () => {
      await review.rpc("tools/call", {
        name: "cancel_execution",
        arguments: { kind: "unit", id: nextId },
      })
      await expect(page.getByText("cancelled", { exact: true })).toBeVisible()
      await expect(
        page.getByRole("button", { name: "Approve execution", exact: true }),
      ).toHaveCount(0)
    })
  } finally {
    if (nextId) {
      await review.rpc("tools/call", {
        name: "cancel_execution",
        arguments: { kind: "unit", id: nextId },
      })
    }
    await review.restore()
  }
})
