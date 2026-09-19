import { test as base } from "vitest"
import { connection } from "./connections.js"

export const test = base.extend({
  // biome-ignore lint/correctness/noEmptyPattern: Vitest requires destructuring to discover fixture dependencies.
  api: async ({}, use) => {
    const { host, port } = connection("app", 3000)
    const hostname = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host
    const url = new URL(`http://${hostname}:${port}`)
    await use({ checkout: () => fetch(new URL("/checkout", url), { method: "POST" }) })
  },
})
export { expect } from "vitest"
