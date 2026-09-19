import type { Page } from "@playwright/test"

export async function openApp(page: Page, language = process.env.REDPACT_UI_LANGUAGE) {
  if (!language) {
    throw new Error("REDPACT_UI_LANGUAGE must be set by the Playwright target")
  }
  await page.addInitScript((value) => {
    localStorage.setItem("redpact:language", value)
  }, language)
  await page.goto("/")
}
