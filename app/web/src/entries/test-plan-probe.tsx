import "./sidebar-csp"
import { App } from "@modelcontextprotocol/ext-apps"
import { PlusIcon, XIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { ReviewToolbar } from "../components/review-toolbar"
import { Button } from "../components/ui/button"
import { Tabs, TabsContent, TabsTrigger } from "../components/ui/coss-tabs"
import { Field } from "../components/ui/field"
import { Textarea } from "../components/ui/textarea"
import { cn } from "../lib/utils"
import "../index.css"

const kinds = ["Unit", "Integration", "Playwright"] as const
type Kind = (typeof kinds)[number]
type Item = { id: number; text: string }
const seeds: Record<Kind, Item[]> = {
  Unit: [{ id: 1, text: "A duplicate email is rejected without changing the existing account." }],
  Integration: [
    { id: 2, text: "A duplicate signup request leaves exactly one account in storage." },
  ],
  Playwright: [
    { id: 3, text: "A user can submit the signup form and see the duplicate email message." },
  ],
}
const app = new App({ name: "Redpact Test Plan Probe", version: "0.0.1" }, {})
function applyTheme(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme
  document.documentElement.classList.toggle("dark", theme === "dark")
  document.documentElement.style.colorScheme = theme
}
function TestPlanProbe() {
  const [kind, setKind] = useState<Kind>("Unit")
  const [plans, setPlans] = useState(seeds)
  const [nextId, setNextId] = useState(4)
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState("Connecting to host…")
  useEffect(() => {
    app.onhostcontextchanged = (context) => {
      if (context.theme) {
        applyTheme(context.theme)
      }
    }
    void app
      .connect()
      .then(() => {
        applyTheme(app.getHostContext()?.theme ?? "light")
        const supported = Boolean(app.getHostCapabilities()?.message)
        setReady(supported)
        setStatus(
          supported
            ? "Connected. Edit the plan, then submit it to this chat."
            : "This host does not advertise chat message support. Editing works; submission is unavailable.",
        )
      })
      .catch((error: unknown) => setStatus(`Host connection failed: ${String(error)}`))
  }, [])
  function update(items: Item[]) {
    setPlans((current) => ({ ...current, [kind]: items }))
  }
  async function submit() {
    if (kinds.every((name) => plans[name].every((item) => !item.text.trim()))) {
      setStatus("Add at least one test before submitting.")
      return
    }
    const marker = `REDPACT-PROBE-${crypto.randomUUID()}`
    const text = [
      "This is a Redpact MCP Apps round-trip verification, not authorization to execute tests.",
      `Marker: ${marker}`,
      "I edited the following natural-language test plan in the app. Confirm receipt by repeating the marker and my revised tests, then describe the next TDD step without executing anything.",
      ...kinds.map((name) => {
        const tests = plans[name].filter((item) => item.text.trim())
        return `\n${name}\n${tests.length ? tests.map((item, index) => `${index + 1}. ${item.text}`).join("\n") : "(No tests)"}`
      }),
    ].join("\n")
    setPending(true)
    setStatus("Submitting to host…")
    try {
      const result = await app.sendMessage({ role: "user", content: [{ type: "text", text }] })
      setStatus(
        result.isError
          ? "Host rejected the message. Your edits are preserved; retry or send them manually."
          : `Host accepted ${marker}. Check the chat for receipt; host acceptance alone does not prove GPT received it.`,
      )
    } catch (error) {
      setStatus(`Submission failed: ${String(error)}. Your edits are preserved.`)
    } finally {
      setPending(false)
    }
  }
  return (
    <main className="mx-auto w-full max-w-3xl bg-background text-foreground">
      <Tabs value={kind} onValueChange={(value) => setKind(value as Kind)} className="gap-0">
        <ReviewToolbar label="Test type">
          {kinds.map((name) => (
            <TabsTrigger key={name} value={name}>
              {name}
            </TabsTrigger>
          ))}
        </ReviewToolbar>
        {kinds.map((name) => (
          <TabsContent key={name} value={name} className="px-3 py-2">
            <ol aria-label={`${name} tests`} className="flex flex-col gap-1">
              {plans[name].map((item, index) => (
                <li key={item.id} className="flex items-start gap-2 py-1">
                  <span className="w-5 shrink-0 pt-2 text-xs tabular-nums text-muted-foreground">
                    {index + 1}.
                  </span>
                  <Field className="min-w-0 flex-1">
                    <Textarea
                      rows={1}
                      aria-label={`${name} test ${index + 1}`}
                      value={item.text}
                      className="min-h-0 resize-none"
                      onChange={(event) =>
                        update(
                          plans[name].map((entry) =>
                            entry.id === item.id ? { ...entry, text: event.target.value } : entry,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${name} test ${index + 1}`}
                    onClick={() => update(plans[name].filter((entry) => entry.id !== item.id))}
                  >
                    <XIcon />
                  </Button>
                </li>
              ))}
            </ol>
            <Button
              variant="ghost"
              size="toolbar"
              aria-label={`Add ${name} test`}
              onClick={() => {
                update([...plans[name], { id: nextId, text: "" }])
                setNextId(nextId + 1)
              }}
            >
              <PlusIcon data-icon="inline-start" />
              Add test
            </Button>
          </TabsContent>
        ))}
      </Tabs>
      <footer className="flex flex-col items-end gap-2 border-t px-3 py-3">
        <Button size="toolbar" disabled={!ready || pending} onClick={() => void submit()}>
          Submit to chat
        </Button>
        <p
          role="status"
          className={cn(
            "max-w-full text-xs break-words text-muted-foreground",
            status.startsWith("Connected.") && "sr-only",
          )}
        >
          {status}
        </p>
      </footer>
    </main>
  )
}
const element = document.getElementById("root")
if (!element) {
  throw new Error("Test plan probe root unavailable")
}
createRoot(element).render(<TestPlanProbe />)
