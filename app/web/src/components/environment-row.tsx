import { ChevronRightIcon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { Api, WorktreeEnvironment } from "@/lib/api"
import { dependencyModeLabel } from "@/lib/dependency-modes"
import { CopyHandoff } from "./copy-handoff"
import { Notice } from "./feedback"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible"
import { ItemDescription } from "./ui/item"

export function EnvironmentRow({
  api,
  environment,
  onChange,
}: {
  api: Api
  environment: WorktreeEnvironment
  onChange: (environment: WorktreeEnvironment) => void
}) {
  const { t, i18n } = useTranslation()
  const needsRecovery =
    Boolean(environment.errors?.length) ||
    ["failed", "unavailable", "stop_failed"].includes(environment.state)
  const resources =
    environment.resources?.map((resource) => `${resource.kind}:${resource.id}`).join(", ") ||
    "none recorded"
  const recovery = needsRecovery
    ? {
        title: t("Copy recovery context"),
        summary: environment.errors?.join("\n") || t("Environment requires inspection."),
        fields: [
          [t("Environment"), environment.id],
          [t("State"), environment.state],
          [t("Worktree"), environment.target?.projectRoot ?? "not available in this record"],
          [t("Root services"), environment.selection?.services.join(", ") || "none recorded"],
          [t("Resources"), resources],
          [
            t("Retained diagnostics"),
            `environments/${environment.id}/preparation.log; environments/${environment.id}/services.log`,
          ],
        ] as Array<[string, string]>,
      }
    : null
  return (
    <Collapsible className="min-w-0 border-b last:border-b-0">
      <div className="flex min-w-0 flex-col gap-2 py-3">
        <CollapsibleTrigger
          aria-label={t("Environment details {{id}}", { id: environment.id })}
          render={
            <Button
              variant="ghost"
              size="toolbar"
              className="h-auto min-h-7 max-w-full self-start justify-start whitespace-normal text-left"
            />
          }
        >
          <ChevronRightIcon
            data-icon="inline-start"
            className="transition-transform in-[[data-panel-open]]:rotate-90"
          />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {environment.selection?.services.join(", ") || t("Environment")}
          </span>
        </CollapsibleTrigger>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <Badge variant="outline">{t(environment.state)}</Badge>
          <span className="text-xs text-muted-foreground">
            {environment.lifecycle === "manual" ? t("Container") : t("Automatic")}
          </span>
          <time dateTime={environment.createdAt} className="text-xs text-muted-foreground">
            {new Date(environment.createdAt).toLocaleString(i18n.resolvedLanguage)}
          </time>
          <EnvironmentRemoval api={api} environment={environment} onChange={onChange} />
        </div>
      </div>
      {Boolean(environment.errors?.length) && (
        <Notice error>
          <p className="whitespace-pre-wrap break-words">{environment.errors?.join("\n")}</p>
        </Notice>
      )}
      {recovery && (
        <CopyHandoff context={recovery}>
          <p className="text-sm">
            {t("Copy the recovery context for an Agent with access to this Redpact instance.")}
          </p>
        </CopyHandoff>
      )}
      <CollapsibleContent>
        <div className="flex min-w-0 flex-col gap-4 pb-4">
          <p className="text-xs text-muted-foreground break-all">
            {t("ID")}: <code>{environment.id}</code>
          </p>
          {environment.selection ? (
            <>
              <ItemDescription>
                {t("Root services")}: {environment.selection.services.join(", ")}
              </ItemDescription>
              <ul aria-label={t("Dependency modes")} className="divide-y text-sm">
                {Object.entries(environment.selection.select).map(([dependency, mode]) => (
                  <li key={dependency} className="flex min-w-0 flex-col gap-1 py-2">
                    <span className="[overflow-wrap:anywhere]">{dependency}</span>
                    <span className="text-xs text-muted-foreground">
                      {t(dependencyModeLabel(mode))}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <ItemDescription>{t("No recorded dependency selection.")}</ItemDescription>
          )}
          {Object.entries(environment.endpoints ?? {}).length > 0 && (
            <ul aria-label={t("Endpoints")} className="divide-y text-sm">
              {Object.entries(environment.endpoints ?? {}).map(([service, endpoint]) => (
                <li
                  key={service}
                  className="flex min-w-0 flex-col gap-1 py-2 [overflow-wrap:anywhere]"
                >
                  <span>{service}</span>
                  <code className="text-xs text-muted-foreground">
                    {endpoint.host}:{endpoint.port}
                  </code>
                </li>
              ))}
            </ul>
          )}
          {Boolean(environment.resources?.length) && (
            <ul aria-label={t("Resources")} className="divide-y text-sm">
              {environment.resources?.map((resource) => (
                <li
                  key={`${resource.kind}:${resource.id}`}
                  className="flex min-w-0 flex-col gap-2 py-3 [overflow-wrap:anywhere]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{resource.kind}</span>
                    <Badge variant="outline">{resource.status ?? "—"}</Badge>
                  </div>
                  <dl className="flex min-w-0 flex-col gap-2">
                    {(
                      [
                        ["ID", resource.id],
                        ["Service", resource.service],
                        ["Image", resource.image],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label} className="flex min-w-0 flex-col gap-0.5">
                        <dt className="text-xs text-muted-foreground">{t(label)}</dt>
                        <dd>
                          <code>{value ?? "—"}</code>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          )}

          <ItemDescription>
            {t(
              environment.state === "stopped"
                ? "Environment data removed. Logs and test results are kept."
                : "Removal deletes containers, volumes and captured files. Logs and test results are kept.",
            )}
          </ItemDescription>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function EnvironmentRemoval({
  api,
  environment,
  onChange,
}: {
  api: Api
  environment: WorktreeEnvironment
  onChange: (environment: WorktreeEnvironment) => void
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function remove() {
    setBusy(true)
    setError("")
    try {
      onChange(await api.stopEnvironment(environment.id))
    } catch (error) {
      setError(error instanceof Error ? error.message : t("Could not remove environment."))
    } finally {
      setBusy(false)
    }
  }
  if (environment.state === "stopped") {
    return null
  }
  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      <Button
        variant="outline"
        size="toolbar"
        title={t(
          "Removal deletes containers, volumes and captured files. Logs and test results are kept.",
        )}
        disabled={busy || environment.state === "stopping"}
        onClick={() => void remove()}
      >
        {t(environment.state === "stop_failed" ? "Retry removal" : "Remove environment")}
      </Button>
      {error && <Notice error>{error}</Notice>}
    </div>
  )
}
