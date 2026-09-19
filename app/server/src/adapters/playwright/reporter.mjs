import { createHash, randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs"
import { relative, resolve, sep } from "node:path"

import viewportMetadata from "./viewport.cjs"

const root = "/review/output"
const secrets = JSON.parse(process.env.REDPACT_REDACT_VALUES ?? "[]")
  .filter(Boolean)
  .sort((a, b) => b.length - a.length)
const redact = (value) =>
  secrets.reduce((text, secret) => text.split(secret).join("[REDACTED]"), value)
export default class CaptureReporter {
  cases = []
  errors = []
  bytes = 0
  onError(error) {
    this.errors.push(error.message ?? String(error))
  }
  onTestEnd(test, result) {
    const artifacts = []
    for (const attachment of result.attachments) {
      // Traces can contain raw console output and network credentials.
      if (secrets.length && attachment.contentType === "application/zip") {
        continue
      }
      if (!["image/png", "video/webm", "application/zip"].includes(attachment.contentType)) {
        continue
      }
      let data = attachment.body
      if (attachment.path) {
        const path = realpathSync(attachment.path),
          rel = relative("/review/results", path)
        if (
          rel.startsWith(`..${sep}`) ||
          rel === ".." ||
          resolve(path) === resolve("/review/results")
        ) {
          throw new Error("Artifact escapes output directory")
        }
        if (statSync(path).size > 64 * 1024 * 1024) {
          throw new Error("Artifact exceeds 64 MiB")
        }
        data = readFileSync(path)
      }
      if (!data?.length) {
        continue
      }
      this.bytes += data.length
      if (data.length > 64 * 1024 * 1024 || this.bytes > 256 * 1024 * 1024) {
        throw new Error("Capture artifacts exceed 256 MiB")
      }
      const id = randomUUID()
      mkdirSync(root, { recursive: true })
      writeFileSync(`${root}/${id}`, data)
      artifacts.push({
        id,
        name: attachment.name,
        contentType: attachment.contentType,
        bytes: data.length,
        sha256: createHash("sha256").update(data).digest("hex"),
        ...(attachment.contentType === "image/png"
          ? { viewport: viewportMetadata.readViewport(data) }
          : {}),
      })
    }
    const steps = []
    function collect(items) {
      for (const step of items) {
        if (step.category === "test.step") {
          steps.push({
            title: step.title,
            duration: step.duration,
            ...(step.error ? { error: step.error.message ?? "Step failed" } : {}),
          })
        }
        collect(step.steps ?? [])
      }
    }
    collect(result.steps)
    const file = relative("/review/tests", test.location.file)
    const title = test.titlePath().filter(Boolean).join(" › ")
    this.cases.push({
      id: createHash("sha256")
        .update(JSON.stringify([file, test.titlePath()]))
        .digest("hex"),
      title,
      file,
      status: result.status,
      duration: result.duration,
      errors: result.errors.map((e) => e.message ?? String(e)),
      steps,
      artifacts,
    })
  }
  onEnd(result) {
    mkdirSync(root, { recursive: true })
    writeFileSync(
      `${root}/report.json`,
      JSON.stringify(
        { outcome: result.status, cases: this.cases, errors: this.errors },
        (_key, value) => (typeof value === "string" ? redact(value) : value),
      ),
    )
  }
}
