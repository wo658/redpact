import { ChevronRightIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { Api, WorktreeEnvironment } from "@/lib/api"
import { EnvironmentRow } from "./environment-row"
import { EmptyState, Loading, Notice } from "./feedback"
import { LiveUpdates, useLiveRevision } from "./live-updates"
import { Button } from "./ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible"

export function WorktreeEnvironments({ api, worktreeId }: { api: Api; worktreeId: string }) {
  return (
    <LiveUpdates worktreeId={worktreeId} scope="evidence">
      <Selections key={worktreeId} api={api} worktreeId={worktreeId} />
    </LiveUpdates>
  )
}

function Selections({ api, worktreeId }: { api: Api; worktreeId: string }) {
  const { t } = useTranslation()
  const revision = useLiveRevision()
  const [items, setItems] = useState<WorktreeEnvironment[] | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    void revision
    const abort = new AbortController()
    void api
      .environments(worktreeId, abort.signal)
      .then((items) => {
        if (!abort.signal.aborted) {
          setItems([...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
          setError("")
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          setError(
            error instanceof Error ? error.message : t("Environment information unavailable."),
          )
        }
      })
    return () => abort.abort()
  }, [api, worktreeId, revision, t])
  function update(environment: WorktreeEnvironment) {
    setItems((current) => [
      environment,
      ...(current ?? []).filter((item) => item.id !== environment.id),
    ])
  }
  const active = items?.filter((item) => item.state !== "stopped") ?? []
  const stopped = items?.filter((item) => item.state === "stopped") ?? []
  return (
    <section
      aria-label={t("Execution environments")}
      className="mx-auto flex min-h-full w-full min-w-0 content-width-768 flex-col gap-6"
    >
      <section aria-label={t("Environments")} className="flex min-w-0 flex-col gap-2">
        <h3 className="text-sm font-medium">{t("Environments")}</h3>
        {error && <Notice error>{error}</Notice>}
        {!items && !error && <Loading>{t("Loading environments…")}</Loading>}
        {items && active.length === 0 && (
          <EmptyState compact>{t("No active environments.")}</EmptyState>
        )}
        {active.map((environment) => (
          <EnvironmentRow
            key={environment.id}
            api={api}
            environment={environment}
            onChange={update}
          />
        ))}
        {stopped.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger render={<Button variant="ghost" size="toolbar" />}>
              <ChevronRightIcon
                data-icon="inline-start"
                className="transition-transform in-[[data-panel-open]]:rotate-90"
              />
              {t("Stopped environments ({{count}})", { count: stopped.length })}
            </CollapsibleTrigger>
            <CollapsibleContent>
              {stopped.map((environment) => (
                <EnvironmentRow
                  key={environment.id}
                  api={api}
                  environment={environment}
                  onChange={update}
                />
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </section>
    </section>
  )
}
