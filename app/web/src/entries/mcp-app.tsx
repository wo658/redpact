import { App } from "@modelcontextprotocol/ext-apps"
import { useCallback, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { EnvironmentCard, TestCard } from "@/components/mcp/cards"
import { CredentialCard } from "@/components/mcp/credential-card"
import { type CardActions, type Snapshot, snapshotSchema } from "@/components/mcp/model"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import "../locales/index"
import "../index.css"

const app = new App({ name: "Redpact", version: "0.1.0" }, {}, { autoResize: true })
function McpView() {
  const [data, setData] = useState<Snapshot>()
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const receive = useCallback((result: { _meta?: Record<string, unknown> }) => {
    const parsed = snapshotSchema.safeParse(result._meta?.redpact)
    if (!parsed.success) {
      setError("This response has no supported Redpact snapshot.")
      return
    }
    setData(parsed.data)
  }, [])
  useEffect(() => {
    app.ontoolresult = receive
    app.onhostcontextchanged = (context) => {
      if (context.theme) {
        document.documentElement.classList.toggle("dark", context.theme === "dark")
      }
    }
    void app
      .connect()
      .then(() => {
        document.documentElement.classList.toggle("dark", app.getHostContext()?.theme === "dark")
      })
      .catch((failure) => setError(String(failure)))
    return () => {
      void app.close()
    }
  }, [receive])
  async function call(name: string, args: Record<string, unknown>, updateSnapshot: boolean) {
    if (busy) {
      return
    }
    setBusy(true)
    setError("")
    try {
      const result = await app.callServerTool({ name, arguments: args })
      if (result.isError) {
        throw new Error(
          result.content
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n"),
        )
      }
      if (updateSnapshot) {
        receive(result)
      } else {
        setData((previous) =>
          previous ? { ...previous, nextPolicy: args.policy as "auto" | "ask" } : previous,
        )
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }
  const actions: CardActions = {
    busy,
    approve: (subject, selection) => {
      if (data?.review) {
        void call(
          "review_action",
          {
            id: data.review.id,
            revision: data.review.revision,
            token: data.token,
            subject,
            ...(selection ? { selection } : {}),
          },
          true,
        )
      }
    },
    changePolicy: (policy) => {
      if (data?.token) {
        void call("set_approval_policy", { token: data.token, policy }, false)
      }
    },
  }
  return (
    <main className="flex min-w-0 flex-col gap-3 p-2">
      {error && (
        <Alert>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {data?.kind === "inputs" && (
        <CredentialCard
          key={data.token}
          inputs={data.inputs ?? []}
          save={async (name, value) => {
            const result = await app.callServerTool({
              name: "submit_key",
              arguments: { token: data.token, name, value },
            })
            if (result.isError) {
              throw new Error("Could not save key")
            }
            return { configured: result.structuredContent?.configured === true }
          }}
        />
      )}
      {!data && !error && <Skeleton className="h-32 w-full" />}
      {data && data.kind !== "tests" && data.kind !== "inputs" && (
        <EnvironmentCard
          key={`${data.review?.id ?? data.path}-${data.review?.revision ?? 0}`}
          data={data}
          actions={actions}
        />
      )}
      {data && data.kind !== "environment" && data.kind !== "inputs" && (
        <TestCard data={data} actions={actions} />
      )}
    </main>
  )
}
const root = document.getElementById("root")
if (!root) {
  throw new Error("#root not found")
}
createRoot(root).render(<McpView />)
