import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { CaptureRun, TestRun, UnitRun } from "@/lib/api"

type Kind = "unit" | "integration" | "playwright"
type Phase = string

function unitPhase(unit: UnitRun): Phase {
  if (unit.state === "finished") {
    return "Finished"
  }
  if (unit.outcome) {
    return "Cleaning up"
  }
  if (unit.containerId) {
    return "Running command"
  }
  if (unit.runtimeId) {
    return "Building test container"
  }
  if (unit.inputDigest) {
    return "Checking Docker"
  }
  return "Capturing sources"
}

function integrationPhase(integration: TestRun): Phase {
  if (integration.state === "finished") {
    return "Finished"
  }
  if (integration.state === "running") {
    return "Running tests"
  }
  if (integration.environmentId) {
    return "Preparing environment"
  }
  return "Waiting to start"
}

function playwrightPhase(playwright: CaptureRun): Phase {
  if (playwright.state === "finished") {
    return "Finished"
  }
  if (playwright.after.outcome || playwright.after.state === "finished") {
    return "Cleaning up"
  }
  if (playwright.after.containerId) {
    return "Running browser tests"
  }
  if (playwright.after.inputDigest) {
    return "Starting browser"
  }
  if (playwright.after.environmentId) {
    return "Preparing environment"
  }
  return "Capturing sources"
}

function phase(kind: Kind, run: UnitRun | TestRun | CaptureRun): Phase {
  if (kind === "unit") {
    return unitPhase(run as UnitRun)
  }
  if (kind === "integration") {
    return integrationPhase(run as TestRun)
  }
  return playwrightPhase(run as CaptureRun)
}

const kindLabels = { unit: "Unit", integration: "Integration", playwright: "Playwright" } as const
export function ExecutionProgress({
  kind,
  run,
  compact = false,
}: {
  kind: Kind
  run: UnitRun | TestRun | CaptureRun
  compact?: boolean
}) {
  const { t } = useTranslation()
  const [now, setNow] = useState(Date.now())
  const active = run.state !== "finished"
  useEffect(() => {
    if (!active) {
      return
    }
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  const current = phase(kind, run)
  const start = Date.parse(run.createdAt)
  const end = !active && run.finishedAt ? Date.parse(run.finishedAt) : now
  const duration = Number.isFinite(start) ? Math.max(0, Math.floor((end - start) / 1000)) : null
  return (
    <div
      role="status"
      aria-label={t("{{kind}} progress", { kind: t(kindLabels[kind]) })}
      className={compact ? "text-xs text-muted-foreground" : "rounded-md border p-3 text-sm"}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {!compact && <span className="font-medium">{t("Execution progress")}</span>}
        <span aria-live="polite">{t(current)}</span>
        {duration !== null && (
          <span className="tabular-nums text-muted-foreground">
            {t("{{seconds}}s elapsed", { seconds: duration })}
          </span>
        )}
      </div>
    </div>
  )
}
