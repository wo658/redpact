import { readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "vite"

const root = fileURLToPath(new URL("../", import.meta.url))
let report
export function componentUsage() {
  report ??= inspectUsage()
  return report
}
async function inspectUsage() {
  // Shipped entry points and tree shaking exclude stories, drafts and unused re-exports.
  const previous = process.env.NODE_ENV
  let result
  try {
    result = await build({
      root,
      logLevel: "silent",
      server: { ws: false, hmr: false },
      build: {
        write: false,
        rolldownOptions: {
          input: ["src/entries/standalone.tsx", "src/entries/mcp-app.tsx"].map((file) =>
            path.join(root, file),
          ),
        },
      },
    })
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = previous
    }
  }
  const modules = new Map()
  for (const chunk of result.output.filter((item) => item.type === "chunk")) {
    for (const [file, info] of Object.entries(chunk.modules)) {
      if (file.startsWith(path.join(root, "src/")) && info.renderedLength > 0) {
        modules.set(`app/web/${path.relative(root, file)}`, info.renderedExports)
      }
    }
  }
  const files = await readdir(path.join(root, "src/components"), { recursive: true })
  const components = files
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => `app/web/src/components/${file}`)
  return {
    used: components.filter((file) => modules.has(file)).sort(),
    unused: components.filter((file) => !modules.has(file)).sort(),
    modules,
  }
}
