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
  const viewport = locator.page().viewportSize()
  if (viewport && viewport.width >= 768) {
    await locator.waitFor({ state: "attached" })
  }
  if (!(await locator.isVisible())) {
    return false
  }
  // Read desktop intent before its offcanvas transition settles.
  const sidebarState = await locator.evaluate((element) =>
    element.closest('[data-slot="sidebar"]')?.getAttribute("data-state"),
  )
  if (sidebarState) {
    return sidebarState === "expanded"
  }
  const bounds = await locator.boundingBox()
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
