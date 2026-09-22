import { expect, test } from "vitest"
import { parseSettings } from "../src/adapters/settings/json.js"
import { planContainers } from "../src/core/container-plan.js"

const evidence = [{ path: "src/payment.ts", line: 12 }]
const topology = {
  composeFiles: ["compose.yaml"],
  services: ["app"],
  applicationServices: {
    web: { services: ["app"], description: "Customer application" },
    jobs: { services: ["worker"] },
  },
  dependencies: {
    database: { kind: "isolated", services: ["db", "auth"] },
    payments: { kind: "remote", env: { app: { API_URL: "https://example.com" } } },
  },
  relationships: [
    {
      from: "web",
      to: { kind: "application", name: "jobs" },
      description: "Dispatch jobs",
      evidence,
    },
    {
      from: "web",
      to: { kind: "dependency", name: "payments" },
      description: "Capture payments",
      evidence,
    },
  ],
}
const parse = (value: unknown) => parseSettings(JSON.stringify(value), "settings.json")

test.each(["container", "cloud", "sandbox", "custom", "self-hosted", "external"])(
  "rejects unsupported dependency mode %s",
  (mode) => {
    expect(parse({ dependencies: { payments: { modes: { [mode]: {} } } } }).valid).toBe(false)
  },
)

test("records multiple application services separately from assessed dependency modes", () => {
  const result = parse(topology)
  expect(result.valid).toBe(true)
  expect(result.settings).toMatchObject(topology)
})

test.each([
  { modes: { isolated: {} } },
  { modes: { remote: { services: ["payment"] } } },
  {
    modes: { mock: {} },
    assessments: { mock: { status: "implementation-needed", reason: "Missing", evidence } },
  },
  { modes: {}, recommendation: { mode: "mock", reason: "Use mock" } },
])("rejects contradictory mode declarations %#", (payments) => {
  expect(parse({ dependencies: { payments } }).valid).toBe(false)
})

test("평가와 권장만으로 실행 가능한 의존성을 선언할 수 없다", () => {
  expect(
    parse({
      dependencies: {
        payments: {
          assessments: {
            mock: { status: "implementation-needed", reason: "Add adapter", evidence },
          },
        },
      },
    }).valid,
  ).toBe(false)
})

test.each([
  { ...topology, relationships: [{ ...topology.relationships[0], from: "missing" }] },
  {
    ...topology,
    relationships: [{ ...topology.relationships[1], to: { kind: "dependency", name: "missing" } }],
  },
  { ...topology, relationships: [{ ...topology.relationships[0], evidence: [] }] },
  {
    ...topology,
    relationships: [{ ...topology.relationships[0], evidence: [{ path: "../secret" }] }],
  },
  { ...topology, relationships: [topology.relationships[0], topology.relationships[0]] },
  {
    ...topology,
    applicationServices: { web: { services: ["app"] }, other: { services: ["app"] } },
  },
  {
    ...topology,
    applicationServices: { web: { services: ["db"] }, jobs: { services: ["worker"] } },
  },
])("rejects dangling or ambiguous topology %#", (value) => {
  expect(parse(value).valid).toBe(false)
})

test("topology checks Compose references without activating app or dependency services", () => {
  const result = parse(topology)
  expect(result.valid).toBe(true)
  const model = {
    services: {
      app: { image: "app" },
      worker: { image: "worker" },
      db: { image: "db" },
      auth: { image: "auth" },
    },
  }
  const selection = { services: ["app"], select: { database: "isolated", payments: "remote" } }
  if (!result.settings) {
    throw new Error("Expected parsed settings")
  }
  const planned = planContainers(result.settings, model, selection)
  expect(planned.issues).toEqual([])
  expect(planned.plan?.activeServices).toEqual(["app", "auth", "db"])
  expect(
    planContainers(result.settings, {
      services: { app: model.services.app, db: model.services.db, auth: model.services.auth },
    }).issues,
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path: "applicationServices.jobs.services",
        code: "unknown_reference",
      }),
    ]),
  )
})
