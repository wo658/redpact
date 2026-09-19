import { expect, test } from "vitest"
import { createApp } from "../src/app.js"
import type { Services } from "../src/workflows/services.js"

test("project secret writes return availability without echoing user input", async () => {
  const calls: unknown[] = []
  const app = createApp({
    projectSecrets: {
      list: async () => [{ name: "CLOUD_KEY", configured: false }],
      set: async (...args: unknown[]) => {
        calls.push(args)
        return { name: "CLOUD_KEY", configured: true }
      },
    },
  } as unknown as Services)
  const response = await app.request("http://localhost/api/projects/project/secrets/CLOUD_KEY", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "private-test-key" }),
  })
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ name: "CLOUD_KEY", configured: true })
  expect(calls).toEqual([["project", "CLOUD_KEY", "private-test-key"]])
})
