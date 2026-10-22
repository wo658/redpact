import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer } from "vite"

const server = await createServer({ server: { middlewareMode: true } })
const { Notice } = await server.ssrLoadModule("/src/components/feedback.tsx")
after(() => server.close())

test("조치가 필요한 오류는 큰 문제 상세와 복사 박스 없이 간결하게 표시한다", () => {
  const html = renderToStaticMarkup(createElement(Notice, { error: true }, "Settings save failed"))
  assert.match(html, /Settings save failed/)
  assert.doesNotMatch(html, /Problem details|Copy|<section/)
})
