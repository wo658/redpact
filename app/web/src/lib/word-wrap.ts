import { useSyncExternalStore } from "react"

const storageKey = "redpact:word-wrap"
const changeEvent = "redpact:word-wrap-change"
let sessionValue = true
let sessionOnly = false

function readWordWrap() {
  if (sessionOnly) {
    return sessionValue
  }
  try {
    return window.localStorage.getItem(storageKey) !== "false"
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

function setWordWrap(value: boolean) {
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

export function useWordWrap() {
  const wordWrap = useSyncExternalStore(subscribe, readWordWrap, () => true)
  return [wordWrap, setWordWrap] as const
}
