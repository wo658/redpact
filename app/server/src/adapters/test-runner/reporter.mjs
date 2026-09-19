import { writeFileSync } from "node:fs"

function observedSteps(test) {
  const steps = new Map()
  for (const annotation of test.annotations()) {
    if (annotation.type !== "redpact-step-v1") {
      continue
    }
    if (annotation.message.length > 4096) {
      throw new Error("Step annotation exceeds limit")
    }
    const event = JSON.parse(annotation.message)
    if (event.state === "started") {
      if (steps.has(event.id) || steps.size >= 200) {
        throw new Error("Invalid step identity or count")
      }
      steps.set(event.id, {
        id: event.id,
        name: event.name,
        startedAt: event.startedAt,
        state: "interrupted",
      })
    } else {
      const step = steps.get(event.id)
      if (
        step?.state !== "interrupted" ||
        step.name !== event.name ||
        step.startedAt !== event.startedAt ||
        !["passed", "failed"].includes(event.state)
      ) {
        throw new Error("Invalid step lifecycle")
      }
      step.state = event.state
      step.durationMs = event.durationMs
    }
  }
  return [...steps.values()]
}

export default class RedpactReporter {
  onTestRunEnd(modules, errors, reason) {
    const cases = modules.flatMap((module) =>
      [...module.children.allTests()].map((test) => {
        const result = test.result()
        return {
          steps: observedSteps(test),
          name: test.fullName,
          file: module.moduleId,
          state: result.state,
          errors: (result.errors ?? []).map((error) => ({
            name: error.name ?? "Error",
            message: error.message ?? "",
            stack: error.stack,
          })),
        }
      }),
    )
    const collectionErrors = modules.flatMap((module) =>
      module.errors().map((error) => error.message),
    )
    writeFileSync(
      process.env.REDPACT_REPORT,
      JSON.stringify(
        {
          cases,
          collectionErrors,
          errors: errors.map((error) => error.message),
          reason,
        },
        (_key, value) =>
          typeof value === "string"
            ? JSON.parse(process.env.REDPACT_REDACT_VALUES ?? "[]")
                .filter((secret) => secret.length > 0)
                .sort((a, b) => b.length - a.length)
                .reduce((text, secret) => text.split(secret).join("[REDACTED]"), value)
            : value,
      ),
      { mode: 0o600 },
    )
  }
}
