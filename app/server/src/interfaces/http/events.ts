import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { describeRoute } from "hono-openapi"
import { prepareEvents } from "../../workflows/events.js"
import type { Services } from "../../workflows/services.js"

export function eventRoutes(services: Services) {
  return new Hono().get(
    "/events",
    describeRoute({
      operationId: "observeChanges",
      summary: "Observe local viewer invalidations",
      tags: ["Events"],
      description:
        "Scoped local invalidations: projectId observes worktrees; worktreeId observes checkout sources. scope=preview combines source and shared settings changes with Playwright capture records and environments. scope=tests combines sources with integration evidence. Viewing never executes project code.",
      responses: {
        200: {
          description: "Server-sent invalidations",
          content: { "text/event-stream": { schema: { type: "string" } } },
        },
      },
    }),
    async (c) => {
      const query = {
        projectId: c.req.query("projectId"),
        worktreeId: c.req.query("worktreeId"),
        scope: c.req.query("scope"),
      }
      const events = await prepareEvents(services, query)
      c.header("Cache-Control", "no-cache, no-transform")
      c.header("X-Accel-Buffering", "no")
      return streamSSE(c, async (stream) => {
        const controller = new AbortController()
        let stopped = false
        let finish: () => void = () => {}
        const ended = new Promise<void>((resolve) => {
          finish = () => {
            stopped = true
            controller.abort()
            resolve()
          }
        })
        stream.onAbort(finish)
        let writing = false
        let dirty = false
        let writingTask = Promise.resolve()
        const send = () => {
          dirty = true
          if (writing || stopped || stream.aborted) {
            return
          }
          writing = true
          writingTask = (async () => {
            try {
              while (dirty && !stopped && !stream.aborted) {
                dirty = false
                await subscription.refresh()
                if (stopped || stream.aborted) {
                  return
                }
                await stream.writeSSE({ data: "changed" })
              }
            } catch {
              finish()
            } finally {
              writing = false
            }
          })()
        }
        const failed = () => {
          void stream.writeSSE({ event: "watch-error", data: "unavailable" }).catch(() => {})
          finish()
        }
        const subscription = events.observe(controller.signal, send, failed)
        try {
          await Promise.race([subscription.ready, ended])
          if (!stopped && !stream.aborted) {
            send()
            await ended
          }
        } catch {
          failed()
        } finally {
          await writingTask
          await subscription.close()
        }
      })
    },
  )
}
