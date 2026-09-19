import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { rpc } from "./target"

type Tool = { name: string; _meta?: { ui?: { resourceUri?: string } } }
type Resource = { contents: { mimeType: string; text: string }[] }

/** Coding Agent가 검토 전에 실제 Redpact MCP 결과 카드를 열 수 있어야 한다. */
test("데모 워크트리는 환경과 테스트 MCP 앱 카드를 제공한다", async (context) => {
  const step = createSteps(context)
  const tools = await step("MCP 앱이 연결된 도구를 조회", async () => {
    const result = await rpc<{ tools: Tool[] }>("tools/list", {})
    return result.tools
  })

  await step("환경과 테스트 카드 리소스 연결을 확인", async () => {
    const configure = tools.find((tool) => tool.name === "configure")
    const getRun = tools.find((tool) => tool.name === "get_run")

    // 에이전트가 실행 전에 선택한 환경을 사람이 볼 수 있어야 한다.
    expect(configure?._meta?.ui?.resourceUri).toBe("ui://redpact/environment.html")
    // 실행 결과는 같은 워크트리의 검토 카드로 이어져야 한다.
    expect(getRun?._meta?.ui?.resourceUri).toBe("ui://redpact/tests.html")
  })

  await step("실제 MCP 앱 문서를 읽어 렌더링 가능한지 확인", async () => {
    const app = await rpc<Resource>("resources/read", { uri: "ui://redpact/tests.html" })
    expect(app.contents).toHaveLength(1)
    expect(app.contents[0].mimeType).toBe("text/html;profile=mcp-app")
    expect(app.contents[0].text).toContain('<div id="root">')
  })
})
