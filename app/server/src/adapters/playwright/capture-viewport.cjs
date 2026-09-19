const { writeFile } = require("node:fs/promises")
const { chromium } = require("@playwright/test")
const { annotate } = require("./viewport.cjs")

// This adapter is pinned to the runner's Playwright 1.63.0 client factories.
const factories = chromium._connection._objectFactories
for (const name of ["Page", "ElementHandle"]) {
  const create = factories.get(name)
  if (typeof create !== "function") {
    throw new Error(`Unsupported Playwright screenshot adapter: ${name}`)
  }
  factories.set(name, (...args) => {
    const instance = create(...args)
    const screenshot = instance.screenshot
    instance.screenshot = async function (options = {}) {
      const page = name === "Page" ? this : (await this.ownerFrame())?.page()
      const viewport =
        page?.viewportSize() ??
        (await page?.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })))
      const captured = await screenshot.call(this, options)
      const after = page?.viewportSize() ?? viewport
      // Concurrent viewport changes cannot be attributed to one capture reliably.
      const stable = after?.width === viewport?.width && after?.height === viewport?.height
      const buffer = annotate(captured, stable ? viewport : undefined)
      if (options.path) {
        await writeFile(options.path, buffer)
      }
      return buffer
    }
    return instance
  })
}
