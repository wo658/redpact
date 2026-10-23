import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import { SettingsSection } from "./settings-row"
import { Button } from "./ui/button"
import { Toaster, toast } from "./ui/toast"

type Problem = { message: string; location: string; count: number; lastSeen: number }
type Reporter = (message: string) => void
const ReportContext = createContext<Reporter | null>(null)
const ListContext = createContext<{ problems: Problem[]; clear: () => void } | null>(null)

export function ProblemsProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [problems, setProblems] = useState<Problem[]>([])
  const currentProblems = useRef<Problem[]>([])
  const [notification, setNotification] = useState<{ title: string; description: string } | null>(
    null,
  )
  // Descendant reports may run before the toast provider subscribes on initial mount.
  useEffect(() => {
    if (notification) {
      toast.add({
        ...notification,
        id: "session-problems",
        type: "warning",
        timeout: 8000,
        data: { dismissOnClick: true },
      })
    }
  }, [notification])
  const report = useCallback(
    (text: string) => {
      const message = text.slice(0, 16384)
      const location = window.location.pathname + window.location.search
      const lastSeen = Date.now()
      const previous = currentProblems.current.find(
        (item) => item.message === message && item.location === location,
      )
      const next = [
        { message, location, lastSeen, count: (previous?.count ?? 0) + 1 },
        ...currentProblems.current.filter((item) => item !== previous),
      ].slice(0, 100)
      currentProblems.current = next
      setProblems(next)
      if (!previous) {
        setNotification({
          title: t("Problem recorded"),
          description: t("See Settings for details."),
        })
      }
    },
    [t],
  )
  const clear = useCallback(() => {
    currentProblems.current = []
    setProblems([])
    setNotification(null)
    toast.close("session-problems")
  }, [])
  const value = useMemo(() => ({ problems, clear }), [problems, clear])
  return (
    <Toaster>
      <ReportContext value={report}>
        <ListContext value={value}>{children}</ListContext>
      </ReportContext>
    </Toaster>
  )
}

export function useProblem(message: string, enabled: boolean) {
  const report = useContext(ReportContext)
  const recorded = useRef("")
  useEffect(() => {
    if (!enabled || !message) {
      recorded.current = ""
      return
    }
    if (report && recorded.current !== message) {
      recorded.current = message
      report(message)
    }
  }, [report, message, enabled])
  return Boolean(report)
}

export function ProblemsSettings() {
  const { t, i18n } = useTranslation()
  const state = useContext(ListContext)
  if (!state) {
    return null
  }
  return (
    <SettingsSection
      title={`${t("Problems")} (${state.problems.length})`}
      description={t(
        "Problems collected in this browser session. Background failures do not interrupt your work.",
      )}
    >
      {state.problems.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{t("No problems recorded.")}</p>
      ) : (
        <>
          <div className="p-4">
            <Button variant="outline" size="sm" onClick={state.clear}>
              {t("Clear problems")}
            </Button>
          </div>
          <ul className="min-w-0 divide-y border-t">
            {state.problems.map((problem) => (
              <li
                key={JSON.stringify([problem.message, problem.location])}
                className="flex min-w-0 flex-col gap-2 p-4"
              >
                <p className="whitespace-pre-wrap break-words text-sm">{problem.message}</p>
                <p className="break-all text-xs text-muted-foreground">
                  {new Date(problem.lastSeen).toLocaleString(i18n.language)} · {problem.count} ·{" "}
                  {problem.location}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </SettingsSection>
  )
}
