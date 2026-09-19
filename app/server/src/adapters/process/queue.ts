import PQueue from "p-queue"
import type { Scheduler } from "../../core/types/contracts.js"
export function createScheduler(
  concurrencyFor: (key: string) => number | Promise<number> = () => 1,
): Scheduler {
  const queues = new Map<string, PQueue>()
  return {
    async add(key, task) {
      const concurrency = await concurrencyFor(key)
      let queue = queues.get(key)
      if (!queue) {
        queue = new PQueue({ concurrency })
        queues.set(key, queue)
      } else {
        queue.concurrency = concurrency
      }
      try {
        return await queue.add(task)
      } finally {
        if (queue.size === 0 && queue.pending === 0) {
          queues.delete(key)
        }
      }
    },
    async idle() {
      await Promise.all([...queues.values()].map((queue) => queue.onIdle()))
    },
  }
}
