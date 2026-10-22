import { useTranslation } from "react-i18next"
import type { ExecutionSelection } from "../../../server/src/core/types/execution-selection"
import { Notice } from "./feedback"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible"
export function ExecutionSelectionEvidence({
  selection,
}: {
  selection?: (ExecutionSelection & { fileCount?: number; truncated?: boolean }) | null
}) {
  const { t } = useTranslation()
  if (!selection) {
    return null
  }
  let resolved = "Changed tests"
  if (selection.resolved === "all") {
    resolved = "All tests"
  }
  if (selection.resolved === "explicit") {
    resolved = "Explicit tests"
  }
  return (
    <section aria-label={t("Execution scope")} className="flex min-w-0 flex-col gap-2 text-sm">
      <p>
        {t("Requested scope")}: {t(selection.requested === "all" ? "All tests" : "Changed tests")} ·{" "}
        {t("Resolved scope")}: {t(resolved)}
      </p>
      {selection.reason === "supporting_inputs" && (
        <Notice>{t("Helper or configuration changes selected all tests in this target.")}</Notice>
      )}
      <p>
        {t("Comparison revision")}: {selection.baseRevision ?? "—"}
      </p>
      {selection.filesExact === false ? (
        <p>
          {t("The configured command discovers its own files; no exact file list is recorded.")}
        </p>
      ) : (
        <Collapsible>
          <CollapsibleTrigger className="text-left">
            {t("Selected files")} ({selection.fileCount ?? selection.files.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
            {selection.truncated && (
              <p>
                {t(
                  "Only the first 50 selected files are shown. Open the recorded run for the full list.",
                )}
              </p>
            )}
            <ul className="max-h-48 overflow-auto">
              {selection.files.map((file) => (
                <li key={file} className="break-all">
                  {file}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </section>
  )
}
