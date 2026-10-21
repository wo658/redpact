import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

export async function checkPublishedPlugin(source, readMetadata = registryMetadata) {
  const metadata = await readMetadata(source)
  if (metadata.name !== source.package) {
    throw new Error("Plugin registry identity mismatch")
  }
  const published = metadata.versions?.[source.version]
  if (!published) {
    throw new Error(`Plugin ${source.package}@${source.version} is not published`)
  }
  if (published.name !== source.package || published.version !== source.version) {
    throw new Error("Published Plugin identity mismatch")
  }
  if (metadata["dist-tags"]?.latest !== source.version) {
    throw new Error(`Plugin catalog ${source.version} does not match npm latest`)
  }
}

async function registryMetadata(source) {
  const response = await fetch(`${source.registry}/${encodeURIComponent(source.package)}`, {
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) {
    throw new Error(`Plugin registry returned HTTP ${response.status}`)
  }
  return response.json()
}

const root = new URL("../../", import.meta.url)
export async function readPluginSource() {
  const catalog = JSON.parse(
    await readFile(new URL(".agents/plugins/marketplace.json", root), "utf8"),
  )
  const source = catalog.plugins.find((plugin) => plugin.name === "redpact")?.source
  if (
    source?.source !== "npm" ||
    source.package !== "@wo658/redpact-plugin" ||
    source.registry !== "https://registry.npmjs.org" ||
    !/^\d+\.\d+\.\d+$/.test(source.version)
  ) {
    throw new Error("Expected the fixed public Plugin package and an explicit stable version")
  }
  return source
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = await readPluginSource()
  if (process.argv.includes("--registry")) {
    await checkPublishedPlugin(source)
  }
  console.log(`Verified Plugin ${source.package}@${source.version}`)
}
