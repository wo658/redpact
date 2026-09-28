import { expect, test } from "vitest"
import { createApp } from "../src/app.js"

test("별도 secret 조회·저장 HTTP API는 제거된다", async () => {
  const app = createApp({} as never)
  for (const path of ["/api/projects/project/secrets", "/api/projects/project/secrets/TOKEN"]) {
    expect((await app.request(path)).status).toBe(404)
    expect(
      (
        await app.request(path, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: "plain" }),
        })
      ).status,
    ).toBe(404)
  }
})
