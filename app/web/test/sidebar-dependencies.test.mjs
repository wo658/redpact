import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const root = fileURLToPath(new URL("../", import.meta.url))

test("사이드바는 루트 워크스페이스 설치만으로 브라우저 의존성을 해석한다", () => {
  const config = ts.readConfigFile(path.join(root, "tsconfig.app.json"), ts.sys.readFile)
  const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
  const exampleModules = path.resolve(root, "../../examples/sidebar-app/node_modules")
  const visible = (file) => !file.startsWith(`${exampleModules}/`) && file !== exampleModules
  // Docker and package consumers install the workspace, without the standalone example.
  const host = {
    ...ts.sys,
    fileExists: (file) => visible(file) && ts.sys.fileExists(file),
    directoryExists: (file) => visible(file) && ts.sys.directoryExists(file),
  }
  const queue = [path.join(root, "src/entries/sidebar.tsx")]
  const visited = new Set()
  const missing = []
  for (const file of queue) {
    if (visited.has(file) || file.includes("/node_modules/")) {
      continue
    }
    visited.add(file)
    for (const dependency of ts.preProcessFile(readFileSync(file, "utf8")).importedFiles) {
      const name = dependency.fileName
      if (
        name.startsWith("node:") ||
        name.startsWith("virtual:") ||
        /\.(css|svg|png|woff2)(\?|$)/.test(name)
      ) {
        continue
      }
      const { resolvedModule } = ts.resolveModuleName(name, file, options, host)
      if (resolvedModule) {
        queue.push(resolvedModule.resolvedFileName)
      } else {
        missing.push(`${path.relative(root, file)}: ${name}`)
      }
    }
  }
  assert.deepEqual(missing, [], "모든 사이드바 의존성은 독립적인 예제 설치 없이 해석되어야 한다")
})
