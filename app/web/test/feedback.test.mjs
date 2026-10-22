import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer } from "vite"

const server = await createServer({ server: { middlewareMode: true } })
const { Notice } = await server.ssrLoadModule("/src/components/feedback.tsx")
const { ProblemsProvider } = await server.ssrLoadModule("/src/components/problems.tsx")
after(() => server.close())

test("문제 목록 provider가 없는 독립 컴포넌트는 진단을 보존한다", () => {
  const html = renderToStaticMarkup(createElement(Notice, { error: true }, "Settings save failed"))
  assert.match(html, /Settings save failed/)
  assert.doesNotMatch(html, /Problem details|Copy|<section/)
})

test("문제 목록이 있는 앱에서는 비치명적 오류를 기본적으로 inline에 표시하지 않는다", () => {
  const html = renderToStaticMarkup(
    createElement(
      ProblemsProvider,
      null,
      createElement(Notice, { error: true }, "Settings save failed"),
    ),
  )
  assert.equal(html, "")
})

test("앱을 사용할 수 없는 치명적 오류만 inline 진단을 유지한다", () => {
  const html = renderToStaticMarkup(
    createElement(
      ProblemsProvider,
      null,
      createElement(Notice, { error: true, critical: true }, "Local server unavailable"),
    ),
  )
  assert.match(html, /role="alert"/)
  assert.match(html, /Local server unavailable/)
})
