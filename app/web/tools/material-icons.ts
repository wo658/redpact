import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { generateManifest } from "material-icon-theme"
import type { Plugin } from "vite"

const require = createRequire(import.meta.url)
const packageRoot = path.dirname(require.resolve("material-icon-theme/package.json"))
const virtualId = "virtual:material-icons"
const resolvedId = `\0${virtualId}`

export function materialIcons(): Plugin {
  const manifest = generateManifest({ activeIconPack: "react" })
  const files = new Map<string, string>()
  // Upstream declaration re-exports use extensionless paths under NodeNext.
  const definitions = manifest.iconDefinitions as Record<string, { iconPath: string }> | undefined
  for (const definition of Object.values(definitions ?? {})) {
    if (!definition.iconPath) {
      continue
    }
    const name = path.basename(definition.iconPath)
    files.set(name, path.join(packageRoot, "icons", name))
    definition.iconPath = `material-icons/${name}`
  }
  files.set("LICENSE", path.join(packageRoot, "LICENSE"))
  return {
    name: "redpact-material-icons",
    resolveId(id) {
      if (id === virtualId) {
        return resolvedId
      }
    },
    load(id) {
      if (id === resolvedId) {
        return `export default ${JSON.stringify(manifest)}`
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost")
        const name = url.pathname.replace(/^\/material-icons\//, "")
        const file = files.get(name)
        if (!url.pathname.startsWith("/material-icons/") || !file) {
          return next()
        }
        res.setHeader("Content-Type", name === "LICENSE" ? "text/plain" : "image/svg+xml")
        res.end(readFileSync(file))
      })
    },
    generateBundle() {
      for (const [name, file] of files) {
        this.emitFile({
          type: "asset",
          fileName: `material-icons/${name}`,
          source: readFileSync(file),
        })
      }
    },
  }
}
