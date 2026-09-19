import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { Api } from "@/lib/api"
import { Notice } from "./feedback"
import { SettingsRow } from "./settings-row"
import { Button } from "./ui/button"

export function GitHubSettings({ api }: { api: Api }) {
  const { t } = useTranslation()
  const [connection, setConnection] = useState<Awaited<ReturnType<Api["githubConnection"]>> | null>(
    null,
  )
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  return (
    <SettingsRow title={t("GitHub")}>
      <div className="flex flex-col gap-3">
        {connection && (
          <p className="break-all text-sm">
            {t("Connected as {{login}}", { login: connection.login })}
            <br />
            <span className="text-muted-foreground">{connection.cliPath}</span>
          </p>
        )}
        {error && <Notice>{t(error)}</Notice>}
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => {
            setPending(true)
            setConnection(null)
            setError("")
            void api
              .githubConnection()
              .then(setConnection)
              .catch((cause) => {
                setError(cause instanceof Error ? cause.message : String(cause))
              })
              .finally(() => setPending(false))
          }}
        >
          {pending ? t("Checking…") : t("Check GitHub connection")}
        </Button>
      </div>
    </SettingsRow>
  )
}
