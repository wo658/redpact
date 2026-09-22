import { readFile } from "node:fs/promises"
import { z } from "zod"
import { runtimePackageName } from "./package.js"

export async function runtimePackage() {
  return z
    .object({ name: z.string(), version: z.string() })
    .parse(JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8")))
}

export async function readRegistryTags(signal: AbortSignal) {
  const packageName = encodeURIComponent(runtimePackageName)
  const response = await fetch(`https://registry.npmjs.org/-/package/${packageName}/dist-tags`, {
    signal,
    redirect: "error",
    headers: { Accept: "application/json" },
  })
  if (!response.ok) {
    throw new Error(`npm registry returned HTTP ${response.status}`)
  }
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error("Empty npm registry response")
  }
  let source = ""
  let size = 0
  const decoder = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      size += value.byteLength
      if (size > 65536) {
        throw new Error("npm registry response is too large")
      }
      source += decoder.decode(value, { stream: true })
    }
    source += decoder.decode()
    return z.record(z.string(), z.string()).parse(JSON.parse(source))
  } finally {
    await reader.cancel()
  }
}
