import { appendFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { StringDecoder } from "node:string_decoder"

export function createDiagnosticTail(redactions: string[] = [], maxChars = 65536) {
  let text = ""
  let pending = ""
  let finished = false
  const decoder = new StringDecoder("utf8")
  const secrets = [...new Set(redactions.filter(Boolean))].sort((a, b) => b.length - a.length)
  const hold = Math.max(0, ...secrets.map((value) => value.length - 1))
  function drain(final: boolean) {
    const boundary = final ? pending.length : Math.max(0, pending.length - hold)
    let offset = 0
    let output = ""
    while (offset < boundary) {
      const secret = secrets.find((value) => pending.startsWith(value, offset))
      if (secret) {
        output += "[REDACTED]"
        offset += secret.length
      } else {
        const point = String.fromCodePoint(pending.codePointAt(offset) ?? 0)
        output += point
        offset += point.length
      }
    }
    pending = pending.slice(offset)
    text = (text + output).slice(-maxChars)
  }
  return {
    write(chunk: Buffer) {
      if (finished) {
        throw new Error("Diagnostic tail already finalized")
      }
      pending += decoder.write(chunk)
      drain(false)
    },
    finish() {
      if (finished) {
        return
      }
      finished = true
      pending += decoder.end()
      drain(true)
    },
    read() {
      return text
    },
  }
}

// Keep enough undecided text to redact values spanning adjacent stream chunks.
export function createDiagnosticLog(
  path: string,
  redactions: string[] = [],
  maxBytes = 256 * 1024,
) {
  const secrets = [...new Set(redactions.filter(Boolean))].sort((a, b) => b.length - a.length)
  const hold = Math.max(0, ...secrets.map((value) => value.length - 1))
  const decoder = new StringDecoder("utf8")
  let pending = ""
  let length = 0
  let truncated = false
  let collectionFailed = false
  let closed = false
  let failure: unknown
  let writing: Promise<void> = Promise.resolve()

  function append(text: string) {
    if (!text) {
      return
    }
    writing = writing.then(async () => {
      if (failure) {
        return
      }
      try {
        await mkdir(dirname(path), { recursive: true, mode: 0o700 })
        await appendFile(path, text, { mode: 0o600 })
      } catch (error) {
        failure = error
      }
    })
  }
  function persist(text: string) {
    if (truncated || !text) {
      return
    }
    let accepted = ""
    for (const point of text) {
      const size = Buffer.byteLength(point)
      if (length + size > maxBytes) {
        truncated = true
        break
      }
      accepted += point
      length += size
    }
    append(accepted)
    if (truncated) {
      append("\n[Output truncated]\n")
    }
  }
  function drain(final: boolean) {
    let offset = 0
    let output = ""
    const boundary = final ? pending.length : Math.max(0, pending.length - hold)
    while (offset < boundary) {
      const secret = secrets.find((value) => pending.startsWith(value, offset))
      if (secret) {
        output += "[REDACTED]"
        offset += secret.length
      } else {
        const point = String.fromCodePoint(pending.codePointAt(offset) ?? 0)
        output += point
        offset += point.length
      }
    }
    pending = pending.slice(offset)
    persist(output)
  }
  return {
    write(chunk: string | Buffer) {
      if (closed) {
        throw new Error("Diagnostic log already finalized")
      }
      pending += decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      drain(false)
    },
    failed(_reason: unknown) {
      // Stream error messages can contain untrusted secrets; retain the failure fact.
      collectionFailed = true
    },
    async flush() {
      await writing
      if (failure) {
        throw failure
      }
    },
    async finish() {
      if (!closed) {
        closed = true
        pending += decoder.end()
        drain(true)
        if (collectionFailed) {
          append("\n[Log collection failed]\n")
        }
      }
      await writing
      if (failure) {
        throw failure
      }
    },
  }
}
