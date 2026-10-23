import { TriangleAlert } from "lucide-react"
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
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog"

type Problem = { message: string; location: string; count: number; lastSeen: number }
type Reporter = (message: string) => void
const ReportContext = createContext<Reporter | null>(null)
const ListContext = createContext<{ problems: Problem[]; clear: () => void } | null>(null)

export function ProblemsProvider({ children }: { children: ReactNode }) {
  const [problems, setProblems] = useState<Problem[]>([])
  const report = useCallback((text: string) => {
    const message = text.slice(0, 16384)
    const location = window.location.pathname + window.location.search
    const lastSeen = Date.now()
    setProblems((current) => {
      const previous = current.find(
        (item) => item.message === message && item.location === location,
      )
      return [
        { message, location, lastSeen, count: (previous?.count ?? 0) + 1 },
        ...current.filter((item) => item !== previous),
      ].slice(0, 100)
    })
  }, [])
  const clear = useCallback(() => setProblems([]), [])
  const value = useMemo(() => ({ problems, clear }), [problems, clear])
  return (
    <ReportContext value={report}>
      <ListContext value={value}>{children}</ListContext>
    </ReportContext>
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

export function ProblemsButton() {
  const { t, i18n } = useTranslation()
  const state = useContext(ListContext)
  if (!state) {
    return null
  }
  const label = `${t("Problems")} (${state.problems.length})`
  return (
    <Dialog>
      <DialogTrigger
        render={<Button variant="ghost" size="toolbar" aria-label={label} title={label} />}
      >
        <TriangleAlert aria-hidden="true" />
        <Badge
          aria-hidden="true"
          variant={state.problems.length > 0 ? "destructive" : "secondary"}
          className="tabular-nums"
        >
          {state.problems.length}
        </Badge>
      </DialogTrigger>
      <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("Problems")}</DialogTitle>
          <DialogDescription>
            {t(
              "Problems collected in this browser session. Background failures do not interrupt your work.",
            )}
          </DialogDescription>
        </DialogHeader>
        {state.problems.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("No problems recorded.")}</p>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={state.clear}>
              {t("Clear problems")}
            </Button>
            <ul className="min-w-0 divide-y">
              {state.problems.map((problem) => (
                <li
                  key={JSON.stringify([problem.message, problem.location])}
                  className="flex min-w-0 flex-col gap-2 py-3"
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
      </DialogContent>
    </Dialog>
  )
}
