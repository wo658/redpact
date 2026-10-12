import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer } from "vite"

const server = await createServer({
  server: { middlewareMode: true, ws: false },
  appType: "custom",
})
after(() => server.close())
await server.ssrLoadModule("/src/locales/index.ts")
const { DependencyCatalog } = await server.ssrLoadModule("/src/components/dependency-viewer.tsx")

test("의존성 선택 없이 모든 고정 정의와 환경변수를 표시한다", () => {
  const html = renderToStaticMarkup(
    createElement(DependencyCatalog, {
      dependencies: {
        payment: { kind: "remote", env: { app: { PAYMENT_URL: "https://payment.test" } } },
        search: { kind: "shared-local", env: { app: { SEARCH_URL: "http://search.test" } } },
      },
    }),
  )
  assert.ok(html.includes("http://search.test"), "두 번째 의존성도 선택 없이 보여야 한다")
  assert.ok(html.includes("https://payment.test"))
  assert.doesNotMatch(html, /Select dependency|menuitemradio/)
})
