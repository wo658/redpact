import assert from "node:assert/strict"
import { after, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer } from "vite"

const server = await createServer({
  server: { middlewareMode: true, ws: false },
  appType: "custom",
})
const { FileIcon, FolderIcon } = await server.ssrLoadModule("/src/components/file-icon.tsx")
after(() => server.close())

for (const [path, name] of [
  ["src/example.ts", "typescript"],
  ["src/example.d.ts", "typescript-def"],
  ["src/example.tsx", "react_ts"],
  ["app/package.json", "nodejs"],
  ["app/vite.config.ts", "vite"],
  ["PNPM-LOCK.YAML", "pnpm"],
  ["a/unknown.redpact-unknown", "file"],
  ["__proto__", "file"],
  ["constructor", "file"],
]) {
  test(`파일명과 복합 확장자에 맞는 아이콘: ${path}`, () => {
    const markup = renderToStaticMarkup(createElement(FileIcon, { path }))
    assert.ok(markup.includes(`/material-icons/${name}.svg`), markup)
    assert.ok(markup.includes('alt=""'), "장식 아이콘은 파일명을 중복 읽지 않는다")
  })
}

test("밝은 테마 변형을 함께 제공한다", () => {
  const markup = renderToStaticMarkup(createElement(FileIcon, { path: "Cargo.toml" }))
  assert.ok(markup.includes("/material-icons/toml.svg"), markup)
  assert.ok(markup.includes("/material-icons/toml_light.svg"), markup)
})

for (const [path, expanded, name] of [
  ["src", false, "folder-src"],
  ["src", true, "folder-src-open"],
  ["unknown-redpact-folder", false, "folder"],
  ["unknown-redpact-folder", true, "folder-open"],
]) {
  test(`폴더 이름과 열림 상태: ${path}, ${expanded}`, () => {
    const markup = renderToStaticMarkup(createElement(FolderIcon, { path, expanded }))
    assert.ok(markup.includes(`/material-icons/${name}.svg`), markup)
  })
}
