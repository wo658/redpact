import { Settings, Star } from "lucide-react"
import type { ComponentProps, MouseEvent } from "react"
import { useTranslation } from "react-i18next"
import { DesktopUpdate } from "@/components/desktop-update"
import { Button, buttonVariants } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { desktopInvoke, repositoryUrl } from "@/lib/desktop"

function GitHubIcon(props: ComponentProps<"svg">) {
  return (
    <svg aria-hidden="true" viewBox="0 0 19 19" {...props}>
      <use href="/icons.svg#github-icon" />
    </svg>
  )
}

export function AppShortcuts({
  onSettings,
  settingsActive,
  pending,
}: {
  onSettings?: () => void
  settingsActive: boolean
  pending: boolean
}) {
  const { t } = useTranslation()
  async function openRepository(event: MouseEvent<HTMLAnchorElement>) {
    const invoke = desktopInvoke()
    if (!invoke) {
      return
    }
    event.preventDefault()
    try {
      await invoke("desktop_open_repository")
    } catch {
      toast.add({ title: t("Could not open GitHub. Try again."), type: "error" })
    }
  }
  return (
    <fieldset aria-label={t("App shortcuts")} className="flex items-center gap-1">
      {onSettings && (
        <Tooltip>
          <TooltipTrigger
            render={<Button variant="ghost" size="icon" disabled={pending} />}
            onClick={onSettings}
            aria-label={t("Settings")}
            aria-current={settingsActive ? "page" : undefined}
            aria-pressed={settingsActive}
          >
            <Settings aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent role="tooltip">{t("Settings")}</TooltipContent>
        </Tooltip>
      )}
      {[
        { label: t("GitHub repository"), icon: GitHubIcon },
        { label: t("Star on GitHub"), icon: Star },
      ].map(({ label, icon: Icon }) => (
        <Tooltip key={label}>
          <TooltipTrigger
            render={
              <a
                href={repositoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "ghost", size: "icon" })}
                onClick={(event) => void openRepository(event)}
              />
            }
            aria-label={label}
          >
            <Icon aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent role="tooltip">{label}</TooltipContent>
        </Tooltip>
      ))}
      <div className="ml-auto">
        <DesktopUpdate />
      </div>
    </fieldset>
  )
}
