import { Settings, Star } from "lucide-react"
import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"
import { RuntimeUpdate } from "@/components/runtime-update"
import { Button, buttonVariants } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { viewerUrl } from "@/lib/viewer-url"

function GitHubIcon(props: ComponentProps<"svg">) {
  return (
    <svg aria-hidden="true" viewBox="0 0 19 19" {...props}>
      <use
        href={
          typeof document !== "undefined" && document.getElementById("github-icon")
            ? "#github-icon"
            : viewerUrl("/icons.svg#github-icon")
        }
      />
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
                href="https://github.com/wo658/redpact"
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "ghost", size: "icon" })}
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
        <RuntimeUpdate />
      </div>
    </fieldset>
  )
}
