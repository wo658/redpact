// biome-ignore-all lint/suspicious/noArrayIndexKey: Immutable evidence arrays have no unique IDs and can contain duplicate names and assertions.
import { Check, Minus, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { ExecutionProgress } from "./execution-progress"
import { EmptyState, Notice } from "./feedback"
import { ListGroup, ListHeader, ListItem, ListItems } from "./kibo-ui/list"
import { ResultRow } from "./result-row"
import { TestFileBrowser } from "./test-file-browser"
import { Badge } from "./ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/coss-tabs"
import { UnifiedDiff } from "./unified-diff"
import "@/locales"
import { useState } from "react"
import {
  Timeline,
  TimelineContent,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
} from "@/components/reui/timeline"
import type { TestRun, TestSubmission } from "@/lib/api"

export function TestEvidence({
  submission,
  run,
  withFileList = true,
}: {
  submission: TestSubmission
  run: TestRun | null
  withFileList?: boolean
}) {
  const { t } = useTranslation()
  const [path, setPath] = useState("")
  const files = [
    ...new Set([
      ...(run?.result?.cases.map((item) => item.file) ?? []),
      ...submission.files.map((file) => file.path),
      ...submission.parsed.map((file) => file.path),
    ]),
  ].map((path) => ({ path }))
  const selected = files.find((file) => file.path === path)?.path ?? files[0]?.path ?? ""
  const file = submission.files.find((file) => file.path === selected)
  const scopedSubmission = {
    ...submission,
    parsed: submission.parsed.filter((file) => file.path === selected),
  }
  const scopedRun = run?.result
    ? {
        ...run,
        result: { ...run.result, cases: run.result.cases.filter((item) => item.file === selected) },
      }
    : run
  return (
    <div className="flex h-[32rem] min-h-0 flex-col">
      <TestFileBrowser
        files={withFileList ? files : []}
        path={selected}
        onSelect={setPath}
        label={t("Tests")}
      >
        <Tabs defaultValue="results" className="min-h-0 flex-1">
          <TabsList variant="underline">
            <TabsTrigger value="results">{t("Execution results")}</TabsTrigger>
            <TabsTrigger value="source">{t("Executed source")}</TabsTrigger>
          </TabsList>
          <TabsContent value="results" className="flex h-0 min-h-0 flex-col overflow-auto">
            <TestEvidenceResults submission={scopedSubmission} run={scopedRun} />
          </TabsContent>
          <TabsContent
            value="source"
            aria-label={t("Submitted test source")}
            className="flex h-0 min-h-0 flex-col gap-3 overflow-auto"
          >
            {file ? (
              <UnifiedDiff source={{ path: file.path, content: file.source }} />
            ) : (
              <EmptyState>{t("No recorded test cases in this execution.")}</EmptyState>
            )}
            <p className="break-all text-xs text-muted-foreground">
              {t("Submission {{id}} · Digest {{digest}}", {
                id: submission.id,
                digest: submission.digest,
              })}
            </p>
          </TabsContent>
        </Tabs>
      </TestFileBrowser>
    </div>
  )
}

function TestEvidenceResults({
  submission,
  run,
}: {
  submission: TestSubmission
  run: TestRun | null
}) {
  const { t } = useTranslation()
  const cases = run?.result?.cases ?? []
  const groups = new Map<string, { result: (typeof cases)[number]; index: number }[]>()
  for (const [index, result] of cases.entries()) {
    const group = groups.get(result.state) ?? []
    group.push({ result, index })
    groups.set(result.state, group)
  }
  const states = ["failed", ...Array.from(groups.keys()).filter((state) => state !== "failed")]
  function groupName(state: string) {
    if (state === "passed") {
      return t("Success")
    }
    if (state === "failed") {
      return t("Failed")
    }
    return t(state)
  }
  return (
    <section
      aria-label={t("Observed test results")}
      className="flex w-full min-w-0 content-width-768 flex-col gap-6 [overflow-wrap:anywhere]"
    >
      {run && <ExecutionProgress kind="integration" run={run} />}
      {(!run?.result || !cases.length || run.result.outcome !== "passed") && (
        <Badge variant="outline">{run ? t(run.result?.outcome ?? run.state) : t("Not run")}</Badge>
      )}
      {run?.result?.errors.map((error, index) => (
        <Notice error key={index}>
          {error}
        </Notice>
      ))}

      <div className="min-w-0">
        {states
          .filter((state) => groups.has(state))
          .map((state) => (
            <ListGroup key={state} name={groupName(state)}>
              <ListHeader
                name={groupName(state)}
                count={groups.get(state)?.length ?? 0}
                failed={state === "failed"}
              />
              <ListItems>
                {groups.get(state)?.map(({ result, index }) => {
                  return (
                    <ListItem key={`${index}-${result.file}-${result.name}`}>
                      <ResultRow
                        title={<h3>{result.name}</h3>}
                        metadata={<span>{t(result.state)}</span>}
                      >
                        {Boolean(result.steps?.length) && (
                          <ObservedSteps steps={result.steps ?? []} showDuration={false} />
                        )}
                        {result.errors.map((error, index) => (
                          <Notice error key={index}>
                            <pre className="whitespace-pre-wrap break-words text-code">
                              {`${error.name}: ${error.message}`}
                              {error.stack && `\n${error.stack}`}
                            </pre>
                          </Notice>
                        ))}
                      </ResultRow>
                    </ListItem>
                  )
                })}
              </ListItems>
            </ListGroup>
          ))}
        {!cases.length &&
          submission.parsed.flatMap((file) =>
            file.review.scenarios.map((scenario, index) => (
              <ResultRow
                key={`${file.path}-${index}`}
                title={<h3>{scenario.title}</h3>}
                metadata={
                  <span>
                    {run?.result?.outcome === "environment_error"
                      ? t("Environment failed; no test results were recorded")
                      : t("No recorded result")}
                  </span>
                }
              />
            )),
          )}
      </div>
      {!cases.length && (
        <p className="text-muted-foreground">{t("No individual test results were recorded.")}</p>
      )}
    </section>
  )
}

function ObservedSteps({
  steps,
  showDuration = true,
}: {
  steps: NonNullable<NonNullable<TestRun["result"]>["cases"][number]["steps"]>
  showDuration?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Timeline value={0} aria-label={t("Observed steps")}>
      {steps.map((step, index) => {
        function stepIcon() {
          if (step.state === "passed") {
            return Check
          }
          if (step.state === "failed") {
            return X
          }
          return Minus
        }
        const StepIcon = stepIcon()
        return (
          <TimelineItem step={index + 1} key={step.id} data-step-state={step.state}>
            <TimelineIndicator className="flex items-center justify-center group-data-[orientation=vertical]/timeline:top-0.5">
              <StepIcon className="size-3" aria-hidden="true" />
            </TimelineIndicator>
            <TimelineSeparator className="group-data-[orientation=vertical]/timeline:top-0 group-data-[orientation=vertical]/timeline:translate-y-5" />
            <TimelineContent className="flex min-w-0 flex-col gap-1 leading-5">
              <span className="min-w-0 [overflow-wrap:anywhere]">{step.name}</span>
              <span className="flex flex-wrap items-baseline gap-2 text-xs">
                <span
                  className={step.state === "failed" ? "text-destructive" : "text-muted-foreground"}
                >
                  {t(step.state)}
                </span>
                {showDuration && step.durationMs !== undefined && (
                  <span className="shrink-0 font-mono text-xs">
                    {t("{{duration}} ms", { duration: Math.round(step.durationMs) })}
                  </span>
                )}
              </span>
            </TimelineContent>
          </TimelineItem>
        )
      })}
    </Timeline>
  )
}
