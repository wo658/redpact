import { useTranslation } from "react-i18next"
import "@/locales"
import { ChoiceList } from "./choice-list"

export function LanguageSelector() {
  const { t, i18n } = useTranslation()
  return (
    <ChoiceList
      compact
      label={t("Language")}
      searchable={false}
      options={[
        { value: "en", label: "English" },
        { value: "ko", label: "한국어" },
      ]}
      value={i18n.resolvedLanguage ?? "en"}
      onValueChange={(value) => {
        void i18n.changeLanguage(value)
      }}
    />
  )
}
