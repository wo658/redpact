import { setTimeout } from "node:timers/promises"
import type { Environment } from "../../core/types/environment.js"

// Container healthchecks cannot establish reachability through a host-published port.
export async function verifyBrowserEndpoints(
  record: {
    settings: Pick<Environment["settings"], "tests">
    specification: Pick<Environment["specification"], "playwright">
  },
  endpoints: Environment["endpoints"],
  signal: AbortSignal,
) {
  const schemes = new Map<string, string>()
  for (const binding of Object.values(record.settings.tests.env)) {
    if ("service" in binding && binding.scheme) {
      schemes.set(`${binding.service}:${binding.port}`, binding.scheme)
    }
  }
  const browser = record.specification.playwright
  if (browser) {
    const key = `${browser.service}:${browser.port}`
    if (!schemes.has(key)) {
      schemes.set(key, browser.scheme)
    }
  }
  await Promise.all(
    Object.entries(endpoints).map(async ([name, endpoint]) => {
      const scheme = schemes.get(name)
      if (!scheme) {
        return
      }
      const deadline = Date.now() + 5000
      do {
        signal.throwIfAborted()
        try {
          const response = await fetch(`${scheme}://${endpoint.host}:${endpoint.port}/`, {
            redirect: "manual",
            signal: AbortSignal.any([signal, AbortSignal.timeout(1000)]),
          })
          // Any HTTP response proves reachability; root paths may require auth or return 404.
          await response.body?.cancel()
          return
        } catch {
          signal.throwIfAborted()
        }
        await setTimeout(200, undefined, { signal })
      } while (Date.now() < deadline)
      throw new Error(
        `Service ${name} is not reachable from the host. Configure the application to listen on 0.0.0.0 inside the container.`,
      )
    }),
  )
}
