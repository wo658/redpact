import type { StartedTestContainer } from "testcontainers"
import { executeLimitedContainer } from "./limited-command.js"
import { copyContainerOutput } from "./runtime.js"

function preparationDisconnected() {
  process.exit(1)
}

export function watchRunnerParent() {
  process.once("disconnect", preparationDisconnected)
}

export async function failRunner(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  await new Promise<void>((resolve) => process.stderr.write(message, () => resolve()))
  process.exitCode = 1
  process.removeListener("disconnect", preparationDisconnected)
  process.disconnect?.()
}

// Keep a process-scoped Ryuk connection and live handles until explicit cleanup.
export async function serveRunner(container: StartedTestContainer) {
  process.removeListener("disconnect", preparationDisconnected)
  let active: AbortController | undefined
  let queue = Promise.resolve()
  const disconnected = () => {
    // A lost parent must release the Ryuk connection even when Docker is unresponsive.
    const deadline = setTimeout(() => process.exit(1), 30000)
    deadline.unref()
    active?.abort()
    void queue.finally(async () => {
      await container.stop({ timeout: 0 }).catch(() => {})
      process.exit(1)
    })
  }
  process.once("disconnect", disconnected)
  process.on("message", (message) => {
    const request = message as {
      requestId: number
      action: string
      args: string[]
      limits: Parameters<typeof executeLimitedContainer>[3]
      target: string
    }
    if (request.action === "cancel") {
      active?.abort()
      return
    }
    // Set the abort controller before queuing so a following cancellation cannot be lost.
    const execution = request.action === "execute" ? new AbortController() : undefined
    if (execution) {
      active = execution
    }
    let outputSize = -1
    queue = queue.then(async () => {
      try {
        let value: unknown
        if (request.action === "execute" && execution) {
          value = await executeLimitedContainer(
            container.getId(),
            request.args,
            execution.signal,
            request.limits,
            (output) => {
              const size = output.stdout.length + output.stderr.length + Number(output.truncated)
              if (process.connected && size !== outputSize) {
                outputSize = size
                process.send?.({ requestId: request.requestId, output }, () => {})
              }
            },
          )
          active = undefined
        } else if (request.action === "exec") {
          value = await container.exec(request.args)
        } else if (request.action === "copy") {
          await copyContainerOutput(container.getId(), request.target)
        } else if (request.action === "stop") {
          await container.stop({ timeout: 0, remove: true, removeVolumes: true })
        } else {
          throw new Error("Unsupported runner action")
        }
        await new Promise<void>((resolve, reject) =>
          process.send?.({ requestId: request.requestId, value }, (error) =>
            error ? reject(error) : resolve(),
          ),
        )
      } catch (error) {
        if (process.connected) {
          process.send?.({
            requestId: request.requestId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      } finally {
        if (request.action === "stop") {
          process.removeListener("disconnect", disconnected)
          process.disconnect?.()
        }
      }
    })
  })
  process.send?.({ ready: true, containerId: container.getId() })
}
