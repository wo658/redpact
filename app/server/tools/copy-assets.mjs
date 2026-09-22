import { cp, mkdir } from "node:fs/promises"

await mkdir(new URL("../dist/adapters/test-runner/", import.meta.url), { recursive: true })
await cp(
  new URL("../src/adapters/test-runner/reporter.mjs", import.meta.url),
  new URL("../dist/adapters/test-runner/reporter.mjs", import.meta.url),
)
await cp(
  new URL("../../../pnpm-lock.yaml", import.meta.url),
  new URL("../dist/runtime-lock.yaml", import.meta.url),
)

await import("../../web/tools/build-mcp.mjs")

await mkdir(new URL("../dist/adapters/playwright/", import.meta.url), { recursive: true })
for (const name of ["Dockerfile", "reporter.mjs", "viewport.cjs", "capture-viewport.cjs"]) {
  await cp(
    new URL(`../src/adapters/playwright/${name}`, import.meta.url),
    new URL(`../dist/adapters/playwright/${name}`, import.meta.url),
  )
}

await cp(
  new URL("../src/adapters/test-runner/Dockerfile", import.meta.url),
  new URL("../dist/adapters/test-runner/Dockerfile", import.meta.url),
)

for (const name of ["package.json", "pnpm-lock.yaml"]) {
  await cp(
    new URL(`../src/adapters/test-runner/${name}`, import.meta.url),
    new URL(`../dist/adapters/test-runner/${name}`, import.meta.url),
  )
}
