import { expect, test } from "@playwright/test"
import { openMcpEnvironment } from "../mcp-app"

test("MCP 환경 카드는 실제 설정의 고정 종류를 선택 없이 표시한다", async ({ page, request }) => {
  const { restore, card } = await openMcpEnvironment(page, request)
  try {
    await test.step("모든 의존성과 고정 종류를 한 번씩 확인한다", async () => {
      await expect(card.getByText("payment", { exact: true })).toBeVisible()
      await expect(card.getByText("search", { exact: true })).toBeVisible()
      await expect(card.getByText("Kind: Remote connection", { exact: true })).toHaveCount(1)
      await expect(card.getByText("Kind: Shared local", { exact: true })).toHaveCount(1)
      await expect(card.getByRole("combobox")).toHaveCount(0)
      await test.step("채팅 카드는 전체 앱의 프로젝트 관리와 설정 탐색을 포함하지 않는다", async () => {
        for (const name of ["Manage projects", "Project settings", "Settings", "Container"]) {
          await expect(card.getByRole("button", { name, exact: true })).toHaveCount(0)
        }
        await expect(page.frameLocator("iframe").locator('[data-slot="sidebar"]')).toHaveCount(0)
      })
      await expect(card.getByText("Valid configuration", { exact: true })).toBeVisible()
    })
  } finally {
    await restore()
  }
})
