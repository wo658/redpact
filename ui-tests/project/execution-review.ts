import { randomUUID } from "node:crypto"
import { expect, type Page } from "@playwright/test"
import { http, node } from "./target"

async function createExecutionReview() {
  const root = `/tmp/redpact-approval-${randomUUID()}`
  await node(
    `
    import { mkdirSync, writeFileSync } from 'node:fs';
    const root = JSON.parse(process.argv[1]);
    mkdirSync(root+'/.redpact', {recursive:true});
    mkdirSync(root+'/unit');
    writeFileSync(root+'/Dockerfile', 'FROM alpine:3.21\\nWORKDIR /workspace\\nCOPY . .\\n');
    writeFileSync(root+'/unit/example.test.ts', 'export const reviewed = true');
    writeFileSync(root+'/.redpact/settings.json', JSON.stringify({unitTests:{dockerfile:'Dockerfile',command:'echo reviewed-command',patterns:['unit/*.test.ts']}}));
    console.log('null');
  `,
    root,
  )
  const original = await http<{ policy: "auto" | "ask" }>("/api/approval-policy")
  expect((await http("/api/approval-policy", "POST", { policy: "ask" })).status).toBe(200)
  let counter = 0
  async function rpc(method: string, params: object) {
    const response = await node<{ status: number; body: { result: any; error?: unknown } }>(
      `
      const response = await fetch('http://127.0.0.1:54318/mcp', {
        method: 'POST', headers: {'Content-Type':'application/json', Accept:'application/json, text/event-stream'},
        body: process.argv[1],
      });
      console.log(JSON.stringify({status:response.status, body:await response.json()}));
    `,
      { jsonrpc: "2.0", id: ++counter, method, params },
    )
    expect(response.status).toBe(200)
    expect(response.body.error).toBeUndefined()
    return response.body.result
  }
  const result = await rpc("tools/call", {
    name: "run_tests",
    arguments: { kind: "unit", path: root },
  })
  expect(result.isError).not.toBe(true)
  expect(result.structuredContent.state).toBe("awaiting_approval")
  const id = result.structuredContent.reviewId
  expect(result._meta).toBeUndefined()
  expect(result.structuredContent.reviewPath).toContain(`id=${id}`)
  const tools = await rpc("tools/list", {})
  expect(tools.tools.every((tool: { _meta?: { ui?: unknown } }) => !tool._meta?.ui)).toBe(true)
  return {
    reviewPath: result.structuredContent.reviewPath,
    id,
    root,
    rpc,
    async changeInputs() {
      await node(
        `import {appendFileSync} from 'node:fs'; appendFileSync(JSON.parse(process.argv[1])+'/unit/example.test.ts', '\\nexport const changed = true'); console.log('null');`,
        root,
      )
    },
    async restore() {
      expect((await http("/api/approval-policy", "POST", original.body)).status).toBe(200)
    },
  }
}

export async function openExecutionReviewViewer(page: Page) {
  const review = await createExecutionReview()
  try {
    const response = await review.rpc("tools/call", {
      name: "get_review_context",
      arguments: { kind: "unit", id: review.id },
    })
    expect(response.isError).not.toBe(true)
    const context = response.structuredContent
    expect(context.id).toBe(review.id)
    expect(context.approval.preview.command).toBe("echo reviewed-command")
    await page.addInitScript(() => localStorage.setItem("redpact:language", "en"))
    await page.goto(review.reviewPath)
    await expect(page.getByRole("heading", { name: context.intent, exact: true })).toBeVisible()
    await expect(page.getByText(review.id, { exact: true })).toBeVisible()
    return { ...review, context }
  } catch (error) {
    await review.restore()
    throw error
  }
}

export async function openIntegrationReviewViewer(page: Page) {
  const root = `/tmp/redpact-integration-approval-${randomUUID()}`
  await node(
    `
    import { mkdirSync, writeFileSync } from 'node:fs';
    const root = JSON.parse(process.argv[1]);
    mkdirSync(root+'/.redpact', {recursive:true});
    mkdirSync(root+'/integration');
    writeFileSync(root+'/compose.yaml', 'services:\\n  reviewed-app:\\n    image: alpine:3.21\\n');
    writeFileSync(root+'/integration/service.test.ts', 'import {test,expect} from "vitest"; test("검토한 서비스만 환경 승인의 대상이다", () => expect(true).toBe(true));');
    writeFileSync(root+'/.redpact/settings.json', JSON.stringify({composeFiles:['compose.yaml'],services:['reviewed-app']}));
    console.log('null');
  `,
    root,
  )
  const original = await http<{ policy: "auto" | "ask" }>("/api/approval-policy")
  expect((await http("/api/approval-policy", "POST", { policy: "ask" })).status).toBe(200)
  let id: string | undefined
  async function rpc(method: string, params: object) {
    const response = await node<{ status: number; body: { result: any; error?: unknown } }>(
      `
      const response = await fetch('http://127.0.0.1:54318/mcp', {
        method: 'POST', headers: {'Content-Type':'application/json', Accept:'application/json, text/event-stream'},
        body: process.argv[1],
      });
      console.log(JSON.stringify({status:response.status, body:await response.json()}));
    `,
      { jsonrpc: "2.0", id: 1, method, params },
    )
    expect(response.status).toBe(200)
    expect(response.body.error).toBeUndefined()
    return response.body.result
  }
  async function restore() {
    expect((await http("/api/approval-policy", "POST", original.body)).status).toBe(200)
  }
  try {
    const request = await rpc("tools/call", { name: "run_tests", arguments: { path: root } })
    expect(request.isError).not.toBe(true)
    expect(request.structuredContent.state).toBe("awaiting_approval")
    id = request.structuredContent.reviewId
    const result = await rpc("tools/call", {
      name: "get_review_context",
      arguments: { kind: "integration", id },
    })
    expect(result.isError).not.toBe(true)
    const context = result.structuredContent
    expect(context.approval.preview.services).toEqual(["reviewed-app"])
    expect(context.executionId).toBeNull()
    await page.addInitScript(() => localStorage.setItem("redpact:language", "en"))
    await page.goto(context.reviewPath)
    await expect(page.getByRole("heading", { name: context.intent, exact: true })).toBeVisible()
    return { id, root, context, rpc, restore }
  } catch (error) {
    await restore()
    throw error
  }
}
