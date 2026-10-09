import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { access, cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { chromium } from "playwright"

async function freePort() {
  const server = createServer()
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}
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
const output = new URL(`../dist/redpact-evidence/${manager}/`, import.meta.url)
await mkdir(output, { recursive: true })
await mkdir(join(root, "project"))
await writeFile(
  join(root, "project", "README.md"),
  "# Sidebar viewer fixture\nFull viewer source inspection.\n",
)
let preview
let startedPid
let browser
let logs = ""
async function startPreview() {
  preview = spawn(process.execPath, ["preview.mjs", "--redpact"], {
    cwd: new URL("..", import.meta.url),
    env: {
      PATH: "/usr/bin:/bin",
      REDPACT_PREVIEW_PLUGIN_ROOT: pluginRoot,
      PORT: String(hostPort),
      REDPACT_APP_PORT: String(runtimePort),
      REDPACT_APP_DATA_DIR: join(root, "data"),
      REDPACT_APP_INSTALL_DIR: join(root, "packages"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
  preview.stdout.on("data", (data) => {
    logs += data
  })
  preview.stderr.on("data", (data) => {
    logs += data
  })
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin)).ok) {
        return
      }
    } catch {}
    if (preview.exitCode !== null) {
      throw new Error(logs)
    }
    await delay(100)
  }
  throw new Error(`미리보기 시작 실패: ${logs}`)
}
async function stopPreview() {
  if (preview && preview.exitCode === null) {
    const ended = once(preview, "exit")
    preview.kill("SIGTERM")
    await ended
  }
}
async function snapshotMeta() {
  const response = await fetch(`${origin}/tool`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "get_redpact_page", arguments: {} }),
  })
  return (await response.json())._meta
}
async function snapshot() {
  return (await snapshotMeta()).page
}
try {
  await startPreview()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const pageErrors = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") {
      console.error(message.text())
    }
  })
  const eventFailures = []
  await page.addInitScript(() => {
    window.cspViolations = []
    document.addEventListener("securitypolicyviolation", (event) =>
      window.cspViolations.push(event.violatedDirective),
    )
  })
  page.on("response", (response) => {
    if (response.url().includes("/api/events") && response.status() >= 400) {
      eventFailures.push(new URL(response.url()).search)
    }
  })
  await page.goto(origin)
  const app = page.frameLocator("iframe")
  await app.getByRole("heading", { name: "Welcome to Redpact", exact: true }).waitFor()
  assert.equal(
    await app.locator("#runtime-message").isVisible(),
    false,
    "정상 설치 화면에는 부가 설명을 표시하지 않아야 한다",
  )
  await assert.rejects(
    fetch(`${runtimeOrigin}/api/health`),
    "페이지 열기만으로 서버를 실행하면 안 된다",
  )
  await page.screenshot({ path: new URL("1280-missing.png", output).pathname, fullPage: true })
  await assert.rejects(
    access(join(pluginRoot, "runtime")),
    "플러그인에 Redpact 런타임을 미리 넣지 않아야 한다",
  )
  assert.equal(
    (await snapshot()).status.installation.state,
    "missing",
    "설치되지 않은 상태를 감지해야 한다",
  )
  assert.equal(
    await app.getByRole("button", { name: "Start Redpact", exact: true }).isVisible(),
    false,
    "설치 전에는 실행할 수 없는 시작 버튼을 숨겨야 한다",
  )
  for (const width of [640, 390]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(
      await app.locator("body").evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      "설치 화면이 반폭과 모바일에서 넘치지 않아야 한다",
    )
    await page.screenshot({
      path: new URL(`${width}-missing.png`, output).pathname,
      fullPage: true,
    })
  }
  await page.getByRole("button", { name: "Dark theme" }).click()
  await app.locator('#setup[data-theme="dark"]').waitFor()
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.screenshot({
      path: new URL(`${width}-missing-dark.png`, output).pathname,
      fullPage: true,
    })
  }
  await page.reload()
  await app.getByRole("heading", { name: "Welcome to Redpact", exact: true }).waitFor()
  await page.setViewportSize({ width: 1280, height: 900 })
  await app.getByText("Installation options", { exact: true }).click()
  await app.getByLabel("Package manager", { exact: true }).selectOption(manager)
  await app.getByRole("button", { name: "Install Redpact", exact: true }).click()
  await app.locator("#installation").waitFor({ state: "hidden", timeout: 240000 })
  await app.getByRole("heading", { name: "Redpact is ready", exact: true }).waitFor()
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(
      await app.getByRole("button", { name: "Stop Redpact", exact: true }).isVisible(),
      false,
      "중지 상태에는 중지 버튼을 숨겨야 한다",
    )
    await page.screenshot({ path: new URL(`${width}-ready.png`, output).pathname, fullPage: true })
  }
  await page.getByRole("button", { name: "Dark theme" }).click()
  await app.locator('#setup[data-theme="dark"]').waitFor()
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(
      await app.locator("#runtime-message").isVisible(),
      false,
      "정상 시작 화면에도 부가 설명을 표시하지 않아야 한다",
    )
    await page.screenshot({
      path: new URL(`${width}-ready-dark.png`, output).pathname,
      fullPage: true,
    })
  }
  await page.setViewportSize({ width: 1280, height: 900 })
  const installed = (await snapshot()).status.installation
  assert.equal(installed.state, "installed", "실제 패키지 설치 완료가 확인되어야 한다")
  assert.equal(installed.manager, manager, "사용자가 선택한 패키지 매니저로 설치되어야 한다")
  await app.getByRole("button", { name: "Start Redpact", exact: true }).click()
  await app.locator("body[data-running=true]").waitFor({ timeout: 60000 })
  const globalEvents = await fetch(`${runtimeOrigin}/api/events`, {
    signal: AbortSignal.timeout(5000),
  })
  assert.equal(globalEvents.status, 200, "설치 런타임의 전체 프로젝트 이벤트 API를 확인해야 한다")
  await globalEvents.body.cancel()
  const state = await snapshot()
  startedPid = state.status.startedPid
  assert.ok(Number.isInteger(startedPid), "이번 테스트가 시작한 서버 PID를 확인해야 한다")
  assert.equal((await (await fetch(`${runtimeOrigin}/api/health`)).json()).status, "ok")
  const viewer = app
  await viewer.getByRole("button", { name: "Open project folder", exact: true }).waitFor()
  assert.equal(
    await app.locator("#setup header").isVisible(),
    false,
    "실행 중에는 기존 Desktop/Web에 없는 플러그인 상단바를 표시하면 안 된다",
  )
  // 운영체제 폴더 선택만 대체하고 프로젝트 연결과 이후 조회는 실제 런타임을 사용한다.
  await page.route("**/tool", (route) => {
    const request = route.request().postDataJSON()
    if (
      request.name === "redpact_viewer_request" &&
      request.arguments.path === "/api/dialogs/directory"
    ) {
      return route.fulfill({
        json: {
          content: [],
          _meta: {
            response: {
              status: 200,
              contentType: "application/json",
              body: Buffer.from(JSON.stringify({ path: join(root, "project") })).toString("base64"),
            },
          },
        },
      })
    }
    return route.continue()
  })
  await viewer.getByRole("button", { name: "Open project folder", exact: true }).click()
  await viewer.getByRole("button", { name: "File Viewer", exact: true }).waitFor()
  await page.unroute("**/tool")
  assert.equal((await snapshot()).runs.length, 0, "연결만으로 테스트를 실행하면 안 된다")
  await viewer.getByRole("button", { name: "File Viewer", exact: true }).click()
  await viewer.getByRole("treeitem", { name: /README.md/ }).click()
  await viewer.getByText("Full viewer source inspection.", { exact: false }).waitFor()
  const connectedProject = (await (await fetch(`${runtimeOrigin}/api/projects`)).json())[0]
  const renamed = await fetch(`${runtimeOrigin}/api/projects/${connectedProject.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Renamed project" }),
  })
  assert.equal(renamed.ok, true, "외부 변경을 실제 API로 기록해야 한다")
  await viewer
    .getByRole("button", { name: "Renamed project", exact: true })
    .waitFor({ timeout: 15000 })
  assert.equal(
    await app.locator("iframe").count(),
    0,
    "CSP가 차단하는 중첩 iframe을 사용하면 안 된다",
  )
  for (const width of [1280, 640, 390]) {
    await page.setViewportSize({ width, height: 900 })
    assert.deepEqual(
      await app.locator("#root").evaluate((frame) => {
        const rect = frame.getBoundingClientRect()
        return [rect.x, rect.y, rect.width, rect.height]
      }),
      await app.locator("body").evaluate(() => [0, 0, innerWidth, innerHeight]),
      "기존 메인 화면이 앱의 전체 영역을 사용해야 한다",
    )
    assert.equal(
      await viewer
        .locator("body")
        .evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      "뷰어는 전체·반폭·모바일에서 가로 넘침이 없어야 한다",
    )
    if (width < 768) {
      await viewer.getByRole("button", { name: "Toggle Sidebar", exact: true }).first().click()
    }
    await viewer.getByRole("button", { name: "Tests", exact: true }).click()
    if (width < 768) {
      await viewer.locator('[data-mobile="true"]').waitFor({ state: "hidden" })
    }
    await viewer.getByRole("tab", { name: "Unit", exact: true }).waitFor()
    await viewer.getByRole("tab", { name: "Integration", exact: true }).click()
    await viewer.getByRole("tab", { name: "Playwright", exact: true }).click()
    if (width < 768) {
      await viewer.getByRole("button", { name: "Toggle Sidebar", exact: true }).first().click()
    }
    await viewer.getByRole("button", { name: "Settings", exact: true }).click()
    if (width < 768) {
      await viewer.locator('[data-mobile="true"]').waitFor({ state: "hidden" })
    }
    await viewer.getByRole("heading", { name: "Settings", exact: true }).waitFor()
    await page.screenshot({
      path: new URL(`${width}-connected.png`, output).pathname,
      fullPage: true,
    })
  }
  await page.emulateMedia({ colorScheme: "dark" })
  await page.getByRole("button", { name: "Dark theme" }).click()
  await app.locator('html[data-theme="dark"]').waitFor()
  await page.screenshot({ path: new URL("390-dark.png", output).pathname, fullPage: true })
  await page.route("**/tool", (route) => route.fulfill({ status: 503, body: "unavailable" }))
  await app.getByText("Refresh failed · showing previous data", { exact: true }).waitFor()
  await page.unroute("**/tool")
  await app.getByRole("button", { name: "Open local viewer" }).click()
  await page.waitForFunction(
    (expected) => document.body.dataset.lastLink === expected,
    runtimeOrigin,
  )
  await app.getByRole("button", { name: "Refresh", exact: true }).click()
  await app.locator("#setup header").waitFor({ state: "hidden" })
  assert.deepEqual(eventFailures, [], "실제 뷰어의 SSE 요청에 오류가 없어야 한다")
  assert.deepEqual(pageErrors, [], "메인 화면 초기화와 탐색에 JavaScript 오류가 없어야 한다")
  assert.deepEqual(
    await app.locator("body").evaluate(() => window.cspViolations),
    [],
    "네트워크와 iframe 금지 CSP를 위반하면 안 된다",
  )
  const meta = await snapshotMeta()
  const stopped = await fetch(origin + "/tool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "stop_redpact_server", arguments: { token: meta.controlToken } }),
  })
  assert.equal((await stopped.json()).isError ?? false, false, "MCP 중지 동작이 성공해야 한다")
  await app.getByRole("heading", { name: "Redpact is ready", exact: true }).waitFor()
  await assert.rejects(fetch(`${runtimeOrigin}/api/health`), "중지 후 실제 서버 포트가 닫혀야 한다")
  await page.setViewportSize({ width: 640, height: 900 })
  await page.screenshot({ path: new URL("640-stopped.png", output).pathname, fullPage: true })
  await app.getByRole("button", { name: "Start Redpact", exact: true }).click()
  await app.locator("body[data-running=true]").waitFor()
  const restarted = await snapshot()
  assert.notEqual(restarted.status.startedPid, startedPid, "새 프로세스로 다시 시작해야 한다")
  assert.equal(restarted.projects.length, 1, "중지 후 다시 시작해도 실제 프로젝트가 남아야 한다")
  const viewerResponse = await fetch(runtimeOrigin)
  assert.equal(viewerResponse.status, 200, "뷰어도 플러그인 배포본에 포함되어야 한다")
  assert.match(await viewerResponse.text(), /<html/, "포트가 실제 웹 뷰어를 제공해야 한다")
  await stopPreview()
  await assert.rejects(
    fetch(`${runtimeOrigin}/api/health`),
    "소유 MCP 종료 시 서버도 정리되어야 한다",
  )
  await startPreview()
  await page.reload()
  await app.locator("body[data-running=true]").waitFor()
  assert.equal((await snapshot()).projects.length, 1, "MCP 재연결 후 저장된 프로젝트를 읽어야 한다")
  console.log(
    `PASS ${manager} 공개 패키지 설치 · 기존 Redpact 없음 · 시작/중지/재시작 · 뷰어 · MCP 종료 정리 · 데이터 유지`,
  )
} finally {
  if (browser) {
    await browser.close()
  }
  await stopPreview()
  try {
    await cp(join(root, "data/app-start.log"), new URL(`${manager}-runtime.log`, output))
    await cp(join(root, "packages/install.log"), new URL(`${manager}-install.log`, output))
  } catch {}
  await rm(root, { recursive: true, force: true })
}
