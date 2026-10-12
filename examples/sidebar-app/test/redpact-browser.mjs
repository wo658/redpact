import assert from "node:assert/strict"
import { fork, spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { once } from "node:events"
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { chromium } from "playwright"

async function freePort() {
  const server = createServer()
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}
const installed = process.env.REDPACT_TEST_RUNTIME === "installed"
const manager = process.env.REDPACT_TEST_MANAGER ?? "pnpm"
assert.ok(["npm", "pnpm"].includes(manager))
const root = await mkdtemp(join(tmpdir(), "redpact-app-browser-"))
const pluginRoot = join(root, "plugin")
await cp(new URL("../dist/redpact-marketplace/plugins/redpact-app/", import.meta.url), pluginRoot, {
  recursive: true,
  verbatimSymlinks: true,
})
const runtimePort = await freePort()
const hostPort = await freePort()
const origin = `http://127.0.0.1:${hostPort}`
const runtimeOrigin = `http://127.0.0.1:${runtimePort}`
const output = new URL(
  `../dist/redpact-evidence/${installed ? manager : "source"}/`,
  import.meta.url,
)
await mkdir(output, { recursive: true })
const dataDir = join(root, "data")
await mkdir(dataDir)
const children = []
let preview
let browser
let client
let logs = ""
function capture(child) {
  children.push(child)
  child.stdout?.on("data", (data) => {
    logs += data
  })
  child.stderr?.on("data", (data) => {
    logs += data
  })
  return child
}
async function healthy(url) {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(url)).ok) {
        return
      }
    } catch {}
    await delay(100)
  }
  throw new Error(`로컬 서버 준비 실패: ${logs}`)
}
async function startPreview() {
  preview = capture(
    spawn(process.execPath, ["preview.mjs"], {
      cwd: new URL("..", import.meta.url),
      env: {
        PATH: "/usr/bin:/bin",
        REDPACT_PREVIEW_PLUGIN_ROOT: pluginRoot,
        PORT: String(hostPort),
        REDPACT_APP_PORT: String(runtimePort),
        REDPACT_APP_DATA_DIR: dataDir,
        REDPACT_APP_INSTALL_DIR: join(root, "packages"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    }),
  )
  await healthy(origin)
}
async function stop(child) {
  if (!child || child.exitCode !== null) {
    return
  }
  const ended = once(child, "exit")
  if (child.connected) {
    child.send({ runtimeControl: "shutdown" })
  } else {
    child.kill("SIGTERM")
  }
  await ended
}
async function appTool(name, args = {}) {
  const response = await fetch(`${origin}/tool`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, arguments: args }),
  })
  assert.equal(response.ok, true)
  const result = await response.json()
  assert.equal(result.isError ?? false, false)
  return result._meta
}
async function sourceRequest() {
  const project = join(root, "project")
  await mkdir(join(project, ".redpact"), { recursive: true })
  await writeFile(
    join(project, ".redpact/settings.json"),
    JSON.stringify({
      unitTests: {
        dockerfile: "unit.Dockerfile",
        cwd: ".",
        command: "echo native-review",
        patterns: ["test/*.test.ts"],
      },
    }),
  )
  await writeFile(
    join(project, "unit.Dockerfile"),
    "FROM node:24-slim\nWORKDIR /workspace\nCOPY . .\n",
  )
  await writeFile(join(dataDir, "settings.json"), JSON.stringify({ approval: "ask" }))
  const entry =
    process.env.REDPACT_TEST_RUNTIME_ENTRY ??
    fileURLToPath(new URL("../../../app/server/dist/main.js", import.meta.url))
  if (!process.env.REDPACT_TEST_RUNTIME_ENTRY) {
    // 소스 빌드에서는 패키징 전이므로 독립 뷰어의 실제 빌드 산출물을 배치한다.
    await cp(
      new URL("../../../app/web/dist/", import.meta.url),
      new URL("../../../app/server/dist/ui/", import.meta.url),
      { recursive: true },
    )
  }
  capture(
    fork(entry, ["--port", String(runtimePort), "--data-dir", dataDir], {
      execArgv: [],
      env: { ...process.env, REDPACT_RUNTIME_SUPERVISED: "1" },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    }),
  )
  await healthy(`${runtimeOrigin}/api/health`)
  client = new Client({ name: "native-review-smoke", version: "1" })
  await client.connect(new StreamableHTTPClientTransport(new URL(`${runtimeOrigin}/mcp`)))
  const result = await client.callTool({ name: "run_unit_tests", arguments: { path: project } })
  assert.equal(result.isError ?? false, false, JSON.stringify(result.content))
  const request = result.structuredContent
  assert.equal(request.state, "awaiting_approval", "실제 MCP 요청은 실행 전 승인 대기여야 한다")
  return request.id
}
async function captures(page, app, state) {
  for (const width of [1280, 640, 390]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(
      await app.locator("body").evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      "전체·반폭·모바일에서 가로 넘침이 없어야 한다",
    )
    await page.screenshot({
      path: new URL(`${width}-${state}.png`, output).pathname,
      fullPage: true,
    })
  }
}
async function recordedImages(page, requestId) {
  const context = await (
    await fetch(`${runtimeOrigin}/api/review-context?kind=unit&id=${requestId}`)
  ).json()
  const id = randomUUID()
  const directory = join(dataDir, "playwright-runs", id, "after")
  await mkdir(directory, { recursive: true })
  await page.setViewportSize({ width: 1920, height: 1080 })
  const png = await page.screenshot()
  const artifacts = []
  for (const [name, bytes] of [
    ["기억 설정 캡처", png],
    ["호칭 정정 결과 캡처", png],
    ["손상된 캡처", Buffer.from("invalid PNG")],
    ["누락된 캡처", png],
  ]) {
    const artifactId = randomUUID()
    if (name !== "누락된 캡처") {
      await writeFile(join(directory, artifactId), bytes)
    }
    artifacts.push({
      id: artifactId,
      name,
      contentType: "image/png",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      viewport: { width: 1920, height: 1080 },
    })
  }
  const now = new Date().toISOString()
  // 과거 기록 fixture는 실제 서버·MCP·뷰어 전달을 검사하며 새 실행 증거가 아니다.
  await writeFile(
    join(dataDir, "playwright-runs", `${id}.json`),
    JSON.stringify({
      version: 1,
      id,
      target: "captures",
      purpose: "capture",
      scope: "project",
      worktreeId: context.worktreeId,
      projectId: context.projectId,
      projectRoot: context.path,
      revision: null,
      settings: {
        directory: "ui-tests",
        service: "app",
        port: 3000,
        viewport: { width: 1920, height: 1080 },
        targets: { captures: { purpose: "capture", testMatch: ["captures/*.ts"] } },
      },
      selection: { services: ["app"], select: {} },
      settingsDigest: "fixture",
      sourceDigest: "fixture",
      appDigest: "fixture",
      createdAt: now,
      finishedAt: now,
      state: "finished",
      outcome: "passed",
      before: { state: "unavailable", cases: [] },
      after: {
        state: "finished",
        cases: [
          {
            id: "recorded",
            file: "captures/memory.ts",
            title: "저장된 캡처 이미지",
            status: "passed",
            duration: 10,
            errors: [],
            steps: [],
            artifacts,
          },
        ],
      },
    }),
  )
  return { id, png }
}
try {
  const id = installed ? undefined : await sourceRequest()
  await startPreview()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.addInitScript(() => {
    window.localStorage.setItem("redpact:theme", "dark")
    window.cspViolations = []
    document.addEventListener("securitypolicyviolation", (event) =>
      window.cspViolations.push(event.violatedDirective),
    )
  })
  await page.goto(origin)
  const app = page.frameLocator("iframe")
  if (installed) {
    await app.getByRole("heading", { name: "Welcome to Redpact", exact: true }).waitFor()
    await captures(page, app, "missing")
    await assert.rejects(fetch(`${runtimeOrigin}/api/health`), "설치 전 서버를 실행하면 안 된다")
    await app.getByText("Installation options", { exact: true }).click()
    await app.getByLabel("Package manager", { exact: true }).selectOption(manager)
    await app.getByRole("button", { name: "Install Redpact", exact: true }).click()
    await app
      .getByRole("heading", { name: "Redpact is ready", exact: true })
      .waitFor({ timeout: 240000 })
    const state = (await appTool("get_redpact_page")).page
    assert.equal(state.status.installation.state, "installed")
    assert.equal(state.status.installation.manager, manager)
    await captures(page, app, "ready")
    await stop(preview)
    await startPreview()
    await page.reload()
    await app.getByRole("button", { name: "Start Redpact", exact: true }).waitFor()
    assert.equal(
      (await appTool("get_redpact_page")).page.status.state,
      "stopped",
      "새 MCP 세션도 설치된 런타임을 자동 시작하지 않아야 한다",
    )
    await assert.rejects(fetch(`${runtimeOrigin}/api/health`))

    await app.getByRole("button", { name: "Start Redpact", exact: true }).click()
    await app.locator("body[data-running=true]").waitFor({ timeout: 60000 })
    const first = await appTool("get_redpact_page")
    assert.equal(first.page.status.owned, true)
    await appTool("stop_redpact_server", { token: first.controlToken })
    await app.getByRole("heading", { name: "Redpact is ready", exact: true }).waitFor()
    await assert.rejects(fetch(`${runtimeOrigin}/api/health`))
    await app.getByRole("button", { name: "Start Redpact", exact: true }).click()
    await app.locator("body[data-running=true]").waitFor()
    assert.notEqual(
      (await appTool("get_redpact_page")).page.status.startedPid,
      first.page.status.startedPid,
    )
    await stop(preview)
    await assert.rejects(
      fetch(`${runtimeOrigin}/api/health`),
      "소유 MCP 종료는 런타임을 정리해야 한다",
    )
  } else {
    await app.getByRole("heading", { name: "Open an execution from chat", exact: true }).waitFor()
    assert.equal(
      await app.locator("html").evaluate((element) => element.classList.contains("dark")),
      false,
      "App 첫 표시는 저장된 독립 뷰어 선호보다 호스트의 밝은 테마를 따라야 한다",
    )
    for (const name of ["Settings", "Tools", "Open project folder", "Current work"]) {
      assert.equal(await app.getByRole("button", { name, exact: true }).count(), 0)
    }
    await captures(page, app, "empty")
    await page.goto(`${origin}/?kind=unit&id=${id}`)
    await app.getByRole("button", { name: "Approve execution", exact: true }).waitFor()
    await app
      .getByLabel("Requested execution")
      .getByText("echo native-review", { exact: true })
      .waitFor()
    const context = await (
      await fetch(`${runtimeOrigin}/api/review-context?kind=unit&id=${id}`)
    ).json()
    assert.equal(context.executionId, null, "기록 열기는 사람의 실행 승인이 아니다")
    assert.equal(context.state, "pending")
    await captures(page, app, "request")
    await page.getByRole("button", { name: "Dark theme" }).click()
    await app.locator('html[data-theme="dark"]').waitFor()
    assert.equal(
      await app.locator("html").evaluate((element) => element.classList.contains("dark")),
      true,
      "호스트 어두운 테마는 실제 뷰어 CSS에 적용되어야 한다",
    )
    assert.equal(
      await app.locator("html").evaluate((element) => getComputedStyle(element).colorScheme),
      "dark",
    )
    await captures(page, app, "request-dark")
    await app.getByRole("link", { name: "Execution history", exact: true }).click()
    await app.getByRole("heading", { name: "Execution history", exact: true }).waitFor()
    await page.reload()
    await app.getByRole("button", { name: "Approve execution", exact: true }).waitFor()
    await app.getByRole("button", { name: "Cancel request", exact: true }).click()
    await app
      .getByRole("button", { name: "Approve execution", exact: true })
      .waitFor({ state: "hidden" })
    const cancelled = await (
      await fetch(`${runtimeOrigin}/api/review-context?kind=unit&id=${id}`)
    ).json()
    assert.equal(cancelled.state, "cancelled")
    assert.equal(cancelled.executionId, null)
    assert.equal(await app.locator("iframe").count(), 0)
    const capture = await recordedImages(page, id)
    await page.goto(`${origin}/?kind=playwright&id=${capture.id}`)
    for (const name of ["기억 설정 캡처", "호칭 정정 결과 캡처"]) {
      const image = app.getByRole("img", { name, exact: true })
      await image.waitFor()
      await image.evaluate((element) => element.decode().catch(() => {}))
      assert.equal(
        await image.evaluate((element) => element.naturalWidth),
        1920,
        "blob:을 허용하지 않는 임베드에서도 기록된 PNG가 실제로 디코딩되어야 한다",
      )
      assert.deepEqual(
        Buffer.from((await image.getAttribute("src")).split(",")[1], "base64"),
        capture.png,
        "이미지 변환은 캡처의 원본 바이트를 보존해야 한다",
      )
    }
    for (const name of ["손상된 캡처", "누락된 캡처"]) {
      await app.getByRole("alert").filter({ hasText: name }).waitFor()
      assert.equal(
        await app.getByRole("img", { name, exact: true }).count(),
        0,
        "실패한 이미지는 깨진 아이콘 대신 식별 가능한 오류를 표시해야 한다",
      )
    }
    await captures(page, app, "recorded-images")
    await app.getByRole("alert").last().scrollIntoViewIfNeeded()
    await page.screenshot({ path: new URL("390-image-errors.png", output).pathname })
    assert.deepEqual(await app.locator("body").evaluate(() => window.cspViolations), [])
    await page.goto(`${runtimeOrigin}/?page=review&kind=playwright&id=${capture.id}`)
    for (const name of ["기억 설정 캡처", "호칭 정정 결과 캡처"]) {
      const image = page.getByRole("img", { name, exact: true })
      await image.waitFor()
      await image.evaluate((element) => element.decode())
      assert.equal(
        await image.evaluate((element) => element.naturalWidth),
        1920,
        "독립 뷰어도 같은 원본 이미지를 직접 표시해야 한다",
      )
    }
    for (const name of ["손상된 캡처", "누락된 캡처"]) {
      await page.getByRole("alert").filter({ hasText: name }).waitFor()
    }
    await stop(preview)
    assert.equal(
      (await fetch(`${runtimeOrigin}/api/health`)).ok,
      true,
      "외부 소유 런타임은 MCP 종료로 중지하면 안 된다",
    )
  }
  assert.deepEqual(errors, [], "실제 App 초기화와 탐색에 JavaScript 오류가 없어야 한다")
  console.log(
    `PASS ${installed ? `${manager} 공개 설치·소유 수명주기` : "현재 소스·정확한 검토·이력·취소·승인 경계·반응형 화면"}`,
  )
} finally {
  await client?.close()
  await browser?.close()
  for (const child of children.reverse()) {
    await stop(child)
  }
  await writeFile(new URL("runtime.log", output), logs)
  try {
    await cp(join(root, "packages/install.log"), new URL("install.log", output))
  } catch {}
  await rm(root, { recursive: true, force: true })
}
