import { FolderGit2, FolderOpen, MoreHorizontal, Plus } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { Api, Project, Worktree } from "@/lib/api"
import { ChoiceList } from "./choice-list"
import { ExecutionLog } from "./execution-log"
import { EmptyState, Loading, Notice } from "./feedback"
import { useLiveRevision } from "./live-updates"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/coss-tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { Field, FieldGroup, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"

type ManagedProject = Awaited<ReturnType<Api["managedProjects"]>>[number]
type Edit = { kind: "rename"; project: Project } | { kind: "connect"; path: string }

export function ProjectLibrary({
  api,
  open,
  onOpenChange,
  onChange,
  onOpen,
}: {
  api: Api
  open: boolean
  onOpenChange(open: boolean): void
  onChange(project: Project): void
  onOpen(project: Project, settings?: boolean): void
}) {
  const { t } = useTranslation()
  const [projects, setProjects] = useState<ManagedProject[] | null>(null)
  const [filter, setFilter] = useState("connected")
  const [search, setSearch] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [edit, setEdit] = useState<Edit | null>(null)
  const [name, setName] = useState("")
  const [disconnect, setDisconnect] = useState<Project | null>(null)
  const [history, setHistory] = useState<Project | null>(null)
  const lock = useRef(false)
  const picker = useRef<AbortController | null>(null)
  const liveRevision = useLiveRevision()
  useEffect(() => () => picker.current?.abort(), [])
  useEffect(() => {
    if (!open) {
      return
    }
    void revision
    void liveRevision
    const abort = new AbortController()
    api
      .managedProjects(abort.signal)
      .then((items) => {
        if (!abort.signal.aborted) {
          setProjects(items)
        }
      })
      .catch((cause) => {
        if (!abort.signal.aborted) {
          setError(cause instanceof Error ? cause.message : t("Could not load projects."))
        }
      })
    return () => abort.abort()
  }, [api, open, revision, liveRevision, t])
  async function mutate(operation: () => Promise<Project>) {
    if (lock.current) {
      return
    }
    lock.current = true
    setBusy(true)
    setError("")
    try {
      const project = await operation()
      setProjects((items) => {
        const previous = items?.find((item) => item.id === project.id)
        return [
          ...(items ?? []).filter((item) => item.id !== project.id),
          {
            ...project,
            projectRoot: previous?.projectRoot ?? null,
            available: previous?.available ?? true,
          },
        ]
      })
      onChange(project)
      setEdit(null)
      setDisconnect(null)
      setRevision((value) => value + 1)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t("The request failed. Refresh to check the current state."),
      )
    } finally {
      setBusy(false)
      lock.current = false
    }
  }
  async function chooseFolder() {
    if (lock.current) {
      return
    }
    lock.current = true
    setBusy(true)
    setError("")
    const abort = new AbortController()
    picker.current = abort
    try {
      const { path } = await api.pickDirectory(abort.signal)
      if (path && !abort.signal.aborted) {
        setName(path.split(/[\\/]/).filter(Boolean).at(-1) ?? "")
        setEdit({ kind: "connect", path })
      }
    } catch (cause) {
      if (!abort.signal.aborted) {
        setError(
          cause instanceof Error ? cause.message : t("Could not open the project. Try again."),
        )
      }
    } finally {
      picker.current = null
      lock.current = false
      setBusy(false)
    }
  }
  function visit(project: Project, settings = false) {
    onOpenChange(false)
    onOpen(project, settings)
  }
  const query = search.trim().toLocaleLowerCase()
  const visible = (projects ?? [])
    .filter(
      (project) =>
        Boolean(project.disconnectedAt) === (filter === "disconnected") &&
        `${project.name} ${project.projectRoot ?? ""}`.toLocaleLowerCase().includes(query),
    )
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) {
            onOpenChange(value)
          }
        }}
      >
        <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("Manage projects")}</DialogTitle>
            <DialogDescription>
              {t("Connect local folders and manage your project list.")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="min-w-0 flex-1"
              aria-label={t("Search projects")}
              placeholder={t("Search by name or path")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button disabled={busy} onClick={() => void chooseFolder()}>
              <Plus data-icon="inline-start" />
              {t("Connect project")}
            </Button>
          </div>
          <Tabs
            className="min-h-0"
            value={filter}
            onValueChange={(value) => setFilter(String(value))}
          >
            <TabsList className="shrink-0" aria-label={t("Projects")}>
              <TabsTrigger value="connected">{t("Connected")}</TabsTrigger>
              <TabsTrigger value="disconnected">{t("Disconnected")}</TabsTrigger>
            </TabsList>
            {error && !edit && !disconnect && <Notice error>{error}</Notice>}
            <TabsContent
              key={filter}
              value={filter}
              className="min-h-0 overflow-auto"
              aria-busy={busy}
            >
              {!projects && !error && <Loading>{t("Loading…")}</Loading>}
              {projects && visible.length === 0 && (
                <EmptyState>
                  {query ? t("No matching projects.") : t("No projects in this list.")}
                </EmptyState>
              )}
              <ul className="divide-y divide-border" aria-label={t("Projects")}>
                {visible.map((project) => (
                  <li key={project.id} className="flex min-w-0 items-start gap-3 py-4">
                    {project.location.kind === "git" ? (
                      <FolderGit2 className="mt-1 size-5 shrink-0 text-muted-foreground" />
                    ) : (
                      <FolderOpen className="mt-1 size-5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium">{project.name}</p>
                      <p className="mt-1 break-all text-sm text-muted-foreground">
                        {project.projectRoot ?? t("Original folder unavailable")}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="outline">
                          {project.location.kind === "git" ? "Git" : t("Folder")}
                        </Badge>
                        {!project.available && (
                          <Badge variant="secondary">{t("Folder unavailable")}</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {project.disconnectedAt ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || !project.available}
                          onClick={() => void mutate(() => api.reconnectProject(project.id))}
                        >
                          {t("Reconnect")}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => visit(project)}
                        >
                          {t("Open")}
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              disabled={busy}
                              aria-label={t("Actions for {{name}}", { name: project.name })}
                            />
                          }
                        >
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              onClick={() => {
                                setName(project.name)
                                setEdit({ kind: "rename", project })
                                setError("")
                              }}
                            >
                              {t("Rename")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setHistory(project)}>
                              {t("View history")}
                            </DropdownMenuItem>
                            {!project.disconnectedAt && (
                              <DropdownMenuItem onClick={() => visit(project, true)}>
                                {t("Project settings")}
                              </DropdownMenuItem>
                            )}
                            {!project.disconnectedAt && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    setDisconnect(project)
                                    setError("")
                                  }}
                                >
                                  {t("Disconnect")}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                ))}
              </ul>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(edit)}
        onOpenChange={(value) => {
          if (!value && !busy) {
            setEdit(null)
            setError("")
          }
        }}
      >
        <DialogContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (!edit || !name.trim()) {
                return
              }
              const draft = edit
              void mutate(() =>
                draft.kind === "rename"
                  ? api.renameProject(draft.project.id, name)
                  : api.connect(draft.path, name),
              )
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {edit?.kind === "rename" ? t("Rename project") : t("Connect project")}
              </DialogTitle>
              <DialogDescription>
                {t("The display name does not change the folder or project identity.")}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="managed-project-name">{t("Project name")}</FieldLabel>
                <Input
                  id="managed-project-name"
                  autoFocus
                  required
                  maxLength={200}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={busy}
                />
              </Field>
            </FieldGroup>
            {edit?.kind === "connect" && (
              <p className="break-all text-sm text-muted-foreground">{edit.path}</p>
            )}
            {error && <Notice error>{error}</Notice>}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setEdit(null)
                  setError("")
                }}
              >
                {t("Cancel")}
              </Button>
              <Button type="submit" disabled={busy || !name.trim()}>
                {t("Save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(disconnect)}
        onOpenChange={(value) => {
          if (!value && !busy) {
            setDisconnect(null)
            setError("")
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Disconnect project?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Disconnect {{name}}? Files, settings and execution history are kept. Automatic observation and new executions stop until you reconnect.",
                { name: disconnect?.name },
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <Notice error>{error}</Notice>}
          <AlertDialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setDisconnect(null)
                setError("")
              }}
            >
              {t("Cancel")}
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                if (disconnect) {
                  void mutate(() => api.disconnectProject(disconnect.id))
                }
              }}
            >
              {t("Disconnect")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {history && <ProjectHistory api={api} project={history} onClose={() => setHistory(null)} />}
    </>
  )
}

function ProjectHistory({
  api,
  project,
  onClose,
}: {
  api: Api
  project: Project
  onClose(): void
}) {
  const { t } = useTranslation()
  const [worktrees, setWorktrees] = useState<Worktree[] | null>(null)
  const [selected, setSelected] = useState("")
  const [error, setError] = useState("")
  useEffect(() => {
    const abort = new AbortController()
    api
      .worktrees(project.id, abort.signal)
      .then((items) => {
        if (!abort.signal.aborted) {
          setWorktrees(items)
          setSelected(items[0]?.id ?? "")
        }
      })
      .catch((cause) => {
        if (!abort.signal.aborted) {
          setError(String(cause))
        }
      })
    return () => abort.abort()
  }, [api, project.id])
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value) {
          onClose()
        }
      }}
    >
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("Project history")}</DialogTitle>
          <DialogDescription>{project.name}</DialogDescription>
        </DialogHeader>
        {error && <Notice error>{error}</Notice>}
        {!worktrees && !error && <Loading>{t("Loading…")}</Loading>}
        {worktrees?.length === 0 && <EmptyState>{t("No execution history.")}</EmptyState>}
        {Boolean(worktrees?.length) && (
          <ChoiceList
            compact
            label={t("Worktree")}
            value={selected}
            onValueChange={setSelected}
            options={(worktrees ?? []).map((item) => ({ value: item.id, label: item.projectRoot }))}
          />
        )}
        <div className="min-h-0 overflow-auto">
          {selected && <ExecutionLog key={selected} api={api} worktreeId={selected} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
