import { problem } from "../core/problems.js"
import { eventScope } from "./event-scope.js"
import type { Services } from "./services.js"

export async function prepareEvents(
  services: Services,
  query: { projectId?: string; worktreeId?: string; scope?: string },
) {
  const initialScope = await eventScope(services, query)
  const watcher = services.changes ?? problem("invalid_input", "Live updates unavailable")
  return {
    observe(signal: AbortSignal, changed: () => void, failed: () => void) {
      let scope = initialScope
      let closed = false
      const notify = (paths?: string[]) => {
        if (!closed && !signal.aborted && (!paths || paths.some(scope.accepts))) {
          // Adapters may deliver an initial change before subscribe returns its handle.
          queueMicrotask(() => {
            if (!closed && !signal.aborted) {
              changed()
            }
          })
        }
      }
      const subscribe = () => {
        const subscription = watcher.subscribe(scope.roots, notify, failed)
        let closing: Promise<void> | undefined
        return {
          ready: subscription.ready,
          close: () => (closing ??= subscription.close()),
        }
      }
      let subscription = subscribe()
      return {
        ready: subscription.ready,
        async refresh() {
          if (!query.projectId || closed || signal.aborted) {
            return
          }
          const next = await eventScope(services, query)
          if (JSON.stringify(next.roots) === JSON.stringify(scope.roots)) {
            return
          }
          await subscription.close()
          if (closed || signal.aborted) {
            return
          }
          scope = next
          subscription = subscribe()
          await subscription.ready
        },
        async close() {
          closed = true
          await subscription.close()
        },
      }
    },
  }
}
