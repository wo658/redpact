import { Check, Copy } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Alert, AlertDescription } from "./ui/alert"
import { Button } from "./ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible"

export type HandoffContext = {
  title: string
  summary: string
  fields: Array<[string, string]>
  diagnostics?: Array<[string, string]>
}

type HandoffDetails = {
  label: ReactNode
  children: ReactNode
}

export function formatHandoffContext({ title, summary, fields, diagnostics = [] }: HandoffContext) {
  return [
    title,
    summary,
    ...fields.map(([label, value]) => `${label}: ${value}`),
    ...diagnostics.flatMap(([label, value]) => [`${label}:`, value]),
  ].join("\n")
}

export function CopyHandoff({
  context,
  children,
  details,
  showContext = true,
}: {
  context: HandoffContext
  children: ReactNode
  details?: HandoffDetails
  showContext?: boolean
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState("")
  const copyText = formatHandoffContext(context)
  useEffect(() => {
    if (!copied) {
      return
    }
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  async function copy() {
    setCopied(false)
    setError("")
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
    } catch {
      setError(t("Copy failed. Select the text below."))
    }
  }
  return (
    <section className="shrink-0 rounded-md border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-medium">{context.title}</h3>
        <Button variant="outline" size="sm" onClick={() => void copy()}>
          {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
          {t(copied ? "Copied" : "Copy")}
        </Button>
      </div>
      <div className="pt-2">{children}</div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {(showContext || error) && (
        <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-xs">
          {copyText}
        </pre>
      )}
      {details && (
        <Collapsible className="mt-2">
          <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
            {details.label}
          </CollapsibleTrigger>
          <CollapsibleContent>{details.children}</CollapsibleContent>
        </Collapsible>
      )}
    </section>
  )
}
