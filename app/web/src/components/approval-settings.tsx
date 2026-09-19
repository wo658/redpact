import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { Api } from "@/lib/api"
import { ChoiceList } from "./choice-list"
import { Notice } from "./feedback"
import { SettingsRow } from "./settings-row"

export function ApprovalSettings({ api }: { api: Api }) {
  const { t } = useTranslation()
  const [policy, setPolicy] = useState<"auto" | "ask">()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    const abort = new AbortController()
    void api
      .approvalPolicy(abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) {
          setPolicy(value.policy)
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setError(t("Approval settings unavailable."))
        }
      })
    return () => abort.abort()
  }, [api, t])
  async function update(value: string) {
    setPending(true)
    setError("")
    try {
      setPolicy((await api.setApprovalPolicy(value as "auto" | "ask")).policy)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("Approval settings unavailable."))
    } finally {
      setPending(false)
    }
  }
  return (
    <SettingsRow
      title={t("MCP approval")}
      description={t("Applies to future MCP test requests across all projects.")}
    >
      <ChoiceList
        compact
        label={t("MCP approval")}
        value={policy ?? ""}
        disabled={pending || !policy}
        options={[
          { value: "auto", label: t("Auto") },
          { value: "ask", label: t("Ask first") },
        ]}
        onValueChange={(value) => void update(value)}
      />
      {error && <Notice error>{error}</Notice>}
    </SettingsRow>
  )
}
