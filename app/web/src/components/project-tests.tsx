import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { Api, Worktree } from "@/lib/api"
import { EmptyState } from "./feedback"
import { LiveUpdates } from "./live-updates"
import { ProjectPlaywright } from "./project-playwright"
import { ReviewToolbar, ReviewToolbarScope } from "./review-toolbar"
import { TestObservation } from "./test-observation"
import { Button } from "./ui/button"
import { Tabs, TabsContent, TabsTrigger } from "./ui/coss-tabs"
import { UnitTests } from "./unit-tests"

export function ProjectTests({
  api,
  projectId,
  primaryRoot,
  worktrees,
}: {
  api: Api
  projectId: string
  primaryRoot: string
  worktrees: Worktree[]
}) {
  const { t } = useTranslation()
  const [kind, setKind] = useState("unit")
  const [actionsContainer, setActionsContainer] = useState<HTMLDivElement | null>(null)
  const selected = worktrees.find(
    (worktree) => worktree.projectId === projectId && worktree.checkoutRoot === primaryRoot,
  )
  return (
    <ReviewToolbarScope>
      <Tabs
        value={kind}
        onValueChange={(value) => setKind(String(value))}
        className="min-h-0 flex-1 gap-0"
      >
        <ReviewToolbar
          label={t("Tests")}
          actions={
            <div ref={setActionsContainer} className="flex items-center gap-2">
              {!selected && kind !== "playwright" && (
                <Button size="toolbar" disabled>
                  {t(kind === "unit" ? "Run Unit command" : "Run Integration tests")}
                </Button>
              )}
            </div>
          }
        >
          <TabsTrigger value="unit">{t("Unit")}</TabsTrigger>
          <TabsTrigger value="integration">{t("Integration")}</TabsTrigger>
          <TabsTrigger value="playwright">{t("Playwright")}</TabsTrigger>
        </ReviewToolbar>
        {kind !== "playwright" &&
          (selected ? (
            <>
              <TabsContent
                value="unit"
                className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden"
              >
                <LiveUpdates
                  key={selected.id}
                  projectId={projectId}
                  worktreeId={selected.id}
                  scope="unit"
                >
                  <UnitTests
                    key={selected.id}
                    api={api}
                    worktreeId={selected.id}
                    scope="all"
                    actionsContainer={actionsContainer}
                  />
                </LiveUpdates>
              </TabsContent>
              <TabsContent
                value="integration"
                className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden"
              >
                <LiveUpdates
                  key={selected.id}
                  projectId={projectId}
                  worktreeId={selected.id}
                  scope="tests"
                >
                  <TestObservation
                    projectId={projectId}
                    key={selected.id}
                    api={api}
                    worktreeId={selected.id}
                    scope="all"
                    actionsContainer={actionsContainer}
                  />
                </LiveUpdates>
              </TabsContent>
            </>
          ) : (
            <EmptyState>{t("Project checkout unavailable.")}</EmptyState>
          ))}
        <TabsContent
          value="playwright"
          className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden"
        >
          <ProjectPlaywright api={api} projectId={projectId} />
        </TabsContent>
      </Tabs>
    </ReviewToolbarScope>
  )
}
