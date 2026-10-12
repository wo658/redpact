import { useTranslation } from "react-i18next"
import { type Theme, useTheme } from "@/lib/theme"
import "@/locales"
import { ChoiceList } from "./choice-list"
import { SettingsRow } from "./settings-row"

export function ThemeChoice({
  value,
  onValueChange,
}: {
  value: Theme
  onValueChange: (theme: Theme) => void
}) {
  const { t } = useTranslation()
  return (
    <SettingsRow title={t("Theme")}>
      <ChoiceList
        compact
        searchable={false}
        label={t("Theme")}
        value={value}
        options={[
          { value: "light", label: t("Light") },
          { value: "dark", label: t("Dark") },
          { value: "system", label: t("System") },
        ]}
        onValueChange={(next) => {
          if (next === "light" || next === "dark" || next === "system") {
            onValueChange(next)
          }
        }}
      />
    </SettingsRow>
  )
}
export function ThemeSettings() {
  const { theme, setTheme } = useTheme()
  return <ThemeChoice value={theme} onValueChange={setTheme} />
}
