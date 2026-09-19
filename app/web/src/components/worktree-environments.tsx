import { ChevronRightIcon } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { Api, DependencySettings, TestSelection, WorktreeEnvironment } from "@/lib/api"
import { dependencyModeLabel } from "@/lib/dependency-modes"
import { EnvironmentRow } from "./environment-row"
import { EmptyState, Loading, Notice } from "./feedback"
import { LiveUpdates, useLiveRevision } from "./live-updates"
import { SearchPicker } from "./search-picker"
import { Button } from "./ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible"
import { Field, FieldGroup, FieldLabel, FieldSet, FieldTitle } from "./ui/field"
import { Separator } from "./ui/separator"

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
      <SelectionForm api={api} worktreeId={worktreeId} />
      <Separator />
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

export function SelectionForm({
  api,
  worktreeId,
  projectId,
}: {
  api: Api
  worktreeId: string
  projectId?: string
}) {
  const { t } = useTranslation()
  const revision = useLiveRevision()
  const id = useId()
  const dirty = useRef(false)
  const title = projectId ? "Integration defaults" : "Worktree selection"
  const [catalog, setCatalog] = useState<DependencySettings | null>(null)
  const [draft, setDraft] = useState<TestSelection>({ services: [], select: {} })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    void revision
    const abort = new AbortController()
    void Promise.all([
      api.worktreeDependencies(worktreeId, abort.signal),
      projectId
        ? api.projectIntegrationDefaults(projectId, abort.signal)
        : api.worktreeSelection(worktreeId, abort.signal),
    ])
      .then(([catalog, current]) => {
        if (abort.signal.aborted) {
          return
        }
        setCatalog(catalog)
        if (!dirty.current) {
          setDraft(current.selection ?? { services: [], select: {} })
        }
        setError("")
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          setError(error instanceof Error ? error.message : t("Selection unavailable."))
        }
      })
    return () => abort.abort()
  }, [api, worktreeId, projectId, revision, t])
  const services = catalog?.services ?? []
  const dependencies = catalog?.dependencies ?? {}
  const unavailable =
    draft.services.some((service) => !services.includes(service)) ||
    Object.entries(draft.select).some(([name, mode]) => !dependencies[name]?.modes[mode])
  const complete =
    catalog?.valid &&
    draft.services.length > 0 &&
    !unavailable &&
    Object.keys(dependencies).every((name) => Boolean(dependencies[name].modes[draft.select[name]]))
  function edit(next: TestSelection) {
    dirty.current = true
    setSaved(false)
    setDraft(next)
  }
  async function save() {
    setBusy(true)
    setError("")
    try {
      const result = projectId
        ? await api.setProjectIntegrationDefaults(projectId, draft)
        : await api.setWorktreeSelection(worktreeId, draft)
      setDraft(result.selection)
      dirty.current = false
      setSaved(true)
    } catch (error) {
      setError(error instanceof Error ? error.message : t("Could not save selection."))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="w-full min-w-0 content-width-768"
      aria-label={t(title)}
      onSubmit={(event) => {
        event.preventDefault()
        if (complete && !busy) {
          void save()
        }
      }}
    >
      <FieldSet disabled={busy}>
        <legend className="sr-only">{t(title)}</legend>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-medium">{t(title)}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="outline" size="toolbar" disabled={!complete || busy}>
              {t(busy ? "Saving…" : "Save selection")}
            </Button>
          </div>
        </div>
        {error && <Notice error>{error}</Notice>}
        {!catalog && !error && <Loading>{t("Loading selection…")}</Loading>}
        {catalog && !catalog.valid && (
          <Notice error>{catalog.issues.map((issue) => issue.message).join("; ")}</Notice>
        )}
        {catalog?.valid && (
          <FieldGroup>
            <Field>
              <FieldTitle className="[overflow-wrap:anywhere]">{t("Root services")}</FieldTitle>
              <fieldset className="flex min-w-0 flex-wrap gap-2" aria-label={t("Root services")}>
                {services.map((service) => (
                  <Button
                    key={service}
                    type="button"
                    size="sm"
                    className="h-auto min-h-7 max-w-full whitespace-normal [overflow-wrap:anywhere]"
                    variant={draft.services.includes(service) ? "secondary" : "outline"}
                    aria-pressed={draft.services.includes(service)}
                    onClick={() =>
                      edit({
                        ...draft,
                        services: draft.services.includes(service)
                          ? draft.services.filter((name) => name !== service)
                          : [...draft.services, service],
                      })
                    }
                  >
                    {service}
                  </Button>
                ))}
              </fieldset>
            </Field>
            {Object.keys(dependencies).length > 0 && (
              <fieldset aria-label={t("Dependency modes")} className="min-w-0">
                <FieldGroup className="gap-0 divide-y">
                  {Object.entries(dependencies).map(([name, definition]) => (
                    <Field key={name} className="min-w-0 gap-2 py-3">
                      <FieldLabel htmlFor={`${id}-${name}`} className="[overflow-wrap:anywhere]">
                        {name}
                      </FieldLabel>
                      <div className="w-full max-w-64">
                        <SearchPicker
                          id={`${id}-${name}`}
                          label={name}
                          options={Object.keys(definition.modes).map((mode) => ({
                            value: mode,
                            label: t(dependencyModeLabel(mode)),
                          }))}
                          value={draft.select[name] ?? ""}
                          disabled={busy}
                          searchable={Object.keys(definition.modes).length > 5}
                          onValueChange={(mode) =>
                            edit({ ...draft, select: { ...draft.select, [name]: mode } })
                          }
                        />
                      </div>
                    </Field>
                  ))}
                </FieldGroup>
              </fieldset>
            )}
            {unavailable && (
              <Notice error>
                <p>
                  {t(
                    "Some saved choices are unavailable. Remove them and select available services and modes.",
                  )}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    edit({
                      services: draft.services.filter((name) => services.includes(name)),
                      select: Object.fromEntries(
                        Object.entries(draft.select).filter(
                          ([name, mode]) => dependencies[name]?.modes[mode],
                        ),
                      ),
                    })
                  }
                >
                  {t("Remove unavailable choices")}
                </Button>
              </Notice>
            )}
            {saved && (
              <p role="status" className="text-sm text-muted-foreground">
                {t("Selection saved.")}
              </p>
            )}
          </FieldGroup>
        )}
      </FieldSet>
    </form>
  )
}
