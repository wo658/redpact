import type { Problem } from "./types/problems.js"
export function problem(code: Problem["code"], message: string): never {
  throw Object.assign(new Error(message), { code })
}
