import { expect, test } from "vitest"
import { defaultIntegrationSelection } from "../src/core/integration-defaults.js"
import { settingsSchema } from "../src/core/settings-schema.js"

test("automatic roots exclude services belonging to inactive dependency modes", () => {
  const settings = settingsSchema.parse({
    dependencies: {
      db: {
        modes: { mock: { env: { app: { DB_MODE: "mock" } } }, isolated: { services: ["db"] } },
      },
    },
  })
  expect(defaultIntegrationSelection(settings, ["app", "db", "worker"])).toEqual({
    services: ["app", "worker"],
    select: { db: "mock" },
  })
})
test("assessments and recommendations never become configured automatic modes", () => {
  const settings = settingsSchema.parse({
    dependencies: {
      api: {
        modes: { remote: {} },
        assessments: {
          mock: {
            status: "implementation-needed",
            reason: "Requires implementation",
            evidence: [{ path: "app.ts", line: 1 }],
          },
        },
        recommendation: { mode: "mock", reason: "Future implementation" },
      },
    },
  })
  expect(defaultIntegrationSelection(settings, ["app"]).select).toEqual({ api: "remote" })
})

test("default selection prefers mock, isolated, shared-local, then remote", () => {
  const modes: Record<string, object> = {
    remote: {},
    "shared-local": {},
    isolated: { services: ["db"] },
    mock: {},
  }
  for (const expected of ["mock", "isolated", "shared-local", "remote"]) {
    const settings = settingsSchema.parse({ dependencies: { database: { modes } } })
    expect(defaultIntegrationSelection(settings, ["app", "db"]).select).toEqual({
      database: expected,
    })
    delete modes[expected]
  }
})
