import { SlidersHorizontal } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { Api, BranchReview, ProjectTracking } from "@/lib/api"
import { useRefreshRequest } from "@/lib/use-refresh-request"
import { useLiveRevision } from "./live-updates"
import { Button } from "./ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"

export function useWorktreeDisplay(
  api: Api,
  projectId: string,
  git: boolean,
  onChange: () => void,
  parentRevision = 0,
) {
  const liveRevision = useLiveRevision()
  const [projectRoot, setProjectRoot] = useState("")
  const [tracking, setTracking] = useState<ProjectTracking | null>(null)
  const [branches, setBranches] = useState<BranchReview[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const saving = useRef(false)
  const generation = useRef(0)
  const refresh = useCallback(
    async (signal: AbortSignal) => {
      if (!git || saving.current) {
        return
      }
      const started = generation.current
      try {
        const result = await api.getTracking(projectId, signal)
        const rows = result.tracking.showBranches ? await api.branchReviews(projectId, signal) : []
        if (!signal.aborted && !saving.current && started === generation.current) {
          setProjectRoot(result.projectRoot)
          setTracking(result.tracking)
          setBranches(rows.filter((row) => row.worktrees.every((tree) => tree.missing)))
          setError("")
        }
      } catch (error) {
        if (!signal.aborted) {
          setError(error instanceof Error ? error.message : String(error))
        }
      }
    },
    [api, projectId, git],
  )
  useRefreshRequest(refresh, liveRevision, revision + parentRevision)
  async function save(patch: Partial<ProjectTracking>) {
    if (!tracking || saving.current) {
      return
    }
    saving.current = true
    generation.current += 1
    setPending(true)
    setError("")
    try {
      const next = { ...tracking, ...patch }
      const result = await api.setTracking(projectId, next)
      setTracking(result.tracking ?? next)
      onChange()
      setRevision((v) => v + 1)
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      saving.current = false
      setPending(false)
    }
  }
  return { projectRoot, tracking, branches, pending, error, save }
}

export function WorktreeDisplayOptions({
  display,
}: {
  display: ReturnType<typeof useWorktreeDisplay>
}) {
  const { t } = useTranslation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("Worktree display options")}
            title={t("Worktree display options")}
          />
        }
        disabled={!display.tracking || display.pending}
      >
        <SlidersHorizontal aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={display.tracking?.showBranches ? "branches" : "worktrees"}
          onValueChange={(value) => void display.save({ showBranches: value === "branches" })}
        >
          <DropdownMenuRadioItem value="worktrees">{t("Worktrees only")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="branches">
            {t("Include local branches")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={display.tracking?.hideMerged ?? false}
          disabled={!display.tracking?.mainBranch || display.pending}
          onCheckedChange={(checked) => void display.save({ hideMerged: checked })}
        >
          {t("Hide merged worktrees")}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
