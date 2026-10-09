import type { localRuntime } from "./local.js"

export async function readPage(runtime: ReturnType<typeof localRuntime>) {
  return { status: await runtime.status(), error: "" }
}
