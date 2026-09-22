import { runInNewContext } from "node:vm"
import SwaggerParser from "@apidevtools/swagger-parser"
import { describe, expect, test } from "vitest"
import { createApp } from "../src/app.js"
import { describeSettings } from "../src/core/settings.js"
import { settingsSpecificationResponse } from "../src/interfaces/http/docs/schemas.js"

const token = "docs-test-token-with-at-least-32-characters"
function documentedApp() {
  return createApp({
    worktrees: {},
    workStarts: {},
    environments: {},
    stopEnvironment: () => {},
  } as never)
}

describe("local API documentation", () => {
  test.each(["/redoc", "/docs", "/swagger"])(
    "%s opens without a token and uses local assets",
    async (path) => {
      const app = documentedApp()
      const response = await app.request(path)
      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toContain("text/html")
      const html = await response.text()
      expect(html).toContain("/openapi.json")
      expect(html).not.toContain(token)
      expect(html).not.toMatch(/(?:src|href)=["']https?:\/\//)
      const assets = [...html.matchAll(/(?:src|href)="(\/docs\/assets\/[^" ]+)"/g)].map(
        (match) => match[1],
      )
      expect(assets.length).toBeGreaterThan(0)
      for (const asset of assets) {
        const result = await app.request(asset)
        expect(result.status, asset).toBe(200)
        expect(result.headers.get("content-type")).toMatch(/javascript|css/)
        expect((await result.text()).length).toBeGreaterThan(50)
      }
    },
  )

  test("the generated specification covers exactly the mounted HTTP API", async () => {
    const app = documentedApp()
    const response = await app.request("/openapi.json")
    expect(response.status).toBe(200)
    const spec = await response.json()
    expect(spec.openapi).toBe("3.1.0")
    expect(spec.info.title).toBe("Redpact API")
    expect(spec.servers).toEqual([{ url: "/" }])
    expect(spec.security).toEqual([])
    const expected = [
      ...new Set(
        app.routes
          .filter((route) => route.path.startsWith("/api/") && route.method !== "ALL")
          .map(
            (route) => `${route.method.toLowerCase()} ${route.path.replace(/:([^/]+)/g, "{$1}")}`,
          ),
      ),
    ].sort()
    const actual = Object.entries(spec.paths)
      .flatMap(([path, methods]) =>
        Object.keys(methods as object).map((method) => `${method} ${path}`),
      )
      .sort()
    expect(actual).toEqual(expected)
    const operationIds = new Set<string>()
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const operation of Object.values(
        methods as Record<
          string,
          {
            operationId: string
            summary: string
            security: unknown
            parameters?: { in: string; name: string; required?: boolean }[]
            responses: object
          }
        >,
      )) {
        expect(operation.summary).toBeTruthy()
        expect(operationIds.has(operation.operationId)).toBe(false)
        operationIds.add(operation.operationId)
        expect(operation.security ?? spec.security).toEqual([])
        expect(operation.responses).toHaveProperty("403")
        for (const [, name] of path.matchAll(/\{([^}]+)\}/g)) {
          expect(operation.parameters).toContainEqual(
            expect.objectContaining({ name, in: "path", required: true }),
          )
        }
      }
    }
    const run = spec.paths["/api/runs"].post
    expect(run.requestBody.required).toBe(true)
    expect(run.requestBody.content["application/json"].schema.properties.submissionId.format).toBe(
      "uuid",
    )
    expect(run.requestBody.content["application/json"].schema.additionalProperties).toBe(false)
    expect(run.responses).toHaveProperty("202")
    expect(run.responses).toHaveProperty("422")
    expect(spec.paths["/api/environments"].get.parameters).toContainEqual(
      expect.objectContaining({ name: "worktreeId", in: "query", required: true }),
    )
    expect(JSON.stringify(spec)).not.toContain(token)
    await SwaggerParser.validate(spec, { resolve: { external: false } })
  })

  test("Fixed execution configuration and the specification are documented", async () => {
    expect(settingsSpecificationResponse.safeParse(describeSettings()).success).toBe(true)
    const spec = await (await documentedApp().request("/openapi.json")).json()
    const plan = spec.paths["/api/worktrees/{id}/dependencies/plan"].post
    expect(plan.summary).toBeTruthy()
    expect(plan.requestBody.content["application/json"].schema.properties).toEqual({})
    expect(plan.responses).toHaveProperty("422")
    expect(
      spec.paths["/api/worktrees/{id}/dependencies/{dependency}"].get.responses,
    ).toHaveProperty("404")
    expect(spec.paths["/api/environments"].post).toBeUndefined()
  })

  test("documentation keeps the local host/origin boundary and retains the token-free API and MCP local boundary", async () => {
    const app = documentedApp()
    for (const path of [
      "/openapi.json",
      "/redoc",
      "/swagger",
      "/docs/assets/redoc.standalone.js",
    ]) {
      expect((await app.request(`http://attacker.example${path}`)).status).toBe(403)
      expect(
        (await app.request(path, { headers: { Origin: "https://attacker.example" } })).status,
      ).toBe(403)
    }
    for (const path of ["/api/health", "/api/projects", "/api/runs", "/mcp"]) {
      expect(
        (await app.request(path, { headers: { "Sec-Fetch-Site": "cross-site" } })).status,
      ).toBe(403)
    }
    expect((await app.request("/api/health")).status).toBe(200)
  })

  test("both viewers initialize against the local specification without external services or token persistence", async () => {
    const app = documentedApp()
    let redocSpec = ""
    let redocOptions: Record<string, unknown> = {}
    const redocScript = await (await app.request("/docs/assets/redoc-init.js")).text()
    runInNewContext(redocScript, {
      Redoc: {
        init: (spec: string, options: Record<string, unknown>) => {
          redocSpec = spec
          redocOptions = options
        },
      },
      document: { getElementById: () => ({}) },
    })
    expect(redocSpec).toBe("/openapi.json")
    expect(redocOptions.disableGoogleFont).toBe(true)
    let swaggerOptions: Record<string, unknown> = {}
    const swaggerScript = await (await app.request("/docs/assets/swagger-init.js")).text()
    runInNewContext(swaggerScript, {
      SwaggerUIBundle: (options: Record<string, unknown>) => {
        swaggerOptions = options
      },
    })
    expect(swaggerOptions).toMatchObject({
      url: "/openapi.json",
      validatorUrl: null,
      persistAuthorization: false,
      queryConfigEnabled: false,
    })
    const csp = (await app.request("/redoc")).headers.get("content-security-policy")
    expect(csp).toContain("connect-src 'self'")
    expect(csp).toContain("script-src 'self'")
  })

  test("specification generation is isolated per app and excludes unavailable services", async () => {
    const full = await documentedApp().request("/openapi.json")
    expect(full.status).toBe(200)
    const small = await createApp({} as never).request("/openapi.json")
    expect(small.status).toBe(200)
    const spec = await small.json()
    expect(spec.paths).not.toHaveProperty("/api/projects")
    expect(spec.paths).not.toHaveProperty("/api/environments")
    expect(spec.paths).toHaveProperty("/api/health")
  })
})
