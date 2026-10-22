import type { Locator, Page } from "@playwright/test"

export async function openApp(page: Page, language = process.env.REDPACT_UI_LANGUAGE) {
  if (!language) {
    throw new Error("REDPACT_UI_LANGUAGE must be set by the Playwright target")
  }
  await page.addInitScript((value) => {
    localStorage.setItem("redpact:language", value)
  }, language)
  await page.goto("/")
}

// Offcanvas desktop navigation stays mounted outside the viewport.
export async function isOnScreen(locator: Locator) {
  if (!(await locator.isVisible())) {
    return false
  }
  const bounds = await locator.boundingBox()
  const viewport = locator.page().viewportSize()
  return (
    !!bounds &&
    !!viewport &&
    bounds.width > 0 &&
    bounds.height > 0 &&
    bounds.x >= 0 &&
    bounds.x + bounds.width <= viewport.width &&
    bounds.y < viewport.height &&
    bounds.y + bounds.height > 0
  )
}
