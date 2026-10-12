import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { type DependencyNode, dependencyNodeKey } from "@/lib/dependency-diagram"
import { Button } from "./ui/button"

let renderer: Promise<typeof import("mermaid")["default"]> | undefined
function loadRenderer() {
  renderer ??= import("mermaid")
    .then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true,
        layout: "elk",
        look: "neo",
        theme: "base",
        fontFamily: "Inter Variable, sans-serif",
        htmlLabels: true,
      })
      return mermaid
    })
    .catch((error: unknown) => {
      renderer = undefined
      throw error
    })
  return renderer
}

export function DependencyDiagram({
  source,
  nodes,
  active,
  onSelect,
}: {
  source: string
  nodes: DependencyNode[]
  active: DependencyNode
  onSelect: (key: string) => void
}) {
  const { t } = useTranslation()
  const id = useId().replace(/[^a-zA-Z0-9]/g, "")
  const host = useRef<HTMLDivElement>(null)
  const [result, setResult] = useState<{ source: string; svg?: string; error?: boolean }>()
  const selected = dependencyNodeKey(active)
  const ready = result?.source === source && Boolean(result.svg)

  useEffect(() => {
    let cancelled = false
    const container = document.createElement("div")
    container.style.visibility = "hidden"
    container.style.position = "absolute"
    host.current?.replaceChildren(container)
    void (async () => {
      try {
        await document.fonts?.ready
        const mermaid = await loadRenderer()
        if (cancelled) {
          return
        }
        const { svg } = await mermaid.render(`dependency${id}`, source, container)
        if (!cancelled) {
          setResult({ source, svg })
        }
      } catch {
        if (!cancelled) {
          setResult({ source, error: true })
        }
      } finally {
        container.remove()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, source])

  useEffect(() => {
    if (!ready || !host.current || !result?.svg) {
      return
    }
    // Only the strict Mermaid renderer's SVG enters this host; settings are escaped as labels.
    const template = document.createElement("template")
    template.innerHTML = result.svg
    const svg = template.content.querySelector("svg")
    if (!svg) {
      return
    }
    const [, , width, height] = (svg.getAttribute("viewBox") ?? "").split(/[ ,]+/).map(Number)
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      svg.style.width = `${width}px`
      svg.style.height = `${height}px`
      svg.style.maxWidth = "none"
    }
    host.current.replaceChildren(svg)
  }, [ready, result])

  useEffect(() => {
    const svg = host.current?.querySelector("svg")
    if (!ready || !svg) {
      return
    }
    const activeId = `service${nodes.findIndex((node) => dependencyNodeKey(node) === selected)}`
    for (const edge of svg.querySelectorAll(".edgePaths path[data-id]")) {
      edge.classList.toggle(
        "dependency-connected",
        edge.getAttribute("data-id")?.split("_").includes(activeId) ?? false,
      )
    }
    const handlers: Array<() => void> = []
    for (const [index, node] of nodes.entries()) {
      const element = svg.querySelector<SVGGElement>(`g.node.service${index}`)
      if (!element) {
        continue
      }
      const key = dependencyNodeKey(node)
      element.setAttribute("role", "button")
      element.setAttribute("tabindex", "0")
      element.setAttribute(
        "aria-label",
        t(node.kind === "application" ? "Application service: {{name}}" : "Dependency: {{name}}", {
          name: node.name,
        }),
      )
      element.setAttribute("aria-pressed", String(key === selected))
      const click = () => onSelect(key)
      const keydown = (event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onSelect(key)
        }
      }
      element.addEventListener("click", click)
      element.addEventListener("keydown", keydown)
      handlers.push(() => {
        element.removeEventListener("click", click)
        element.removeEventListener("keydown", keydown)
      })
    }
    return () => {
      for (const dispose of handlers) {
        dispose()
      }
    }
  }, [ready, nodes, selected, onSelect, t])

  return (
    <>
      <div ref={host} className="dependency-diagram content-width-wide overflow-x-auto p-4" />
      {!ready && (
        <div className="flex flex-col gap-2 px-4 pb-4">
          <p role={result?.error ? "alert" : "status"} className="text-sm text-muted-foreground">
            {result?.error
              ? t("Unable to draw service relationships. Select a service for details.")
              : t("Drawing service relationships…")}
          </p>
          <div className="flex flex-wrap gap-2">
            {nodes.map((node) => (
              <Button
                key={dependencyNodeKey(node)}
                variant="outline"
                aria-label={t(
                  node.kind === "application"
                    ? "Application service: {{name}}"
                    : "Dependency: {{name}}",
                  { name: node.name },
                )}
                aria-pressed={dependencyNodeKey(node) === selected}
                onClick={() => onSelect(dependencyNodeKey(node))}
              >
                {node.name}
              </Button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
