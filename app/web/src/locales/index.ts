import { createInstance } from "i18next"
import { initReactI18next } from "react-i18next"
import { en } from "./en"
import { ko } from "./ko"

export const languageStorageKey = "redpact:language"
export const resources = { en: { translation: en }, ko: { translation: ko } }
export type Language = "en" | "ko"

export function preferredLanguage(): Language {
  if (typeof window === "undefined") {
    return "en"
  }
  try {
    const saved = localStorage.getItem(languageStorageKey)
    if (saved === "en" || saved === "ko") {
      return saved
    }
  } catch {
    // Language switching remains available when browser storage is blocked.
  }
  for (const language of navigator.languages) {
    const base = language.toLowerCase().split("-")[0]
    if (base === "en" || base === "ko") {
      return base
    }
  }
  return "en"
}

export const i18n = createInstance()
void i18n.use(initReactI18next).init({
  resources,
  lng: preferredLanguage(),
  supportedLngs: ["en", "ko"],
  fallbackLng: "en",
  load: "languageOnly",
  keySeparator: false,
  nsSeparator: false,
  initAsync: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
})

function updateDocumentLanguage(language: string) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = language
  }
}
updateDocumentLanguage(i18n.resolvedLanguage ?? "en")
i18n.on("languageChanged", () => {
  const language = i18n.resolvedLanguage ?? "en"
  updateDocumentLanguage(language)
  if (typeof window === "undefined") {
    return
  }
  try {
    localStorage.setItem(languageStorageKey, language)
  } catch {
    // A storage failure must not prevent switching the active language.
  }
})
