import { useEffect, useRef } from "react"

// Keep invalidations bounded while a slow response is still being read.
export function useRefreshRequest(
  request: (signal: AbortSignal) => Promise<void>,
  revision: number | string,
  immediateRevision = 0,
) {
  const invalidate = useRef<() => void>(() => {})
  useEffect(() => {
    void immediateRevision
    const abort = new AbortController()
    let running = false
    let dirty = false
    let timer: ReturnType<typeof setTimeout> | undefined
    async function refresh() {
      if (running || abort.signal.aborted) {
        return
      }
      dirty = false
      running = true
      try {
        await request(abort.signal)
      } finally {
        running = false
        if (dirty && !timer && !abort.signal.aborted) {
          void refresh()
        }
      }
    }
    invalidate.current = () => {
      dirty = true
      if (!timer) {
        timer = setTimeout(() => {
          timer = undefined
          void refresh()
        }, 1000)
      }
    }
    void refresh()
    return () => {
      abort.abort()
      clearTimeout(timer)
      invalidate.current = () => {}
    }
  }, [request, immediateRevision])
  const previous = useRef(revision)
  useEffect(() => {
    if (previous.current !== revision) {
      previous.current = revision
      invalidate.current()
    }
  }, [revision])
}
