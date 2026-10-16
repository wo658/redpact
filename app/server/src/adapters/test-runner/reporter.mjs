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

function timeoutMessage(error, duration, steps = []) {
  const message = error.message ?? ""
  const timeout = /^(Test|Hook) timed out in (\d+)ms\./.exec(message)
  if (!timeout) {
    return message
  }
  const stage = timeout[1].toLowerCase()
  const interrupted = steps.findLast((step) => step.state === "interrupted")
  const elapsed = Number.isFinite(duration) ? `${Math.round(duration)}ms` : "unavailable"
  const step = interrupted ? `; step=${interrupted.name}` : ""
  const diagnostic = `${message}\nIntegration timeout: limit=${timeout[2]}ms; elapsed=${elapsed}; stage=${stage}${step}. Check tests.timeoutMs or the explicit test/hook timeout; the instance testResources.timeoutSeconds budget is separate.`
  process.stderr.write(`${diagnostic}\n`)
  return diagnostic
}

export default class RedpactReporter {
  onTestRunEnd(modules, errors, reason) {
    const cases = modules.flatMap((module) =>
      [...module.children.allTests()].map((test) => {
        const result = test.result()
        const steps = observedSteps(test)
        return {
          steps,
          name: test.fullName,
          file: module.moduleId,
          state: result.state,
          errors: (result.errors ?? []).map((error) => ({
            name: error.name ?? "Error",
            message: timeoutMessage(error, test.diagnostic()?.duration, steps),
            stack: error.stack,
          })),
        }
      }),
    )
    const collectionErrors = []
    const executionErrors = errors.map((error) => error.message)
    for (const module of modules) {
      for (const suite of [module, ...module.children.allSuites()]) {
        for (const error of suite.errors()) {
          const message = timeoutMessage(error, module.diagnostic().duration)
          if (/^Hook timed out in \d+ms\./.test(error.message ?? "")) {
            executionErrors.push(message)
          } else {
            collectionErrors.push(message)
          }
        }
      }
    }
    writeFileSync(
      process.env.REDPACT_REPORT,
      JSON.stringify(
        {
          cases,
          collectionErrors,
          errors: executionErrors,
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
