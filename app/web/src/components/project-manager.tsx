import type { TFunction } from "i18next"
import {
  Blocks,
  Container,
  Files,
  FlaskConical,
  FolderGit2,
  GitBranch,
  GitGraph,
  Settings,
  Settings2,
  X,
} from "lucide-react"
import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useRefreshRequest } from "@/lib/use-refresh-request"
import { cn } from "@/lib/utils"
import { useWordWrap } from "@/lib/word-wrap"
import { worktreeName } from "@/lib/worktree-name"
import { ApprovalSettings } from "./approval-settings"
import { AuthoredSettings } from "./authored-settings"
import { BranchReview } from "./branch-review"
import { ProjectDependencies } from "./dependency-viewer"
import { EmptyState, Notice } from "./feedback"
import { GitHubSettings } from "./github-settings"
import { LanguageSelector } from "./language-selector"
import { LiveUpdates, useLiveRevision } from "./live-updates"
import { ProjectFileViewer } from "./project-file-viewer"
import { ProjectGitGraph } from "./project-git-graph"
import { ProjectMenuOptions, useProjectMenuOptions } from "./project-menu-options"
import { ProjectSettings } from "./project-settings"
import { ProjectStart } from "./project-start"
import { ProjectTestContainer } from "./project-test-container"
import { ProjectTests } from "./project-tests"
import { SettingsRow, SettingsSection } from "./settings-row"
import { ThemeSettings } from "./theme-settings"
import { Button } from "./ui/button"
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

type Page =
  | "test-container"
  | "tests"
  | "files"
  | "git-graph"
  | "review"
  | "dependencies"
  | "project-settings"
  | "settings"

type WorkspaceTab = {
  id: string
  kind: "project" | "worktree"
  label: string
  projectId: string
  worktreeId?: string
}

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
  const { t } = useTranslation()
  const nativeDesktop =
    typeof document !== "undefined" && document.documentElement.dataset.desktop === "macos"

  const [projects, setProjects] = useState(initialProjects)
  const [selectedId, setSelectedId] = useState(() => initialProject(initialProjects))
  const [workspaceTabs, setWorkspaceTabs] = useState<WorkspaceTab[]>(() => {
    const id = initialProject(initialProjects)
    const project = initialProjects.find((item) => item.id === id)
    return project
      ? [
          {
            id: `project:${project.id}`,
            kind: "project",
            label: project.name,
            projectId: project.id,
          },
        ]
      : []
  })
  const [activeWorkspaceTabId, setActiveWorkspaceTabId] = useState(() => {
    const id = initialProject(initialProjects)
    return id ? `project:${id}` : ""
  })
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
          setSelectedId((id) => (items.some((item) => item.id === id) ? id : (items[0]?.id ?? "")))
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
    if (!project) {
      return
    }
    const tabId = `project:${id}`
    setWorkspaceTabs((tabs) =>
      tabs.some((tab) => tab.id === tabId)
        ? tabs
        : [...tabs, { id: tabId, kind: "project", label: project.name, projectId: id }],
    )
    setActiveWorkspaceTabId(tabId)
    setSelectedId(id)
    setError("")
  }
  function openWorktree(project: Project, worktree: Worktree) {
    const tabId = `worktree:${project.id}:${worktree.id}`
    setWorkspaceTabs((tabs) =>
      tabs.some((tab) => tab.id === tabId)
        ? tabs
        : [
            ...tabs,
            {
              id: tabId,
              kind: "worktree",
              label: worktreeName(worktree),
              projectId: project.id,
              worktreeId: worktree.id,
            },
          ],
    )
    setSelectedId(project.id)
    setActiveWorkspaceTabId(tabId)
    setError("")
  }
  function activateWorkspaceTab(tab: WorkspaceTab) {
    setSelectedId(tab.projectId)
    setActiveWorkspaceTabId(tab.id)
    setError("")
  }
  function closeWorkspaceTab(tabId: string) {
    setWorkspaceTabs((tabs) => {
      if (tabs.length === 1) {
        return tabs
      }
      const closingIndex = tabs.findIndex((tab) => tab.id === tabId)
      const next = tabs.filter((tab) => tab.id !== tabId)
      if (activeWorkspaceTabId === tabId) {
        const replacement = next[Math.max(0, closingIndex - 1)]
        if (replacement) {
          setSelectedId(replacement.projectId)
          setActiveWorkspaceTabId(replacement.id)
        }
      }
      return next
    })
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
  if (!selected) {
    return (
      <ProjectStart
        pickDirectory={api.pickDirectory}
        pending={pending}
        error={error}
        onConnect={(path, name) => update(() => api.connect(path, name))}
      />
    )
  }
  return (
    <TooltipProvider>
      <SidebarProvider
        defaultOpen
        allowDesktopToggle={nativeDesktop}
        className="h-dvh min-h-0 overflow-hidden"
      >
        <LiveUpdates key={selected.id} projectId={selected.id}>
          <WorktreePanel
            key={activeWorkspaceTabId}
            project={selected}
            api={api}
            projectMenu={projectMenu}
            workspaceTabs={workspaceTabs}
            activeWorkspaceTabId={activeWorkspaceTabId}
            onActivateWorkspaceTab={activateWorkspaceTab}
            onCloseWorkspaceTab={closeWorkspaceTab}
            onOpenWorktree={openWorktree}
            initialSelectedId={
              workspaceTabs.find((tab) => tab.id === activeWorkspaceTabId)?.worktreeId ?? ""
            }
          />
        </LiveUpdates>
      </SidebarProvider>
    </TooltipProvider>
  )
}

export function WorktreePanel({
  api,
  project,
  projectMenu,
  workspaceTabs = [],
  activeWorkspaceTabId,
  onActivateWorkspaceTab,
  onCloseWorkspaceTab,
  onOpenWorktree,
  initialPage = "review",
  initialSelectedId = "",
}: {
  initialPage?: "review" | "git-graph"
  initialSelectedId?: string
  api: Api
  project: Project
  projectMenu: ReactNode
  workspaceTabs?: WorkspaceTab[]
  activeWorkspaceTabId?: string
  onActivateWorkspaceTab?: (tab: WorkspaceTab) => void
  onCloseWorkspaceTab?: (tabId: string) => void
  onOpenWorktree?: (project: Project, worktree: Worktree) => void
}) {
  const { t } = useTranslation()

  const [worktrees, setWorktrees] = useState<Worktree[]>([])
  const [navigation, setNavigation] = useState({
    entries: [{ page: initialPage as Page, selectedId: initialSelectedId }],
    index: 0,
  })
  const { page, selectedId } = navigation.entries[navigation.index]
  function setPage(page: Page, worktreeId = selectedId) {
    setNavigation((current) => {
      const previous = current.entries[current.index]
      if (previous.page === page && previous.selectedId === worktreeId) {
        return current
      }
      const entries = current.entries.slice(0, current.index + 1)
      entries.push({ page, selectedId: worktreeId })
      return { entries, index: entries.length - 1 }
    })
  }
  const setSelectedId = useCallback((select: (id: string) => string) => {
    setNavigation((current) => ({
      ...current,
      entries: current.entries.map((entry) => ({ ...entry, selectedId: select(entry.selectedId) })),
    }))
  }, [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const liveRevision = useLiveRevision()
  const settingsTitle = page === "project-settings" ? t("Project settings") : t("Settings")
  const fillsFrame = ["git-graph", "files", "review", "tests"].includes(page)
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
    (!display.tracking?.showBranches && selectedId.startsWith("branch:") ? worktrees[0] : undefined)
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
      <WorktreeSidebar
        key={project.id}
        projectId={project.id}
        projectMenu={projectMenu}
        displayOptions={
          project.location.kind === "git" ? <WorktreeDisplayOptions display={display} /> : undefined
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
        onFiles={() => setPage("files")}
        filesActive={page === "files"}
        onGitGraph={project.location.kind === "git" ? () => setPage("git-graph") : undefined}
        gitGraphActive={page === "git-graph"}
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
          const worktree = worktrees.find((item) => item.id === id)
          if (worktree) {
            onOpenWorktree?.(project, worktree)
          }
          setPage("review", id)
        }}
        onRefresh={() => {
          setError("")
          setRevision((value) => value + 1)
        }}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:my-2 md:mr-2 md:peer-data-[state=collapsed]:ml-2">
        <header
          data-tauri-drag-region
          className="app-header flex min-w-0 shrink-0 items-center gap-2 p-2"
        >
          <div className="app-header-controls flex shrink-0 items-center gap-2">
            <SidebarTrigger />
          </div>
          <div
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
            role="tablist"
            aria-label={t("Open workspaces")}
          >
            {workspaceTabs.map((tab) => {
              const active = tab.id === activeWorkspaceTabId
              return (
                <div
                  key={tab.id}
                  className={cn(
                    "flex h-7 w-40 shrink-0 items-center gap-1 rounded-lg px-1 text-xs",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50",
                  )}
                >
                  <Button
                    variant="ghost"
                    size="xs"
                    role="tab"
                    aria-selected={active}
                    className="min-w-0 flex-1 truncate px-1"
                    onClick={() => onActivateWorkspaceTab?.(tab)}
                  >
                    {tab.label}
                  </Button>
                  {workspaceTabs.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("Close {{name}}", { name: tab.label })}
                      onClick={() => onCloseWorkspaceTab?.(tab.id)}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </header>
        <SidebarInset
          className={cn(
            "min-h-0 min-w-0 overflow-auto md:rounded-xl md:ring-1 md:ring-border",
            (page === "review" || page === "files" || page === "git-graph" || page === "tests") &&
              "overflow-hidden",
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
                (page === "review" ||
                  page === "files" ||
                  page === "git-graph" ||
                  page === "tests" ||
                  page === "dependencies") &&
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
              {page === "files" && (
                <ProjectFileViewer key={project.id} api={api} projectId={project.id} />
              )}
              {page === "git-graph" && (
                <ProjectGitGraph key={project.id} api={api} projectId={project.id} />
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
      {typeof api.githubConnection === "function" && (
        <SettingsSection title={t("Integrations")}>
          <GitHubSettings api={api} />
        </SettingsSection>
      )}
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
  projectId,
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
  onFiles,
  filesActive = false,
  onGitGraph,
  gitGraphActive = false,
  onTestContainer,
  testContainerActive = false,
  onTests,
  testsActive = false,
  onSettings,
  settingsActive = false,
  onProjectSettings,
  projectSettingsActive = false,
}: {
  projectId?: string
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
  onFiles?: () => void
  filesActive?: boolean
  onGitGraph?: () => void
  gitGraphActive?: boolean
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
  const menuDisplay = useProjectMenuOptions(projectId)
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
      id: "files" as const,
      label: t("File Viewer"),
      icon: Files,
      onClick: onFiles,
      active: filesActive,
    },
    {
      id: "git-graph" as const,
      label: t("Git Graph"),
      icon: GitGraph,
      onClick: onGitGraph,
      active: gitGraphActive,
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
  const visibleItems = menuItems.filter((item) => !menuDisplay.hidden.includes(item.id))
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
          {menuItems.length > 0 && (
            <ProjectMenuOptions items={menuItems} display={menuDisplay} disabled={pending} />
          )}
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent className="gap-0">
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
        {onRefresh && (
          <SidebarGroup className="pt-0">
            <div className="flex items-center justify-between">
              <SidebarGroupLabel>{t("Worktrees")}</SidebarGroupLabel>
              {displayOptions}
            </div>

            {renderWorktrees()}
          </SidebarGroup>
        )}
      </SidebarContent>
      {onSettings && (
        <SidebarFooter className="pb-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={onSettings}
                isActive={settingsActive}
                aria-current={settingsActive ? "page" : undefined}
                disabled={pending}
              >
                <Settings aria-hidden="true" />
                <span>{t("Settings")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
    </Sidebar>
  )
}
