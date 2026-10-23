import type { TFunction } from "i18next"
import {
  Blocks,
  Container,
  Files,
  FlaskConical,
  FolderGit2,
  GitBranch,
  GitGraph,
  Settings2,
  X,
} from "lucide-react"
import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { AppShortcuts } from "@/components/app-shortcuts"
import { useTrackedFilesOnly } from "@/lib/tracked-files-only"
import { useRefreshRequest } from "@/lib/use-refresh-request"
import { cn } from "@/lib/utils"
import { useWordWrap } from "@/lib/word-wrap"
import { worktreeName } from "@/lib/worktree-name"
import { AppHeader, AppHeaderScope, ResponsiveSidebarProvider } from "./app-header"
import { ApprovalSettings } from "./approval-settings"
import { AuthoredSettings } from "./authored-settings"
import { BranchReview } from "./branch-review"
import { ProjectDependencies } from "./dependency-viewer"
import { EmptyState, Notice } from "./feedback"
import { GitHubSettings } from "./github-settings"
import { LanguageSelector } from "./language-selector"
import { LiveUpdates, useLiveRevision } from "./live-updates"
import { PluginUpdateSettings } from "./plugin-updates"
import { ProblemsSettings } from "./problems"
import { ProjectFileViewer } from "./project-file-viewer"
import { ProjectGitGraph } from "./project-git-graph"
import { ProjectLibrary } from "./project-library"
import { ProjectMenuOptions, useProjectMenuOptions } from "./project-menu-options"
import { ProjectSettings } from "./project-settings"
import { ProjectStart } from "./project-start"
import { ProjectTestContainer } from "./project-test-container"
import { ProjectTests } from "./project-tests"
import { ReviewToolbar } from "./review-toolbar"
import { UpdateSettings } from "./runtime-update"
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
  SidebarSeparator,
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
import { type Api, ApiError, type Project, type Worktree } from "@/lib/api"

import {
  type WorkspacePage as Page,
  readWorkspaceHistory,
  type WorkspaceLocation,
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
  const { t } = useTranslation()

  const [projects, setProjects] = useState(initialProjects)
  const [manageOpen, setManageOpen] = useState(false)
  const [initialLocation] = useState<WorkspaceLocation | undefined>(() => {
    const saved =
      typeof window === "undefined" ? undefined : readWorkspaceHistory(window.history.state)
    if (saved && initialProjects.some((project) => project.id === saved.projectId)) {
      return saved
    }
    const id = initialProject(initialProjects)
    const project = initialProjects.find((item) => item.id === id)
    return project
      ? { id: `project:${id}`, kind: "project", label: project.name, projectId: id }
      : undefined
  })
  const [location, setLocation] = useState(initialLocation)
  const selectedId = location?.projectId ?? ""
  useEffect(() => {
    if (location && projects.some((project) => project.id === location.projectId)) {
      return
    }
    const project = projects[0]
    const next: WorkspaceLocation | undefined = project
      ? { id: `project:${project.id}`, kind: "project", label: project.name, projectId: project.id }
      : undefined
    setLocation(next)
    if (next) {
      writeWorkspaceHistory(next, true)
    }
  }, [projects, location])
  useEffect(() => {
    if (initialLocation) {
      writeWorkspaceHistory(initialLocation, true)
    }
  }, [initialLocation])
  useEffect(() => {
    function restore(event: PopStateEvent) {
      const next = readWorkspaceHistory(event.state)
      if (next && projects.some((project) => project.id === next.projectId)) {
        setLocation(next)
      }
    }
    window.addEventListener("popstate", restore)
    return () => window.removeEventListener("popstate", restore)
  }, [projects])
  function visitWorkspace(next: WorkspaceLocation) {
    writeWorkspaceHistory(next)
    setLocation(next)
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
    visitWorkspace({
      id: location?.id ?? crypto.randomUUID(),
      kind: "project",
      label: project.name,
      projectId: id,
    })
  }
  function openWorktree(project: Project, worktree: Worktree) {
    visitWorkspace({
      id: location?.id ?? crypto.randomUUID(),
      kind: "worktree",
      label: worktreeName(worktree),
      projectId: project.id,
      worktreeId: worktree.id,
      view: { page: "review", selectedId: worktree.id },
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
        <ResponsiveSidebarProvider>
          <LiveUpdates projectId={selected.id}>
            <WorktreePanel
              key={selected.id}
              project={selected}
              api={api}
              projectMenu={projectMenu}
              onOpenWorktree={openWorktree}
              view={location?.view ?? { page: "review", selectedId: location?.worktreeId ?? "" }}
              onViewChange={(view) => {
                if (location) {
                  visitWorkspace({ ...location, view })
                }
              }}
            />
          </LiveUpdates>
        </ResponsiveSidebarProvider>
      </TooltipProvider>
    </>
  )
}

export function WorktreePanel({
  active = true,
  api,
  project,
  projectMenu,
  onOpenWorktree,
  view,
  onViewChange,
  initialPage = "review",
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
  onOpenWorktree?: (project: Project, worktree: Worktree) => void
}) {
  const { t } = useTranslation()
  const { isMobile, setOpenMobile } = useSidebar()

  const [worktrees, setWorktrees] = useState<Worktree[]>([])
  const [navigation, setNavigation] = useState<WorkspaceView>({
    page: initialPage,
    selectedId: initialSelectedId,
  })
  const { page, selectedId } = view ?? navigation
  function setPage(nextPage: Page, worktreeId = selected?.id ?? selectedId) {
    const next = { page: nextPage, selectedId: worktreeId }
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
  const fillsFrame = ["git-graph", "files", "review", "tests"].includes(page)
  const isSettings = page === "settings" || page === "project-settings"
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
    </>
  )

  return (
    <AppHeaderScope>
      {(!isMobile || active) && (
        <WorktreeSidebar
          key={project.id}
          projectId={project.id}
          projectMenu={projectMenu}
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
            if (worktree && onOpenWorktree) {
              setOpenMobile(false)
              onOpenWorktree(project, worktree)
              return
            }
            setPage("review", id)
          }}
          onRefresh={() => {
            setError("")
            setRevision((value) => value + 1)
          }}
        />
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:my-2 md:mr-2 md:peer-data-[state=collapsed]:ml-2">
        <AppHeader />
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
                <ReviewToolbar
                  navigation={<h1 className="text-sm font-semibold">{settingsTitle}</h1>}
                />
              )}
              {page === "review" && (loading || !selected || selectedBranch) && (
                <ReviewToolbar
                  navigation={
                    <h1 className="text-sm font-semibold">{selectedBranch || t("Worktrees")}</h1>
                  }
                />
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
    </AppHeaderScope>
  )
}

export function GlobalSettings({ api }: { api: Api }) {
  const { t } = useTranslation()
  const [wordWrap, setWordWrap] = useWordWrap()
  const [trackedOnly, setTrackedOnly] = useTrackedFilesOnly()
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <ProblemsSettings />
      <UpdateSettings />
      <PluginUpdateSettings />
      <SettingsSection title={t("Preferences")}>
        <ThemeSettings />
        <SettingsRow title={t("Word wrap")}>
          <Switch aria-label={t("Word wrap")} checked={wordWrap} onCheckedChange={setWordWrap} />
        </SettingsRow>
        <SettingsRow
          title={t("Show Git-tracked files only")}
          description={t("Apply to all File Viewer views in this browser.")}
        >
          <Switch
            aria-label={t("Show Git-tracked files only")}
            checked={trackedOnly}
            onCheckedChange={setTrackedOnly}
          />
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
  const { isMobile, setOpenMobile } = useSidebar()
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
          {isMobile && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("Close sidebar")}
              onClick={() => setOpenMobile(false)}
            >
              <X aria-hidden="true" />
            </Button>
          )}
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
          <SidebarGroup className="group/worktrees flex-1 pt-0">
            <div className="flex items-center justify-between">
              <SidebarGroupLabel>{t("Worktrees")}</SidebarGroupLabel>
              {displayOptions}
            </div>

            {renderWorktrees()}
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-border pb-0 pt-2">
        <AppShortcuts onSettings={onSettings} settingsActive={settingsActive} pending={pending} />
      </SidebarFooter>
    </Sidebar>
  )
}
