import assert from "node:assert/strict"

export async function waitForPublishedMetadata(
  url,
  {
    fetchMetadata = fetch,
    now = Date.now,
    pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    timeoutMs = 30 * 60 * 1000,
    intervalMs = 10000,
  } = {},
) {
  const deadline = now() + timeoutMs
  for (;;) {
    const response = await fetchMetadata(url, { signal: AbortSignal.timeout(30000) })
    if (response.ok) {
      return response.json()
    }
    assert.equal(response.status, 404, `Registry verification returned HTTP ${response.status}`)
    const remaining = deadline - now()
    if (remaining <= 0) {
      throw new Error(`Published package was not visible after ${timeoutMs} ms: ${url}`)
    }
    await pause(Math.min(intervalMs, remaining))
  }
}
