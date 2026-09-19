import { createContext, type ReactNode, useContext, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "./ui/toast"

const Revision = createContext(0)
export function useLiveRevision() {
  return useContext(Revision)
}

export function LiveUpdates({
  children,
  worktreeId,
  projectId,
  scope,
  enabled = true,
}: {
  children: ReactNode
  worktreeId?: string
  projectId?: string
  scope?: "checkout" | "evidence" | "preview" | "unit" | "tests"
  enabled?: boolean
}) {
  const { t } = useTranslation()
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!enabled || !window.EventSource) {
      return
    }
    let active = true
    let disconnected = false
    let toastId: string | undefined
    const clearFailure = () => {
      disconnected = false
      if (toastId) {
        toast.close(toastId)
        toastId = undefined
      }
    }
    const reportFailure = () => {
      if (!active || disconnected) {
        return
      }
      disconnected = true
      toastId = toast.add({
        title: t("Live updates disconnected. Reconnecting…"),
        type: "error",
        timeout: 5000,
      })
    }
    const query = new URLSearchParams()
    if (projectId) {
      query.set("projectId", projectId)
    }
    if (worktreeId) {
      query.set("worktreeId", worktreeId)
    }
    if (scope) {
      query.set("scope", scope)
    }
    const events = new window.EventSource(`/api/events${query.size ? `?${query}` : ""}`)
    events.onmessage = () => {
      if (!active) {
        return
      }
      clearFailure()
      setRevision((value) => value + 1)
    }
    events.onerror = reportFailure
    events.addEventListener("watch-error", reportFailure)
    return () => {
      active = false
      events.close()
      clearFailure()
    }
  }, [projectId, worktreeId, scope, enabled, t])
  return <Revision.Provider value={revision}>{children}</Revision.Provider>
}
