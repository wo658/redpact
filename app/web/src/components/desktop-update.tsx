import { ArrowUpCircle, LoaderCircle } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useUpdate } from "@/lib/use-update"
import { SettingsRow, SettingsSection } from "./settings-row"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog"

export function DesktopUpdate() {
  const { t } = useTranslation()
  const update = useUpdate()
  const [open, setOpen] = useState(false)
  if (!update.status.version) {
    return null
  }
  const label = t("Update to {{version}}", { version: update.status.version })
  async function install() {
    const result = await update.install()
    if (!result) {
      toast.add({ title: t("Could not request the update. Try again."), type: "error" })
    }
  }
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={<Button variant="outline" size="sm" disabled={update.busy} />}
          onClick={() => {
            if (update.native) {
              void install()
            } else {
              setOpen(true)
            }
          }}
          aria-label={label}
          aria-busy={update.busy}
        >
          {update.busy ? (
            <LoaderCircle data-icon="inline-start" className="animate-spin" />
          ) : (
            <ArrowUpCircle data-icon="inline-start" />
          )}
          {t("Update")}
        </TooltipTrigger>
        <TooltipContent role="tooltip">{label}</TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              {update.status.canInstall
                ? t("Install the update and restart Redpact? Active work will defer installation.")
                : t(
                    "Automatic installation is unavailable. Update with the original package manager, then restart Redpact. For npx, stop this process and run npx redpact@latest serve with the same options.",
                  )}
            </DialogDescription>
          </DialogHeader>
          {update.error && <p role="alert">{update.error}</p>}
          {update.busy && <p role="status">{t("Updating and restarting…")}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{t("Close")}</DialogClose>
            {update.status.canInstall && (
              <Button disabled={update.busy} onClick={() => void install()}>
                {t("Install and restart")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function UpdateSettings() {
  const { t } = useTranslation()
  const update = useUpdate()
  return (
    <SettingsSection title={t("Updates")}>
      <SettingsRow title={t("Check for updates")}>
        {update.status.currentVersion && (
          <span>
            {t("Current version: {{version}}", { version: update.status.currentVersion })}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={update.busy}
          onClick={async () => {
            const result = await update.check()
            if (result) {
              toast.add({
                title: result.version
                  ? t("Update to {{version}}", { version: result.version })
                  : t("Redpact is up to date."),
              })
            }
          }}
        >
          {t("Check for updates")}
        </Button>
        {update.error && (
          <p role="alert">
            {t("Could not check for updates.")} {update.error}
          </p>
        )}
      </SettingsRow>
    </SettingsSection>
  )
}
