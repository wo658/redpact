import { fileURLToPath } from "node:url"
import { expect, test } from "vitest"
import { createSettingsService } from "../src/adapters/settings/json.js"

test("the repository root uses its own self-E2E environment instead of Order Desk", async () => {
  const reader = createSettingsService(fileURLToPath(new URL("../../../", import.meta.url)))
  const catalog = await reader.read()
  expect(catalog.valid, JSON.stringify(catalog.issues)).toBe(true)
  expect(catalog.settings?.composeFiles).toEqual(["e2e/compose.yaml"])
  expect(catalog.settings?.dependencies).toEqual({})
  expect(catalog.settings?.tests.directory).toBe("e2e/tests")
  const selected = await reader.read({ services: ["app"], select: {} })
  expect(selected.valid, JSON.stringify(selected.issues)).toBe(true)
  expect(selected.plan?.activeServices).toEqual(catalog.settings?.services)
})

for (const relative of ["../../../examples/order-desk/"]) {
  test(`repository example settings support every declared selection: ${relative}`, async () => {
    const reader = createSettingsService(fileURLToPath(new URL(relative, import.meta.url)))
    const catalog = await reader.read()
    expect(catalog.valid, JSON.stringify(catalog.issues)).toBe(true)
    expect(Object.keys(catalog.settings?.dependencies ?? {})).toEqual(["payments"])
    expect(Object.keys(catalog.settings?.applicationServices ?? {})).toHaveLength(5)
    expect(catalog.settings?.tests.env.APP_URL).toEqual({
      service: "app",
      port: 3000,
      scheme: "http",
    })
    expect(catalog.plan?.activeServices).toEqual(["app"])
    expect(catalog.plan?.bindings.app.PAYMENTS_MODE).toEqual({ value: "mock" })
  })
}
