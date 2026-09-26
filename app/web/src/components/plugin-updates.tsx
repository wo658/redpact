import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type {
  PluginAgent,
  PluginUpdateStatus,
  PluginUpdatesState,
} from "../../../server/src/core/types/plugin-updates"
import { Notice } from "./feedback"
import { SettingsRow, SettingsSection } from "./settings-row"
import { Button } from "./ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog"

const names = { codex: "Codex", claude: "Claude Code" }
async function request(
  action = "",
  body?: unknown,
  signal?: AbortSignal,
): Promise<PluginUpdatesState> {
  const response = await fetch(`/api/plugin-updates${action}`, {
    method: action ? "POST" : "GET",
    signal,
    ...(body
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  })
  if (!response.ok) {
    throw new Error("Could not request plugin updates. Check again.")
  }
  return response.json()
}

export function PluginUpdateSettings() {
  const { t } = useTranslation()
  const [state, setState] = useState<PluginUpdatesState>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [selected, setSelected] = useState<{ agent: PluginAgent; version: string } | null>(null)
  useEffect(() => {
    if (pending) {
      return
    }
    const abort = new AbortController()
    const load = () =>
      request("", undefined, abort.signal)
        .then((value) => {
          if (!abort.signal.aborted) {
            setState(value)
            setError("")
          }
        })
        .catch(() => {
          if (!abort.signal.aborted) {
            setError("Could not request plugin updates. Check again.")
          }
        })
    void load()
    const timer = setInterval(() => void load(), 3000)
    return () => {
      abort.abort()
      clearInterval(timer)
    }
  }, [pending])
  const busy = pending || Boolean(state?.busy)
  async function action(path: string, body?: unknown) {
    setPending(true)
    setError("")
    try {
      setState(await request(path, body))
    } catch {
      setError("Could not request plugin updates. Check again.")
    } finally {
      setPending(false)
    }
  }
  function statusLabel(row: PluginUpdateStatus) {
    switch (row.status) {
      case "unchecked":
        return t("Not checked")
      case "current":
        return t("No newer plugin version")
      case "missing":
        return t("Not installed")
      case "unsupported":
        return t("Manage in agent")
      case "error":
        return t("Plugin update failed")
      case "updated":
        return t("Updated. Start a new agent session.")
      case "available":
        return t("Available: {{version}}", { version: row.latestVersion })
    }
  }
  return (
    <SettingsSection
      title={t("Agent plugins")}
      description={t(
        "Check Redpact plugins in Codex and Claude Code. Save CLI paths in instance settings before checking.",
      )}
    >
      <SettingsRow title={t("Redpact plugins")}>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void action("/check")}>
          {busy ? t("Working…") : t("Check plugin updates")}
        </Button>
        {error && <Notice error>{t(error)}</Notice>}
      </SettingsRow>
      {state?.agents.map((row) => (
        <SettingsRow key={row.agent} title={names[row.agent]}>
          {row.currentVersion && (
            <span className="break-all">
              {t("Installed: {{version}}", { version: row.currentVersion })}
            </span>
          )}
          <span role="status">{statusLabel(row)}</span>
          {row.error && <Notice error={row.status === "error"}>{t(row.error)}</Notice>}
          {row.status === "available" && row.latestVersion && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              aria-label={t("Update {{agent}} plugin", { agent: names[row.agent] })}
              onClick={() => {
                if (row.latestVersion) {
                  setSelected({ agent: row.agent, version: row.latestVersion })
                }
              }}
            >
              {t("Update")}
            </Button>
          )}
        </SettingsRow>
      ))}
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("Update {{agent}} plugin", { agent: selected ? names[selected.agent] : "" })}
            </DialogTitle>
            <DialogDescription>
              {t(
                "Install plugin {{version}} using the agent CLI? Start a new agent session after updating.",
                { version: selected?.version },
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{t("Cancel")}</DialogClose>
            <Button
              disabled={busy}
              onClick={() => {
                if (!selected) {
                  return
                }
                const target = selected
                setSelected(null)
                void action("/install", target)
              }}
            >
              {t("Update plugin")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  )
}
