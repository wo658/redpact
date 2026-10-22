import type { GitGraphProvider, WebGitGraphElement } from "@web-git-graph/web"
import { RefreshCw } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { type Api, ApiError } from "@/lib/api"
import { CommitChanges } from "./commit-changes"
import { Notice } from "./feedback"
import { applyGitGraphTheme } from "./git-graph-theme"
import { useLiveRevision } from "./live-updates"
import { ReviewToolbar } from "./review-toolbar"
import { Button } from "./ui/button"
import { Spinner } from "./ui/spinner"

export function ProjectGitGraph({ api, projectId }: { api: Api; projectId: string }) {
  return <ProjectGitGraphView key={projectId} api={api} projectId={projectId} />
}

function ProjectGitGraphView({ api, projectId }: { api: Api; projectId: string }) {
  const { t } = useTranslation()
  const layout = useRef<HTMLDivElement>(null)
  const paneId = useId()
  const [graphSize, setGraphSize] = useState(50)
  const resize = (value: number) => setGraphSize(Math.max(20, Math.min(80, value)))
  const host = useRef<HTMLDivElement>(null)
  const element = useRef<WebGitGraphElement>(null)
  const [graphReady, setGraphReady] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const revision = useLiveRevision()
  const [selected, setSelected] = useState<{ projectId: string; oid: string } | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    const container = host.current
    const lifetime = new AbortController()
    let observer: MutationObserver | undefined
    let loadingObserver: MutationObserver | undefined
    let graph: WebGitGraphElement | undefined
    setError("")
    void import("@web-git-graph/web")
      .then(({ WebGitGraphElement }) => {
        if (lifetime.signal.aborted || !container) {
          return
        }
        if (!window.customElements.get("web-git-graph")) {
          window.customElements.define("web-git-graph", WebGitGraphElement)
        }
        graph = document.createElement("web-git-graph")
        element.current = graph
        applyGitGraphTheme(graph)
        graph.setAttribute("hosted", "")
        graph.setAttribute("hide-details", "")
        graph.setAttribute("aria-label", "Git Graph")
        graph.setAttribute("date-format", "relative")
        graph.avatars = false
        const applyTheme = () => {
          if (graph) {
            graph.theme = document.documentElement.classList.contains("dark") ? "dark" : "light"
          }
        }
        applyTheme()
        observer = new MutationObserver(applyTheme)
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
        const provider: GitGraphProvider = {
          getCapabilities: async () => ({
            protocolVersion: "1",
            history: true,
            details: false,
            compare: false,
            diff: false,
            workingTree: false,
            stashes: false,
            maxPageSize: 500,
          }),
          getHistory: async (request = {}) => {
            const signal = request.signal
              ? AbortSignal.any([request.signal, lifetime.signal])
              : lifetime.signal
            try {
              const page = await api.gitGraph(
                projectId,
                { refs: request.refs, cursor: request.cursor, limit: request.limit },
                signal,
              )
              signal.throwIfAborted()
              return page
            } catch (error) {
              if (!signal.aborted && error instanceof ApiError && error.status === 409) {
                queueMicrotask(() => {
                  if (!lifetime.signal.aborted) {
                    graph?.refresh()
                  }
                })
              }
              throw error
            }
          },
        }
        graph.addEventListener("gitgraph-commit-select", (event) => {
          setSelected({ projectId, oid: event.detail.commit.oid })
        })
        graph.provider = provider
        container.append(graph)
        const updateLoading = () => setRefreshing(graph?.getAttribute("aria-busy") === "true")
        loadingObserver = new MutationObserver(updateLoading)
        loadingObserver.observe(graph, { attributes: true, attributeFilter: ["aria-busy"] })
        updateLoading()
        setGraphReady(true)
      })
      .catch((error: unknown) => {
        if (!lifetime.signal.aborted) {
          setError(error instanceof Error ? error.message : String(error))
        }
      })
    return () => {
      lifetime.abort()
      observer?.disconnect()
      loadingObserver?.disconnect()
      graph?.remove()
      element.current = null
    }
  }, [api, projectId])
  useEffect(() => {
    if (revision > 0) {
      element.current?.refresh()
    }
  }, [revision])
  return (
    <div ref={layout} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {error && <Notice error>{error}</Notice>}
      <ReviewToolbar
        navigation={<h1 className="text-sm font-medium">{t("Git Graph")}</h1>}
        actions={
          <Button
            variant="ghost"
            size="toolbar"
            disabled={!graphReady || refreshing}
            onClick={() => element.current?.refresh()}
          >
            {refreshing ? <Spinner aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
            {t("Refresh")}
          </Button>
        }
      />
      <div
        id={paneId}
        ref={host}
        className="project-git-graph min-h-0 min-w-0 overflow-hidden"
        style={{ flex: selected?.projectId === projectId ? `${graphSize} 1 0%` : "1 1 0%" }}
      />
      {selected?.projectId === projectId && (
        <>
          {/* biome-ignore lint/a11y/useSemanticElements: Interactive splitter requires focus and value semantics. */}
          <div
            role="separator"
            tabIndex={0}
            aria-label={t("Resize commit changes")}
            aria-orientation="horizontal"
            aria-controls={paneId}
            aria-valuemin={20}
            aria-valuemax={80}
            aria-valuenow={graphSize}
            className="flex h-2 shrink-0 cursor-row-resize touch-none items-center justify-center bg-muted select-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            onDoubleClick={() => resize(50)}
            onKeyDown={(event) => {
              const next = { ArrowUp: graphSize - 5, ArrowDown: graphSize + 5, Home: 20, End: 80 }[
                event.key
              ]
              if (next !== undefined) {
                event.preventDefault()
                resize(next)
              }
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) {
                return
              }
              event.preventDefault()
              event.currentTarget.focus()
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
                return
              }
              const bounds = layout.current?.getBoundingClientRect()
              if (bounds && bounds.height > 8) {
                resize(Math.round(((event.clientY - bounds.top - 4) / (bounds.height - 8)) * 100))
              }
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId)
              }
            }}
          >
            <span className="h-0.5 w-8 rounded-full bg-border" />
          </div>
          <div
            className="flex min-h-0 min-w-0 overflow-hidden"
            style={{ flex: `${100 - graphSize} 1 0%` }}
          >
            <CommitChanges
              key={`${projectId}:${selected.oid}`}
              api={api}
              projectId={projectId}
              oid={selected.oid}
              onClose={() => setSelected(null)}
            />
          </div>
        </>
      )}
    </div>
  )
}
