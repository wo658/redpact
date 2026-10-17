import { useSyncExternalStore } from "react"

const storageKey = "redpact:tracked-files-only"
const changeEvent = "redpact:tracked-files-only-change"
let sessionValue = false
let sessionOnly = false

function readTrackedFilesOnly() {
  if (sessionOnly) {
    return sessionValue
  }
  try {
    return window.localStorage.getItem(storageKey) === "true"
  } catch {
    return sessionValue
  }
}

function subscribe(listener: () => void) {
  window.addEventListener(changeEvent, listener)
  window.addEventListener("storage", listener)
  return () => {
    window.removeEventListener(changeEvent, listener)
    window.removeEventListener("storage", listener)
  }
}

function setTrackedFilesOnly(value: boolean) {
  sessionValue = value
  try {
    window.localStorage.setItem(storageKey, String(value))
    sessionOnly = false
  } catch {
    // A readable but unwritable store must not restore a stale saved choice.
    sessionOnly = true
  }
  window.dispatchEvent(new Event(changeEvent))
}

export function useTrackedFilesOnly() {
  const trackedOnly = useSyncExternalStore(subscribe, readTrackedFilesOnly, () => false)
  return [trackedOnly, setTrackedFilesOnly] as const
}
