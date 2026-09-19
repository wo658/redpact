import { ChevronDownIcon, CircleHelpIcon } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { Api, DependencyMode, DependencySettings, SettingsIssue } from "@/lib/api"
import { dependencyModeLabel } from "@/lib/dependency-modes"
import { DataTable } from "./data-table"
import { DependencyOverview, ModeAssessments } from "./dependency-overview"
import { EnvironmentEditor } from "./environment-editor"
import { EmptyState, Notice } from "./feedback"
import { useLiveRevision } from "./live-updates"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import {
  TabsPanel as ModePanel,
  TabsTab as ModeTab,
  Tabs as ModeTabs,
  TabsList as ModeTabsList,
} from "./ui/coss-tabs"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { Empty } from "./ui/empty"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "./ui/item"
import { Skeleton } from "./ui/skeleton"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table"

export function ProjectDependencies({ api, projectId }: { api: Api; projectId: string }) {
  const { t } = useTranslation()
  return (
    <section aria-label={t("Project dependencies")} className="flex min-w-0 flex-1 flex-col gap-4">
      <ModeTabs key={projectId} defaultValue="overview" className="min-w-0 gap-4">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <ModeTabsList variant="view" aria-label={t("Project dependency views")}>
            <ModeTab value="overview">{t("Overview")}</ModeTab>
            <ModeTab value="configuration">{t("Configuration")}</ModeTab>
          </ModeTabsList>
          <DependencyHelp />
        </div>
        <DependencyRead api={api} projectId={projectId} />
      </ModeTabs>
    </section>
  )
}

function DependencyHelp() {
  const { t } = useTranslation()
  return (
    <Dialog>
      <DialogTrigger
        aria-label={t("About dependency modes and environment overrides")}
        render={<Button variant="ghost" size="icon-sm" />}
      >
        <CircleHelpIcon aria-hidden="true" />
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>{t("Dependency modes and environment overrides")}</DialogTitle>
          <DialogDescription>
            {t(
              "All worktrees share the dependency definitions in the primary checkout's .redpact/settings.json. Changes here apply to future environments across the project; existing environments keep their captured settings.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <h3 className="font-medium">{t("Dependency modes")}</h3>
            <p>
              {t(
                "Browse a dependency and its modes here. Browsing does not change execution choices. Each worktree selects one mode per dependency in Environment and saves its own selection.",
              )}
            </p>
            <p>
              {t(
                "Per-environment creates and cleans up real dependency services for each environment. Shared local connects to an existing local service; Remote connection connects to a remote service. Mock uses an implemented substitute in the app or a mock container. Connection modes do not manage dependency services.",
              )}
            </p>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="font-medium">{t("Environment overrides")}</h3>
            <ul className="flex list-disc flex-col gap-2 pl-5">
              <li>
                {t(
                  "Values apply to the named Compose service. Explicit values replace existing defaults; omitted variables keep their existing values. An empty string is still a value.",
                )}
              </li>
              <li>{t("Use unset to remove a variable entirely, including its image default.")}</li>
              <li>
                {t(
                  "Selected modes cannot write or unset the same variable on the same service, even if their values match. Choose modes without conflicting overrides.",
                )}
              </li>
              <li>
                {t(
                  "An environment override does not start its target service. That service must already be included in the execution selection, a selected mode, or Compose prerequisites.",
                )}
              </li>
              <li>
                {t(
                  "A secret reference uses a project credential supplied in this Redpact instance, with server environment fallback when no project value is saved. An explicitly saved blank blocks fallback. Required missing credentials block execution.",
                )}
              </li>
            </ul>
          </section>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{t("Close")}</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DependencyLoading() {
  const { t } = useTranslation()
  return (
    <div
      role="status"
      aria-label={t("Loading dependencies…")}
      className="flex w-full min-w-0 content-width-768 flex-col gap-3 [overflow-wrap:anywhere]"
    >
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-48 w-full" />
    </div>
  )
}

function DependencyRead({ api, projectId }: { api: Api; projectId: string }) {
  const { t } = useTranslation()
  const [result, setResult] = useState<DependencySettings | null>(null)
  const [error, setError] = useState("")
  const liveRevision = useLiveRevision()
  const [saved, setSaved] = useState(0)
  useEffect(() => {
    void liveRevision
    void saved
    const abort = new AbortController()
    void api
      .projectDependencies(projectId, abort.signal)
      .then((next) => {
        if (!abort.signal.aborted) {
          setError("")
          setResult(next)
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          setError(error instanceof Error ? error.message : t("Dependency settings unavailable."))
        }
      })
    return () => abort.abort()
  }, [api, liveRevision, saved, projectId, t])
  if (error) {
    return <Notice error>{error}</Notice>
  }
  if (!result) {
    return <DependencyLoading />
  }
  if (!result.valid) {
    return (
      <Empty className="min-h-24 p-6">
        <div className="w-full content-width-640 text-left">
          <Notice error>
            <p>{t("Ask your agent to update the settings file.")}</p>
            <code className="break-all">{result.file}</code>
            <Diagnostics issues={result.issues} />
          </Notice>
        </div>
      </Empty>
    )
  }
  return (
    <>
      <ModePanel value="overview">
        <DependencyOverview settings={result} />
      </ModePanel>
      <ModePanel value="configuration">
        <DependencyCatalog
          dependencies={result.dependencies ?? {}}
          renderEnvironment={(dependency, modeName, mode) => (
            <EnvironmentEditor
              key={`${dependency}:${modeName}`}
              api={api}
              projectId={projectId}
              dependency={dependency}
              modeName={modeName}
              mode={mode}
              refresh={() => setSaved((value) => value + 1)}
            />
          )}
        />
      </ModePanel>
    </>
  )
}

function Diagnostics({ issues }: { issues: SettingsIssue[] }) {
  return (
    <ItemGroup>
      {issues.map((issue) => (
        <Item key={`${issue.file}:${issue.path}:${issue.code}:${issue.message}`} size="xs">
          <ItemContent>
            <ItemTitle>{issue.message}</ItemTitle>
            <ItemDescription className="break-all">
              <code>
                {issue.file}
                {issue.line === undefined ? "" : `:${issue.line}`}
                {issue.column === undefined ? "" : `:${issue.column}`} · {issue.path} · {issue.code}
              </code>
            </ItemDescription>
            {issue.related && <Diagnostics issues={issue.related} />}
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  )
}

export function DependencyCatalog({
  dependencies,
  renderEnvironment,
}: {
  renderEnvironment?: (dependency: string, modeName: string, mode: DependencyMode) => ReactNode
  dependencies: NonNullable<DependencySettings["dependencies"]>
}) {
  const { t } = useTranslation()
  const [selection, setSelection] = useState({ dependency: "", mode: "" })
  const names = Object.keys(dependencies)
  const name = names.includes(selection.dependency) ? selection.dependency : names[0]
  if (!name) {
    return <EmptyState>{t("No dependencies declared.")}</EmptyState>
  }
  const modes = dependencies[name].modes
  const mode = Object.hasOwn(modes, selection.mode) ? selection.mode : Object.keys(modes)[0]
  return (
    <ModeTabs
      value={mode}
      onValueChange={(value) => setSelection({ dependency: name, mode: String(value) })}
      className="min-w-0 gap-4"
    >
      <fieldset
        aria-label={t("Dependencies")}
        className="flex min-w-0 flex-wrap items-center gap-3"
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t("Select dependency")}
            render={<Button variant="outline" className="max-w-full" />}
          >
            <span className="truncate">{name}</span>
            <ChevronDownIcon data-icon="inline-end" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-48 max-w-(--available-width)">
            <DropdownMenuRadioGroup
              value={name}
              onValueChange={(value) => setSelection({ dependency: String(value), mode: "" })}
            >
              {names.map((dependency) => (
                <DropdownMenuRadioItem key={dependency} value={dependency} closeOnClick>
                  {dependency}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="min-w-0 max-w-full overflow-x-auto">
          <ModeTabsList aria-label={t("Dependency modes")} activateOnFocus>
            {Object.keys(modes).map((value) => (
              <ModeTab key={value} value={value}>
                {t(dependencyModeLabel(value))}
              </ModeTab>
            ))}
          </ModeTabsList>
        </div>
      </fieldset>
      {!Object.keys(modes).length && <ModeAssessments dependency={dependencies[name]} />}
      {Object.entries(modes).map(([value, definition]) => (
        <ModePanel key={`${name}:${value}`} value={value}>
          <ModeDefinition mode={definition}>
            {renderEnvironment?.(name, value, definition)}
          </ModeDefinition>
        </ModePanel>
      ))}
    </ModeTabs>
  )
}

function ModeDefinition({ mode, children }: { mode: DependencyMode; children?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="flex w-full min-w-0 content-width-768 flex-col gap-3 [overflow-wrap:anywhere]">
      {!!mode.services?.length && (
        <div>
          <p className="text-sm text-muted-foreground">{t("Additional services")}</p>
          <ul>
            {mode.services.map((service) => (
              <li key={service}>
                <code>{service}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {children ?? <EnvironmentOverrides env={mode.env ?? {}} />}
    </div>
  )
}

function EnvironmentOverrides({ env }: { env: NonNullable<DependencyMode["env"]> }) {
  const { t } = useTranslation()
  const targets = Object.entries(env)
  if (!targets.length) {
    return <EmptyState compact>{t("No environment overrides.")}</EmptyState>
  }
  return (
    <ul className="flex min-w-0 flex-col divide-y divide-border">
      {targets.map(([name, values]) => (
        <li key={name} className="min-w-0 py-4 first:pt-0 last:pb-0">
          <section aria-label={name} className="flex min-w-0 flex-col gap-2">
            <h4 className="break-all text-sm font-medium">
              <code>{name}</code>
            </h4>
            <OverrideTable values={values} />
          </section>
        </li>
      ))}
    </ul>
  )
}

function OverrideTable({ values }: { values: NonNullable<DependencyMode["env"]>[string] }) {
  const { t } = useTranslation()
  const rows = Object.entries(values)
  function renderBinding(value: string | { secret: string } | { unset: true }) {
    if (typeof value === "string") {
      if (value === "") {
        return <Badge variant="outline">{t("Empty string")}</Badge>
      }
      return <code>{value}</code>
    }
    if ("secret" in value) {
      return (
        <span className="flex flex-wrap items-center gap-1">
          <Badge variant="outline">{t("Secret reference")}</Badge>
          <code>{value.secret}</code>
        </span>
      )
    }
    return <Badge variant="outline">{t("Unset")}</Badge>
  }
  if (!rows.length) {
    return <EmptyState compact>{t("No environment overrides.")}</EmptyState>
  }
  return (
    <DataTable width="wide" aria-label={t("Environment overrides")} className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[min(35%,16rem)]">{t("key")}</TableHead>
          <TableHead>{t("value")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(([variable, value]) => (
          <TableRow key={variable}>
            <TableCell className="whitespace-normal break-all">
              <code>{variable}</code>
            </TableCell>
            <TableCell className="whitespace-pre-wrap [overflow-wrap:anywhere]">
              {renderBinding(value)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </DataTable>
  )
}
