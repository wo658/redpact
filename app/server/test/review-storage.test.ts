import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { createReviewStore } from "../src/adapters/storage/reviews.js"

test("instance approval defaults to Auto, persists both directions and preserves unrelated settings", () => {
  const root = mkdtempSync(join(tmpdir(), "redpact-policy-"))
  const file = join(root, "settings.json")
  try {
    writeFileSync(
      file,
      JSON.stringify({
        server: { port: 1234 },
        projects: ["/project"],
      }),
    )
    const store = createReviewStore(root)
    expect(store.policy()).toBe("auto")
    store.setPolicy("ask")
    expect(createReviewStore(root).policy()).toBe("ask")
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
      server: { port: 1234 },
      projects: ["/project"],
      approval: "ask",
    })
    store.setPolicy("auto")
    expect(store.policy()).toBe("auto")
    writeFileSync(file, "broken")
    expect(() => store.policy()).toThrow()
    expect(() => store.setPolicy("auto")).toThrow()
    expect(readFileSync(file, "utf8")).toBe("broken")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
