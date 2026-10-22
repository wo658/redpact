import assert from "node:assert/strict"
import { once } from "node:events"
import { mkdir } from "node:fs/promises"
import { createServer } from "node:http"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { build } from "esbuild"
import { chromium } from "playwright"

const client = new Client({ name: "Test plan probe verification", version: "0.0.1" })
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [
      new URL(
        "../dist/test-plan-probe-marketplace/plugins/test-plan-probe/dist/server.mjs",
        import.meta.url,
      ).pathname,
    ],
  }),
)
const catalog = await client.listTools()
assert.deepEqual(
  catalog.tools.map((tool) => tool.name),
  ["open_test_plan_probe"],
  "검증 앱은 실행 도구를 노출하지 않아야 한다",
)
const uri = catalog.tools[0]._meta.ui.resourceUri
const resource = await client.readResource({ uri })
const appHtml = resource.contents[0].text
assert.equal(typeof appHtml, "string")
const opened = await client.callTool({ name: "open_test_plan_probe", arguments: {} })
assert.notEqual(opened.isError, true)
await client.close()
const host = await build({
  stdin: {
    contents: `
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
const frame = document.querySelector("iframe");
const bridge = new AppBridge(null, {name:"Probe harness",version:"1"}, {message:{},updateModelContext:{}}, {hostContext:{displayMode:"inline",theme:new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light"}});
bridge.onmessage = async (params) => {
  document.querySelector("#received").textContent = JSON.stringify(params);
  if (new URLSearchParams(location.search).has("reject")) { return {isError:true}; }
  return {};
};
bridge.onupdatemodelcontext = async () => ({});
await bridge.connect(new PostMessageTransport(frame.contentWindow, frame.contentWindow));
frame.src="/app.html";
`,
    resolveDir: new URL("../", import.meta.url).pathname,
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
})
const server = createServer((req, res) => {
  if (req.url === "/app.html") {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:;",
    )
    res.end(appHtml)
  } else if (req.url === "/host.js") {
    res.setHeader("Content-Type", "application/javascript")
    res.end(host.outputFiles[0].text)
  } else {
    res.end(
      '<!doctype html><iframe title="Test plan" style="width:100%;height:92vh;border:0"></iframe><pre id="received" hidden></pre><script type="module" src="/host.js"></script>',
    )
  }
})
server.listen(0, "127.0.0.1")
await once(server, "listening")
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
page.on("pageerror", (error) => console.error("Browser error:", error.message))
const output = new URL("../dist/test-plan-probe-evidence/", import.meta.url)
await mkdir(output, { recursive: true })
try {
  await page.goto(origin)
  const app = page.frameLocator("iframe")
  await app.getByRole("status").filter({ hasText: "Connected." }).waitFor()
  assert.equal(await app.getByRole("tab").count(), 3, "최상단 탭에서 세 종류를 선택해야 한다")
  assert.equal(
    await app.getByRole("textbox").count(),
    1,
    "선택한 종류의 자연어 계획만 표시해야 한다",
  )
  const revised = "중복 이메일이면 가입을 거부하고 기존 계정은 보존한다. 검증 문구: 수정됨-7291"
  await app.getByRole("textbox", { name: "Unit test 1", exact: true }).fill(revised)
  await app.getByRole("tab", { name: "Integration", exact: true }).click()
  await app.getByRole("button", { name: "Delete Integration test 1", exact: true }).click()
  await app.getByRole("button", { name: "Add Integration test", exact: true }).click()
  await app
    .getByRole("textbox", { name: "Integration test 1", exact: true })
    .fill("중복 가입 요청 후에도 저장된 계정은 한 개다.")
  await app.getByRole("tab", { name: "Playwright", exact: true }).click()
  await app.getByRole("button", { name: "Delete Playwright test 1", exact: true }).click()
  await app.getByRole("tab", { name: "Unit", exact: true }).click()
  assert.equal(
    await app.getByRole("textbox", { name: "Unit test 1", exact: true }).inputValue(),
    revised,
    "종류를 전환해도 편집 내용이 유지되어야 한다",
  )
  await app.getByRole("button", { name: "Submit to chat", exact: true }).click()
  await app.getByRole("status").filter({ hasText: "Host accepted" }).waitFor()
  const received = JSON.parse(await page.locator("#received").textContent())
  assert.equal(received.role, "user")
  const text = received.content[0].text
  assert.ok(text.includes(revised), "수정한 한국어 원문을 그대로 제출해야 한다")
  assert.ok(text.includes("중복 가입 요청 후에도 저장된 계정은 한 개다."))
  assert.ok(!text.includes("A user can submit the signup form"), "삭제한 항목을 제출하면 안 된다")
  assert.match(text, /REDPACT-PROBE-[a-f0-9-]+/)
  for (const [name, width, height] of [
    ["desktop", 1920, 1080],
    ["mobile", 414, 896],
  ]) {
    await page.setViewportSize({ width, height })
    await page.screenshot({ path: new URL(`${name}.png`, output).pathname })
  }
  await page.goto(`${origin}/?reject`)
  await app.getByRole("button", { name: "Submit to chat", exact: true }).click()
  await app.getByRole("status").filter({ hasText: "Host rejected" }).waitFor()
  assert.equal(
    await app.getByRole("button", { name: "Submit to chat", exact: true }).isEnabled(),
    true,
    "호스트 거절 후 다시 제출할 수 있어야 한다",
  )
  await page.goto(`${origin}/?theme=dark`)
  await app.getByRole("status").filter({ hasText: "Connected." }).waitFor()
  assert.equal(
    await app.locator("html").getAttribute("data-theme"),
    "dark",
    "공유 테마는 호스트의 어두운 모드를 따라야 한다",
  )
  assert.equal(
    await app
      .getByRole("button", { name: "Submit to chat", exact: true })
      .getAttribute("data-slot"),
    "button",
    "기존 Redpact 버튼을 재사용해야 한다",
  )
  await app.getByRole("tab", { name: "Unit", exact: true }).focus()
  await page.keyboard.press("ArrowRight")
  assert.equal(
    await app.getByRole("tab", { name: "Integration", exact: true }).getAttribute("aria-selected"),
    "true",
    "키보드로 종류를 전환할 수 있어야 한다",
  )
  console.log(
    "PASS: 직접 편집·삭제·추가·원문 전달·호스트 거절 복구. 실제 GPT 수신은 별도 호스트 검증이 필요하다.",
  )
} finally {
  await browser.close()
  server.close()
}
