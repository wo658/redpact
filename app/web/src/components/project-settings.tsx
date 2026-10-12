import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import type { Api, Project } from "@/lib/api"
import { AuthoredSettings } from "./authored-settings"
import { ProjectTrackingSettings } from "./project-tracking-settings"
import { SettingsSection } from "./settings-row"

export function ProjectSettings({
  api,
  project,
  onChange,
  children,
}: {
  api: Api
  project: Project
  onChange: () => void
  children?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <section aria-label={t("Project settings")} className="settings-page flex flex-col gap-8">
      <header className="pb-2">
        <h1 className="text-2xl font-semibold">{t("Project settings")}</h1>
      </header>
      {children}
      <SettingsSection title={t("General")}>
        <ProjectTrackingSettings
          api={api}
          projectId={project.id}
          git={project.location.kind === "git"}
          onChange={onChange}
        />
      </SettingsSection>
      {typeof api.projectConfiguration === "function" && (
        <AuthoredSettings api={api} projectId={project.id} />
      )}
    </section>
  )
}
