import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { Api, ProjectTracking } from "@/lib/api"
import { ChoiceList } from "./choice-list"
import { Loading, Notice } from "./feedback"
import { useLiveRevision } from "./live-updates"
import { SettingsRow } from "./settings-row"

export function ProjectTrackingSettings({
  api,
  projectId,
  onChange,
  git = true,
}: {
  api: Api
  projectId: string
  onChange: () => void
  git?: boolean
}) {
  const { t } = useTranslation()
  const liveRevision = useLiveRevision()
  const [value, setValue] = useState<{
    projectRoot: string
    tracking: ProjectTracking
  } | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [branches, setBranches] = useState<string[] | null>(null)
  const [branchError, setBranchError] = useState("")
  useEffect(() => {
    void liveRevision
    const abort = new AbortController()
    if (!git) {
      return () => abort.abort()
    }
    void api
      .getBranches(projectId, abort.signal)
      .then((result) => {
        if (!abort.signal.aborted) {
          setBranches(result)
          setBranchError("")
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          setBranchError(error instanceof Error ? error.message : t("The request failed."))
        }
      })
    return () => abort.abort()
  }, [api, projectId, git, t, liveRevision])
  useEffect(() => {
    void liveRevision
    const abort = new AbortController()
    void api
      .getTracking(projectId, abort.signal)
      .then((result) => {
        if (!abort.signal.aborted) {
          setValue(result)
          setError("")
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          setError(error instanceof Error ? error.message : t("The request failed."))
        }
      })
    return () => abort.abort()
  }, [api, projectId, t, liveRevision])
  async function save(tracking: ProjectTracking) {
    if (pending) {
      return
    }
    setPending(true)
    setError("")
    try {
      const updated = await api.setTracking(projectId, tracking)
      setValue((current) =>
        current ? { ...current, tracking: updated.tracking ?? tracking } : current,
      )
      if (value?.tracking.mainBranch !== tracking.mainBranch) {
      }
      onChange()
    } catch (error) {
      setError(error instanceof Error ? error.message : t("The request failed."))
    } finally {
      setPending(false)
    }
  }
  return (
    <>
      {error && <Notice error>{error}</Notice>}
      {!value && !error && <Loading>{t("Loading tracking settings…")}</Loading>}
      {value && (
        <SettingsRow title={t("Project root directory")}>
          <code className="break-all">{value.projectRoot}</code>
        </SettingsRow>
      )}
      {branchError && <Notice error>{branchError}</Notice>}
      {value && git && (
        <>
          <SettingsRow title={t("Main branch")}>
            <ChoiceList
              label={t("Main branch")}
              options={[
                { value: "", label: t("Not configured") },
                ...(branches ?? []).map((branch) => ({ value: branch, label: branch })),
              ]}
              value={value.tracking.mainBranch ?? ""}
              disabled={pending || !branches}
              compact
              onValueChange={(branch) =>
                void save({
                  ...value.tracking,
                  mainBranch: branch || null,
                  hideMerged: branch ? value.tracking.hideMerged : false,
                })
              }
            />
          </SettingsRow>
        </>
      )}
    </>
  )
}
