import { createContext, type ReactNode, useContext, useLayoutEffect, useState } from "react"

export type Theme = "light" | "dark" | "system"
export const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void }>({
  theme: "system",
  setTheme: () => {},
})
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState<Theme>(() => {
    try {
      const saved = window.localStorage.getItem("redpact:theme")
      if (saved === "light" || saved === "dark") {
        return saved
      }
    } catch {
      // Storage restrictions must not prevent changing appearance.
    }
    return "system"
  })
  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches)
      document.documentElement.classList.toggle("dark", dark)
      document.documentElement.style.colorScheme = dark ? "dark" : "light"
    }
    apply()
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [theme])
  const setTheme = (next: Theme) => {
    updateTheme(next)
    try {
      window.localStorage.setItem("redpact:theme", next)
    } catch {
      // Keep the current page usable when persistence is blocked.
    }
  }
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}
export function useTheme() {
  return useContext(ThemeContext)
}
