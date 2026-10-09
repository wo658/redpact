import type { TFunction } from "i18next"
import {
  ActivityIcon,
  ArrowLeft,
  ArrowRight,
  Blocks,
  Container,
  FlaskConical,
  FolderGit2,
  GitBranch,
  History,
  Settings2,
  Wrench,
} from "lucide-react"
import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { desktopPlatform } from "@/lib/desktop"
import { useRefreshRequest } from "@/lib/use-refresh-request"
import { cn } from "@/lib/utils"
import { useWordWrap } from "@/lib/word-wrap"
import { worktreeName } from "@/lib/worktree-name"
import { ApprovalSettings } from "./approval-settings"
import { AuthoredSettings } from "./authored-settings"
import { BranchReview } from "./branch-review"
import { ProjectDependencies } from "./dependency-viewer"
import {
  CheckoutSelector,
  CurrentWork,
  ExecutionHistory,
  ExecutionReview,
} from "./execution-workspace"
import { EmptyState, Notice } from "./feedback"
import { LanguageSelector } from "./language-selector"
import { LiveUpdates, useLiveRevision } from "./live-updates"
import { ProjectLibrary } from "./project-library"
import { ProjectSettings } from "./project-settings"
import { ProjectStart } from "./project-start"
import { ProjectTestContainer } from "./project-test-container"
import { ProjectTests } from "./project-tests"
import { SettingsRow, SettingsSection } from "./settings-row"
import { ThemeSettings } from "./theme-settings"
import { Button } from "./ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "./ui/sidebar"
import { Switch } from "./ui/switch"
import { TooltipProvider } from "./ui/tooltip"
import { useWorktreeDisplay, WorktreeDisplayOptions } from "./worktree-display"
import "@/locales"
import { ChevronDown } from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { WorktreeReview } from "@/components/worktree-review"
import { type Api, ApiError, type Project, type WorkStartInput, type Worktree } from "@/lib/api"

import {
  type WorkspacePage as Page,
  readWorkspaceHistory,
  readWorkspaceLocation,
  type WorkspaceTab,
  type WorkspaceView,
  writeWorkspaceHistory,
} from "@/lib/workspace-history"

function initialProject(projects: Project[]) {
  try {
    const saved = localStorage.getItem("redpact:project")
    if (projects.some((project) => project.id === saved)) {
      return saved ?? ""
    }
  } catch {
    // Browser storage is optional; connected projects remain accessible.
  }
  return projects[0]?.id ?? ""
}

function failure(error: unknown, t: TFunction) {
  if (
    error instanceof ApiError &&
    error.details &&
    typeof error.details === "object" &&
    "recovery" in error.details
  ) {
    const recovery = error.details.recovery
    if (
      recovery &&
      typeof recovery === "object" &&
      "nextStep" in recovery &&
      typeof recovery.nextStep === "string"
    ) {
      return `${error.message}. ${recovery.nextStep}`
    }
  }
  return error instanceof Error
    ? error.message
    : t("The request failed. Refresh to check the current state.")
}

export function ProjectManager({ api, initialProjects }: { api: Api; initialProjects: Project[] }) {
  const [location, setLocation] = useState(() =>
    typeof window === "undefined" ? undefined : readWorkspaceLocation(window.location.search),
  )
  useEffect(() => {
    const restore = () => setLocation(readWorkspaceLocation(window.location.search))
    window.addEventListener("popstate", restore)
    return () => window.removeEventListener("popstate", restore)
  }, [])
  if (
    location?.view.page === "execution-review" &&
    location.view.execution &&
    !initialProjects.some((project) => project.id === location.projectId)
  ) {
    return (
      <main className="h-dvh min-w-0 overflow-auto p-4">
        <ExecutionReview
          key={`${location.view.execution.kind}:${location.view.execution.id}`}
          api={api}
          execution={location.view.execution}
          onHistory={() => {
            window.history.pushState(null, "", window.location.pathname)
            setLocation(undefined)
          }}
        />
      </main>
    )
  }
  return <ProjectWorkspace api={api} initialProjects={initialProjects} />
}

function ProjectWorkspace({ api, initialProjects }: { api: Api; initialProjects: Project[] }) {
  const { t } = useTranslation()

  const [projects, setProjects] = useState(initialProjects)
  const [manageOpen, setManageOpen] = useState(false)
  const [initialTab] = useState<WorkspaceTab | undefined>(() => {
    const location =
      typeof window === "undefined" ? undefined : readWorkspaceLocation(window.location.search)
    const saved =
      typeof window === "undefined" ? undefined : readWorkspaceHistory(window.history.state)
    const project =
      initialProjects.find(
        (item) =>
          item.id === (location?.projectId ?? saved?.projectId ?? initialProject(initialProjects)),
      ) ?? initialProjects[0]
    if (!project) {
      return undefined
    }
    return {
      id: `project:${project.id}`,
      kind: "project",
      label: project.name,
      projectId: project.id,
      view: location?.view ?? saved?.view ?? { page: "current", selectedId: "" },
    }
  })
  const [destination, setDestination] = useState(initialTab)
  const selectedId = destination?.projectId ?? ""
  function setSelectedId(select: string | ((id: string) => string)) {
    const id = typeof select === "function" ? select(selectedId) : select
    const project = projects.find((item) => item.id === id)
    if (project && id !== selectedId) {
      setDestination({
        id: `project:${id}`,
        kind: "project",
        label: project.name,
        projectId: id,
        view: { page: "current", selectedId: "" },
      })
    }
  }
  useEffect(() => {
    if (initialTab) {
      writeWorkspaceHistory(initialTab, true)
    }
  }, [initialTab])
  useEffect(() => {
    function restore(event: PopStateEvent) {
      const tab = readWorkspaceHistory(event.state)
      if (tab && projects.some((project) => project.id === tab.projectId)) {
        setDestination(tab)
      }
    }
    window.addEventListener("popstate", restore)
    return () => window.removeEventListener("popstate", restore)
  }, [projects])
  function visitWorkspace(tab: WorkspaceTab) {
    writeWorkspaceHistory(tab)
    setDestination(tab)
    setError("")
  }
  const pickerRequest = useRef<AbortController | null>(null)
  useEffect(() => () => pickerRequest.current?.abort(), [])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    try {
      if (selectedId) {
        localStorage.setItem("redpact:project", selectedId)
      } else {
        localStorage.removeItem("redpact:project")
      }
    } catch {
      // Session selection still works when persistence is unavailable.
    }
  }, [selectedId])
  const liveRevision = useLiveRevision()
  useEffect(() => {
    if (!liveRevision) {
      return
    }
    const abort = new AbortController()
    void api
      .projects(abort.signal)
      .then((items) => {
        if (!abort.signal.aborted) {
          setProjects(items)
          setDestination((current) => {
            if (items.some((item) => item.id === current?.projectId)) {
              return current
            }
            const project = items[0]
            return project
              ? {
                  id: `project:${project.id}`,
                  kind: "project",
                  label: project.name,
                  projectId: project.id,
                  view: { page: "current", selectedId: "" },
                }
              : undefined
          })
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          setError(failure(error, t))
        }
      })
    return () => abort.abort()
  }, [api, liveRevision, t])
  const selected = projects.find((project) => project.id === selectedId)
  function selectProject(id: string, knownProject?: Project) {
    const project = knownProject ?? projects.find((item) => item.id === id)
    if (project) {
      visitWorkspace({
        id: `project:${id}`,
        kind: "project",
        label: project.name,
        projectId: id,
        view: { page: "current", selectedId: "" },
      })
    }
  }
  const lock = useRef(false)
  async function update(operation: () => Promise<Project | undefined>) {
    if (lock.current) {
      return
    }
    lock.current = true
    setPending(true)
    setError("")
    try {
      const project = await operation()
      if (!project) {
        return
      }
      setProjects((items) => [...items.filter((item) => item.id !== project.id), project])
      selectProject(project.id, project)
      try {
        const items = await api.projects()
        setProjects(items)
        setSelectedId((id) => (items.some((item) => item.id === id) ? id : (items[0]?.id ?? "")))
      } catch (error) {
        setError(
          t("Project connected. List refresh failed: {{error}}", { error: failure(error, t) }),
        )
      }
    } catch (error) {
      setError(failure(error, t))
    } finally {
      lock.current = false
      setPending(false)
    }
  }
  const projectMenu = (
    <div className="flex flex-col gap-2">
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  size="default"
                  tooltip={selected?.name ?? t("Select a project")}
                />
              }
              disabled={pending}
            >
              <span className="truncate group-data-[collapsible=icon]:sr-only">
                {selected?.name ?? t("Select a project")}
              </span>
              <ChevronDown
                aria-hidden="true"
                className="ml-auto group-data-[collapsible=icon]:hidden"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuRadioGroup
                value={selectedId}
                onValueChange={(id) => {
                  selectProject(id)
                }}
              >
                {projects.map((project) => (
                  <DropdownMenuRadioItem key={project.id} value={project.id}>
                    {project.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              {projects.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setManageOpen(true)}>
                  {t("Manage projects")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void update(async () => {
                      const controller = new AbortController()
                      pickerRequest.current = controller
                      try {
                        const { path } = await api.pickDirectory(controller.signal)
                        if (controller.signal.aborted || path === null) {
                          return
                        }
                        return await api.connect(path)
                      } finally {
                        pickerRequest.current = null
                      }
                    })
                  }
                >
                  {t("Connect project")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      {error && (
        <div className="group-data-[collapsible=icon]:sr-only">
          <Notice error>{error}</Notice>
        </div>
      )}
    </div>
  )
  const management = (
    <ProjectLibrary
      api={api}
      open={manageOpen}
      onOpenChange={setManageOpen}
      onChange={(project) =>
        setProjects((items) => {
          const remaining = items.filter((item) => item.id !== project.id)
          return project.disconnectedAt ? remaining : [...remaining, project]
        })
      }
      onOpen={(project, settings) => {
        if (settings) {
          visitWorkspace({
            id: `project:${project.id}`,
            kind: "project",
            projectId: project.id,
            label: project.name,
            view: { page: "project-settings", selectedId: "" },
          })
        } else {
          selectProject(project.id, project)
        }
      }}
    />
  )
  if (!selected) {
    return (
      <>
        {management}
        <ProjectStart
          onManage={() => setManageOpen(true)}
          pickDirectory={api.pickDirectory}
          pending={pending}
          error={error}
          onConnect={(path, name) => update(() => api.connect(path, name))}
        />
      </>
    )
  }
  return (
    <>
      {management}
      <TooltipProvider>
        <SidebarProvider defaultOpen allowDesktopToggle className="h-dvh min-h-0 overflow-hidden">
          <LiveUpdates projectId={selected.id}>
            <WorktreePanel
              key={selected.id}
              project={selected}
              api={api}
              projectMenu={projectMenu}
              view={destination?.view ?? { page: "current", selectedId: "" }}
              onViewChange={(view) =>
                visitWorkspace({
                  id: `project:${selected.id}`,
                  kind: "project",
                  label: selected.name,
                  projectId: selected.id,
                  view,
                })
              }
            />
          </LiveUpdates>
        </SidebarProvider>
      </TooltipProvider>
    </>
  )
}

export function WorktreePanel({
  active = true,
  api,
  project,
  projectMenu,
  view,
  onViewChange,
  initialPage = "current",
  initialSelectedId = "",
}: {
  view?: WorkspaceView
  onViewChange?: (view: WorkspaceView) => void
  active?: boolean
  initialPage?: Page
  initialSelectedId?: string
  api: Api
  project: Project
  projectMenu: ReactNode
}) {
  const { t } = useTranslation()
  const { isMobile, open, openMobile, setOpenMobile } = useSidebar()

  const [worktrees, setWorktrees] = useState<Worktree[]>([])
  const nativeDesktop = desktopPlatform() !== undefined
  const [navigation, setNavigation] = useState<WorkspaceView>({
    page: initialPage,
    selectedId: initialSelectedId,
  })
  const { page, selectedId, execution } = view ?? navigation
  function setPage(nextPage: Page, worktreeId = selected?.id ?? selectedId) {
    const next = { page: nextPage, selectedId: worktreeId }
    if (onViewChange) {
      onViewChange(next)
    } else {
      setNavigation(next)
    }
    setOpenMobile(false)
  }
  function openExecution(
    kind: "unit" | "integration" | "playwright",
    id: string,
    worktreeId = selected?.id ?? selectedId,
  ) {
    const next: WorkspaceView = {
      page: "execution-review",
      selectedId: worktreeId,
      execution: { kind, id },
    }
    if (onViewChange) {
      onViewChange(next)
    } else {
      setNavigation(next)
    }
    setOpenMobile(false)
  }
  const setSelectedId = useCallback((select: (id: string) => string) => {
    setNavigation((current) => ({ ...current, selectedId: select(current.selectedId) }))
  }, [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const liveRevision = useLiveRevision()
  const settingsTitle = page === "project-settings" ? t("Project settings") : t("Settings")
  const fillsFrame = ["review", "tests"].includes(page)
  const isSettings = page === "settings" || page === "project-settings"
  const requestKey = `redpact:work-start:${project.id}`
  const [retry] = useState<WorkStartInput | null>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(requestKey) ?? "null")
      return saved?.projectId === project.id &&
        ["requestId", "intent", "baseRef", "branch", "path"].every(
          (key) => typeof saved[key] === "string",
        )
        ? saved
        : null
    } catch {
      return null
    }
  })
  const display = useWorktreeDisplay(
    api,
    project.id,
    project.location.kind === "git",
    () => setRevision((v) => v + 1),
    revision,
  )
  const selectedBranch =
    display.tracking?.showBranches && selectedId.startsWith("branch:") ? selectedId.slice(7) : ""
  const selected =
    worktrees.find((worktree) => worktree.id === selectedId) ??
    (!selectedId.startsWith("branch:") || !display.tracking?.showBranches
      ? worktrees[0]
      : undefined)
  const refreshWorktrees = useCallback(
    async (signal: AbortSignal) => {
      try {
        const items = await api.worktrees(project.id, signal)
        if (!signal.aborted) {
          setWorktrees(items)
          setSelectedId((id) =>
            id.startsWith("branch:") || items.some((item) => item.id === id)
              ? id
              : (items[0]?.id ?? ""),
          )
        }
      } catch (error) {
        if (!signal.aborted) {
          setError(failure(error, t))
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false)
        }
      }
    },
    [api, project.id, t, setSelectedId],
  )
  useRefreshRequest(refreshWorktrees, liveRevision, revision)

  const notices = (
    <>
      {error && <Notice error>{error}</Notice>}
      {display.error && <Notice error>{display.error}</Notice>}
      {retry && (
        <Notice>
          {t(
            "A previous worktree creation needs attention. Ask your agent to inspect request {{id}}.",
            { id: retry.requestId },
          )}
        </Notice>
      )}
    </>
  )

  return (
    <>
      {(!isMobile || active) && (
        <WorktreeSidebar
          key={project.id}
          projectMenu={projectMenu}
          onCurrent={() => setPage("current")}
          currentActive={page === "current"}
          onHistory={() => setPage("history")}
          historyActive={page === "history" || page === "execution-review"}
          toolsActive={!["current", "history", "execution-review"].includes(page)}
          displayOptions={
            project.location.kind === "git" ? (
              <WorktreeDisplayOptions display={display} />
            ) : undefined
          }
          branchItems={display.tracking?.showBranches ? display.branches : []}
          worktrees={worktrees}
          selectedId={page === "review" ? (selected?.id ?? selectedId) : ""}
          pending={false}
          loading={loading}
          onDependencies={() => {
            setPage("dependencies")
          }}
          dependenciesActive={page === "dependencies"}
          onTestContainer={() => setPage("test-container")}
          testContainerActive={page === "test-container"}
          onTests={() => setPage("tests")}
          testsActive={page === "tests"}
          onSettings={() => {
            setPage("settings")
          }}
          settingsActive={page === "settings"}
          onProjectSettings={() => setPage("project-settings")}
          projectSettingsActive={page === "project-settings"}
          onSelect={(id) => {
            setPage("review", id)
          }}
          onRefresh={() => {
            setError("")
            setRevision((value) => value + 1)
          }}
        />
      )}
      {nativeDesktop && (
        <div className="native-sidebar-toolbar flex items-center gap-2" data-tauri-drag-region>
          {(!isMobile || !openMobile) && <SidebarTrigger />}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("Go back")}
            title={t("Go back")}
            onClick={() => window.history.back()}
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("Go forward")}
            title={t("Go forward")}
            onClick={() => window.history.forward()}
          >
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:my-2 md:mr-2 md:peer-data-[state=collapsed]:ml-2">
        {!nativeDesktop && (isMobile ? !openMobile : !open) && (
          <div className="sidebar-reopen flex shrink-0 px-2 pb-2">
            <SidebarTrigger />
          </div>
        )}
        <SidebarInset
          className={cn(
            "min-h-0 min-w-0 overflow-auto md:rounded-xl md:ring-1 md:ring-border",
            (page === "review" || page === "tests") && "overflow-hidden",
          )}
        >
          {page === "project-settings" ? (
            <ProjectSettings
              api={api}
              project={project}
              onChange={() => setRevision((value) => value + 1)}
            >
              {notices}
            </ProjectSettings>
          ) : (
            <section
              aria-label={isSettings ? settingsTitle : undefined}
              className={cn(
                "min-w-0 flex flex-col",
                fillsFrame && "content-width-wide gap-0 overflow-hidden",
                !fillsFrame && !isSettings && "gap-4 p-4",
                (page === "review" || page === "tests" || page === "dependencies") &&
                  "min-h-0 flex-1",
                isSettings && "settings-page gap-8",
              )}
            >
              {isSettings && (
                <header className="pb-2">
                  <h1 className="text-2xl font-semibold">{settingsTitle}</h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("Make Redpact feel right for you.")}
                  </p>
                </header>
              )}
              {notices}
              {["current", "history", "review"].includes(page) && (
                <CheckoutSelector
                  worktrees={worktrees}
                  selectedId={selected?.id ?? selectedId}
                  onSelect={(id) => setPage(page, id)}
                />
              )}
              {page === "current" && (
                <CurrentWork
                  api={api}
                  worktree={selected}
                  loading={loading}
                  onReview={openExecution}
                />
              )}
              {page === "history" && (
                <ExecutionHistory
                  api={api}
                  worktree={selected}
                  loading={loading}
                  onReview={openExecution}
                />
              )}
              {page === "execution-review" && execution && (
                <ExecutionReview
                  key={`${execution.kind}:${execution.id}`}
                  api={api}
                  execution={execution}
                  onHistory={() => setPage("history")}
                />
              )}
              {page === "review" && !loading && selected && (
                <WorktreeReview key={selected.id} api={api} worktreeId={selected.id} />
              )}
              {page === "review" && selectedBranch && (
                <BranchReview
                  key={selectedBranch}
                  api={api}
                  projectId={project.id}
                  branch={selectedBranch}
                />
              )}
              {page === "review" && !loading && !selected && !selectedBranch && (
                <EmptyState>{t("Worktrees are discovered automatically from Git.")}</EmptyState>
              )}
              {page === "test-container" && (
                <ProjectTestContainer key={project.id} api={api} projectId={project.id} />
              )}
              {page === "tests" && (
                <ProjectTests
                  key={project.id}
                  api={api}
                  projectId={project.id}
                  primaryRoot={
                    project.location.kind === "git" ? display.projectRoot : project.location.root
                  }
                  worktrees={worktrees}
                />
              )}
              {page === "dependencies" && <ProjectDependencies api={api} projectId={project.id} />}

              {page === "settings" && <GlobalSettings api={api} />}
            </section>
          )}
        </SidebarInset>
      </div>
    </>
  )
}

export function GlobalSettings({ api }: { api: Api }) {
  const { t } = useTranslation()
  const [wordWrap, setWordWrap] = useWordWrap()
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <SettingsSection title={t("Preferences")}>
        <ThemeSettings />
        <SettingsRow title={t("Word wrap")}>
          <Switch aria-label={t("Word wrap")} checked={wordWrap} onCheckedChange={setWordWrap} />
        </SettingsRow>
        <SettingsRow title={t("Language")}>
          <LanguageSelector />
        </SettingsRow>
      </SettingsSection>
      {typeof api.approvalPolicy === "function" && (
        <SettingsSection title={t("Automation")}>
          <ApprovalSettings api={api} />
        </SettingsSection>
      )}
      {typeof api.instanceSettings === "function" && <AuthoredSettings api={api} />}
    </div>
  )
}

export function WorktreeSidebar({
  onCurrent,
  currentActive = false,
  onHistory,
  historyActive = false,
  toolsActive = false,
  projectMenu,
  displayOptions,
  branchItems = [],
  worktrees,
  selectedId,
  pending,
  loading,
  onSelect,
  onRefresh,
  onDependencies,
  dependenciesActive = false,
  onTestContainer,
  testContainerActive = false,
  onTests,
  testsActive = false,
  onSettings,
  settingsActive = false,
  onProjectSettings,
  projectSettingsActive = false,
}: {
  onCurrent?: () => void
  currentActive?: boolean
  onHistory?: () => void
  historyActive?: boolean
  toolsActive?: boolean
  projectMenu: ReactNode
  displayOptions?: ReactNode
  branchItems?: import("@/lib/api").BranchReview[]
  worktrees: Worktree[]
  selectedId: string
  pending: boolean
  loading: boolean
  onSelect: (id: string) => void
  onRefresh?: () => void
  onDependencies?: () => void
  dependenciesActive?: boolean
  onTestContainer?: () => void
  testContainerActive?: boolean
  onTests?: () => void
  testsActive?: boolean
  onSettings?: () => void
  settingsActive?: boolean
  onProjectSettings?: () => void
  projectSettingsActive?: boolean
}) {
  const { t } = useTranslation()
  const { isMobile, open } = useSidebar()
  const nativeDesktop = desktopPlatform() !== undefined
  const [toolsOpen, setToolsOpen] = useState(() => {
    try {
      return toolsActive || localStorage.getItem("redpact:tools-open") === "true"
    } catch {
      return toolsActive
    }
  })
  function changeTools(open: boolean) {
    setToolsOpen(open)
    try {
      localStorage.setItem("redpact:tools-open", String(open))
    } catch {
      /* Display preferences are optional. */
    }
  }
  useEffect(() => {
    if (toolsActive) {
      setToolsOpen(true)
    }
  }, [toolsActive])
  const menuItems = [
    {
      id: "container" as const,
      label: t("Container"),
      icon: Container,
      onClick: onTestContainer,
      active: testContainerActive,
    },
    {
      id: "tests" as const,
      label: t("Tests"),
      icon: FlaskConical,
      onClick: onTests,
      active: testsActive,
    },
    {
      id: "dependencies" as const,
      label: t("Dependencies"),
      icon: Blocks,
      onClick: onDependencies,
      active: dependenciesActive,
    },
    {
      id: "project-settings" as const,
      label: t("Project settings"),
      icon: Settings2,
      onClick: onProjectSettings,
      active: projectSettingsActive,
    },
  ].filter((item) => item.onClick)
  const visibleItems = menuItems
  function renderWorktrees() {
    if (loading) {
      return (
        <>
          <SidebarMenuSkeleton />
          <span role="status" className="sr-only">
            {t("Loading worktrees…")}
          </span>
        </>
      )
    }
    if (!worktrees.length && !branchItems.length) {
      return (
        <EmptyState compact className="group-data-[collapsible=icon]:hidden">
          {t("No worktrees found.")}
        </EmptyState>
      )
    }
    return (
      <nav aria-label={t("Worktrees")}>
        <SidebarMenu>
          {worktrees.map((worktree) => {
            const name = worktreeName(worktree)
            return (
              <SidebarMenuItem key={worktree.id}>
                <SidebarMenuButton
                  size="default"
                  disabled={pending}
                  isActive={selectedId === worktree.id}
                  onClick={() => onSelect(worktree.id)}
                  aria-current={selectedId === worktree.id ? "page" : undefined}
                  aria-label={name}
                  tooltip={worktree.checkoutRoot}
                >
                  <FolderGit2 aria-hidden="true" />
                  <span className="min-w-0 group-data-[collapsible=icon]:sr-only">
                    <span className="block truncate font-medium">{name}</span>
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
          {branchItems.map((branch) => (
            <SidebarMenuItem key={`branch:${branch.name}`}>
              <SidebarMenuButton
                disabled={pending}
                isActive={selectedId === `branch:${branch.name}`}
                aria-current={selectedId === `branch:${branch.name}` ? "page" : undefined}
                aria-label={branch.name}
                tooltip={branch.name}
                onClick={() => onSelect(`branch:${branch.name}`)}
              >
                <GitBranch />
                <span className="min-w-0 truncate">{branch.name}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {branch.worktrees.length ? t("Missing folder") : t("Branch")}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </nav>
    )
  }
  return (
    <Sidebar variant="inset" collapsible="offcanvas">
      <SidebarHeader className="py-1">
        <div className="flex min-w-0 items-center gap-1">
          <div className="min-w-0 flex-1">{projectMenu}</div>
          {(isMobile || (open && !nativeDesktop)) && (
            <SidebarTrigger className="sidebar-workspace-toggle" />
          )}
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent className="gap-0">
        {(onCurrent || onHistory) && (
          <SidebarGroup>
            <nav aria-label={t("Review workspace")}>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={onCurrent}
                    isActive={currentActive}
                    aria-current={currentActive ? "page" : undefined}
                  >
                    <ActivityIcon aria-hidden="true" />
                    <span>{t("Current work")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={onHistory}
                    isActive={historyActive}
                    aria-current={historyActive ? "page" : undefined}
                  >
                    <History aria-hidden="true" />
                    <span>{t("Execution history")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </nav>
          </SidebarGroup>
        )}
        <Collapsible
          open={toolsOpen}
          onOpenChange={changeTools}
          className="flex min-h-0 flex-1 flex-col"
        >
          <SidebarGroup>
            <CollapsibleTrigger render={<SidebarMenuButton />}>
              <Wrench aria-hidden="true" />
              <span>{t("Tools")}</span>
              <ChevronDown aria-hidden="true" className="ml-auto" />
            </CollapsibleTrigger>
          </SidebarGroup>
          <CollapsibleContent className="flex min-h-0 flex-1 flex-col">
            <nav aria-label={t("Tools")}>
              {visibleItems.length > 0 && (
                <SidebarGroup>
                  <SidebarMenu>
                    {visibleItems.map((item) => (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          onClick={item.onClick}
                          isActive={item.active}
                          aria-current={item.active ? "page" : undefined}
                          disabled={pending}
                        >
                          <item.icon aria-hidden="true" />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroup>
              )}
            </nav>
            {onRefresh && (
              <SidebarGroup className="group/worktrees flex-1 pt-0">
                <div className="flex items-center justify-between">
                  <SidebarGroupLabel>{t("Worktrees")}</SidebarGroupLabel>
                  {displayOptions}
                </div>

                {renderWorktrees()}
              </SidebarGroup>
            )}
          </CollapsibleContent>
        </Collapsible>
      </SidebarContent>
      <SidebarFooter className="border-t border-border pb-0 pt-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onSettings} isActive={settingsActive} disabled={pending}>
              <Settings2 aria-hidden="true" />
              <span>{t("Settings")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
