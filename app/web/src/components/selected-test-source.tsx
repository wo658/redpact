import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { Api, TestSource, UnitInspection } from "@/lib/api"
import { Loading, Notice } from "./feedback"
import { TestCode } from "./test-code"

export function SelectedTestSource({
  api,
  worktreeId,
  kind,
  path,
  scope,
  catalog,
}: {
  api: Api
  worktreeId: string
  kind: "unit" | "integration"
  path: string
  scope: "changed" | "all"
  catalog: UnitInspection["catalog"]
}) {
  const { t } = useTranslation()
  const [source, setSource] = useState<TestSource>()
  useEffect(() => {
    void catalog
    const abort = new AbortController()
    setSource(undefined)
    void api
      .testSource(worktreeId, kind, path, abort.signal)
      .then((result) => {
        if (!abort.signal.aborted) {
          setSource(result)
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          setSource({ path, source: null, issue: String(error) })
        }
      })
    return () => abort.abort()
  }, [api, worktreeId, kind, path, catalog])
  if (!source) {
    return <Loading>{t("Loading…")}</Loading>
  }
  if (source.source === null) {
    return <Notice error>{source.issue}</Notice>
  }
  return (
    <TestCode
      api={api}
      worktreeId={worktreeId}
      scope={scope}
      baseRevision={catalog.baseRevision}
      source={{ path, content: source.source }}
    />
  )
}
