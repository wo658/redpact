import { problem } from "../core/problems.js"
import { getReviewContext } from "./chat-context.js"
import type { Services } from "./services.js"

export function getAgentRuntimeStatus(services: Services) {
  return { state: "running", canStop: Boolean(services.runtimeControl) }
}

export function openAgentRuntime(
  services: Services,
  origin: string,
  input: { kind?: "integration" | "unit" | "playwright"; id?: string },
) {
  if (Boolean(input.kind) !== Boolean(input.id)) {
    problem("invalid_input", "Provide execution kind and id together, or neither")
  }
  const reviewPath =
    input.kind && input.id
      ? getReviewContext(services, { kind: input.kind, id: input.id }).reviewPath
      : "/"
  return { url: new URL(reviewPath, origin).href, reviewPath }
}
