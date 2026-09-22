import { randomUUID } from "node:crypto"
import { Network } from "testcontainers"
import { createVitestRunner } from "../../src/adapters/test-runner/vitest.js"

// Adapter tests use a real isolated runner network; workflow fixtures do not provision an app.
export function createTestVitestRunner(...args: Parameters<typeof createVitestRunner>) {
  const runner = createVitestRunner(...args)
  return {
    ...runner,
    async execute(...input: Parameters<typeof runner.execute>) {
      const network = await new Network().start()
      try {
        input[6] = {
          ...input[6],
          version: 1,
          services: input[6]?.services ?? {},
          runtime: {
            ownerId: randomUUID(),
            environmentId: randomUUID(),
            network: network.getName(),
          },
        }
        return await runner.execute(...input)
      } finally {
        await network.stop()
      }
    },
  }
}
