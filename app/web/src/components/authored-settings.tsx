import { useEffect, useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { type Api, ApiError, type SettingsDocument, type SettingsEdit } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Loading, Notice } from "./feedback"
import { ProjectConfigurationForm } from "./project-configuration-form"
import { errorMessage } from "./settings-edit-error"
import { SettingsSection } from "./settings-row"
import { TestEnvironmentFields } from "./test-environment-fields"
import { Button } from "./ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from "./ui/field"
import { Input } from "./ui/input"
import { Textarea } from "./ui/textarea"

export type Entry = {
  key: string
  label: string
  kind: "lines" | "number" | "text" | "json"
  fallback: string
  required?: boolean
  min?: number
  max?: number
}
type ObjectValue = Record<string, unknown>
function object(value: unknown): ObjectValue {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as ObjectValue)
    : {}
}
function fieldValue(value: ObjectValue, entry: Entry): string {
  const [parent, child] = entry.key.split(".")
  const authored = child ? object(value[parent])[child] : value[parent]
  if (authored === undefined) {
    return ""
  }
  if (entry.kind === "json") {
    return JSON.stringify(authored, null, 2)
  }
  if (entry.kind === "lines" && Array.isArray(authored)) {
    return authored.join("\n")
  }
  return String(authored)
}
function setField(value: ObjectValue, entry: Entry, text: string) {
  const [parent, child] = entry.key.split(".")
  const target = child ? object(value[parent]) : value
  const key = child ?? parent
  if (!text.trim()) {
    delete target[key]
  } else if (entry.kind === "json") {
    const parsed: unknown = JSON.parse(text)
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${entry.key}: expected a JSON object`)
    }
    target[key] = parsed
  } else if (entry.kind === "lines") {
    target[key] = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  } else if (entry.kind === "number") {
    target[key] = Number(text)
  } else {
    target[key] = text
  }
  if (child) {
    value[parent] = target
  }
}

export function AuthoredSettings({ api, projectId }: { api: Api; projectId?: string }) {
  const { t } = useTranslation()
  const [document, setDocument] = useState<SettingsDocument>()
  const [error, setError] = useState("")
  const [reload, setReload] = useState(0)
  const [saved, setSaved] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: explicit conflict recovery reloads the file.
  useEffect(() => {
    const abort = new AbortController()
    const request = projectId
      ? api.projectConfiguration(projectId, abort.signal)
      : api.instanceSettings(abort.signal)
    void request
      .then((value) => {
        if (!abort.signal.aborted) {
          setDocument(value)
          setError("")
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          setError(errorMessage(error))
        }
      })
    return () => abort.abort()
  }, [api, projectId, reload])
  const entries: Entry[] = projectId
    ? [
        {
          key: "composeFiles",
          label: t("Compose files"),
          kind: "lines",
          fallback: "compose.yaml",
          required: false,
        },
        {
          key: "unitTests.dockerfile",
          label: t("Unit test Dockerfile"),
          kind: "text",
          fallback: "",
        },
        { key: "unitTests.command", label: t("Unit test command"), kind: "text", fallback: "" },
        {
          key: "unitTests.cwd",
          label: t("Unit test working directory"),
          kind: "text",
          fallback: ".",
        },
        {
          key: "unitTests.patterns",
          label: t("Unit test file patterns"),
          kind: "lines",
          fallback: "",
        },
        {
          key: "playwright.directory",
          label: t("Playwright scenario directory"),
          kind: "text",
          fallback: "ui-tests",
        },
        {
          key: "playwright.service",
          label: t("Playwright application service"),
          kind: "text",
          fallback: "",
        },
        {
          key: "playwright.port",
          label: t("Playwright application port"),
          kind: "number",
          fallback: "3000",
          min: 1,
          max: 65535,
        },
        {
          key: "playwright.uiLanguage",
          label: t("Playwright UI language"),
          kind: "text",
          fallback: "en",
        },
        { key: "tests.directory", label: t("Test directory"), kind: "text", fallback: "tests" },
        {
          key: "tests.timeoutMs",
          label: t("Test and hook timeout (ms)"),
          kind: "number",
          fallback: "10000",
          min: 1,
          max: 60000,
        },
        { key: "tests.env", label: t("Test environment"), kind: "json", fallback: "{}" },
      ]
    : [
        {
          key: "environmentConcurrency",
          label: t("Managed environment concurrency"),
          kind: "number",
          fallback: "2",
          min: 1,
          max: 4,
        },
        {
          key: "testResources.memoryMiB",
          label: t("Test memory limit (MiB)"),
          kind: "number",
          fallback: "2048",
          min: 64,
          max: 1048576,
        },
        {
          key: "testResources.timeoutSeconds",
          label: t("Test run time limit (seconds)"),
          kind: "number",
          fallback: "600",
          min: 1,
          max: 86400,
        },
        {
          key: "server.port",
          label: t("Server port"),
          kind: "number",
          fallback: "54318",
          min: 0,
          max: 65535,
        },
        { key: "projects", label: t("Observed project directories"), kind: "lines", fallback: "" },
        { key: "github.cliPath", label: t("GitHub CLI path"), kind: "text", fallback: "" },
      ]
  if (projectId) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        {error && <Notice error>{error}</Notice>}
        {saved && <Notice>{t("Settings saved.")}</Notice>}
        {!document && !error && <Loading>{t("Loading settings…")}</Loading>}
        {!document && error && (
          <Button variant="outline" onClick={() => setReload((value) => value + 1)}>
            {t("Retry")}
          </Button>
        )}
        {document && (
          <ProjectConfigurationForm
            key={`${document.revision}:${reload}`}
            document={document}
            entries={entries}
            onSave={(input) => api.saveProjectConfiguration(projectId, input)}
            onSaved={(value) => {
              setDocument(value)
              setSaved(true)
            }}
            onEdit={() => setSaved(false)}
            onReload={() => {
              setSaved(false)
              setReload((value) => value + 1)
            }}
          />
        )}
      </div>
    )
  }
  return (
    <SettingsSection
      title={projectId ? t("Project configuration") : t("Instance configuration")}
      description={
        projectId
          ? t(
              "Shared project settings. Saving validates Compose references without starting services.",
            )
          : t(
              "Server port changes require a restart. Project directories are observed automatically.",
            )
      }
    >
      <div className="flex min-w-0 flex-col gap-4 p-4">
        {error && <Notice error>{error}</Notice>}
        {saved && <Notice>{t("Settings saved.")}</Notice>}
        {!document && !error && <Loading>{t("Loading settings…")}</Loading>}
        {!document && error && (
          <Button variant="outline" onClick={() => setReload((value) => value + 1)}>
            {t("Retry")}
          </Button>
        )}
        {document && (
          <ConfigurationForm
            key={`${document.revision}:${reload}`}
            document={document}
            entries={entries}
            onSave={(input) =>
              projectId
                ? api.saveProjectConfiguration(projectId, input)
                : api.saveInstanceSettings(input)
            }
            onSaved={(value) => {
              setDocument(value)
              setSaved(true)
            }}
            onEdit={() => setSaved(false)}
            onReload={() => setReload((value) => value + 1)}
          />
        )}
      </div>
    </SettingsSection>
  )
}
function ConfigurationForm({
  document,
  entries,
  onSave,
  onSaved,
  onReload,
  onEdit,
}: {
  document: SettingsDocument
  entries: Entry[]
  onSave: (input: SettingsEdit) => Promise<SettingsDocument>
  onSaved: (document: SettingsDocument) => void
  onEdit: () => void
  onReload: () => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const [pending, setPending] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState("")
  const [conflict, setConflict] = useState(false)
  const raw = document.issues.length > 0
  const authored = raw ? {} : object(JSON.parse(document.source ?? "{}"))
  async function save(form: HTMLFormElement) {
    if (pending) {
      return
    }
    setPending(true)
    setError("")
    setConflict(false)
    onEdit()
    try {
      const data = new FormData(form)
      const value = structuredClone(authored)
      if (!raw) {
        for (const entry of entries) {
          const text = String(data.get(entry.key) ?? "")
          if (text !== fieldValue(authored, entry)) {
            setField(value, entry, text)
          }
        }
      }
      for (const key of ["unitTests", "playwright", "github", "testResources"]) {
        if (Object.keys(object(value[key])).length === 0) {
          delete value[key]
        }
      }
      const source = raw ? String(data.get("source")) : `${JSON.stringify(value, null, 2)}\n`
      const result = await onSave({ source, revision: document.revision })
      onSaved(result)
      setDirty(false)
    } catch (error) {
      setError(errorMessage(error))
      setConflict(error instanceof ApiError && error.status === 409)
    } finally {
      setPending(false)
    }
  }
  return (
    <form
      className="w-full min-w-0"
      onSubmit={(event) => {
        event.preventDefault()
        void save(event.currentTarget)
      }}
      onChange={() => {
        setDirty(true)
        onEdit()
      }}
    >
      <FieldSet disabled={pending}>
        <FieldGroup>
          {raw ? (
            <Field>
              <code className="break-all text-xs">{document.file}</code>
              <Notice error>{document.issues.join("\n")}</Notice>
              <FieldLabel htmlFor={`${id}-source`}>{t("Settings JSON")}</FieldLabel>
              <Textarea
                id={`${id}-source`}
                name="source"
                defaultValue={document.source ?? "{}"}
                rows={12}
                className="font-mono leading-relaxed"
                spellCheck={false}
              />
            </Field>
          ) : (
            entries.map((entry) => (
              <Field
                key={entry.key}
                className={cn(
                  "grid min-w-0 gap-2",
                  entry.kind !== "json" &&
                    "@lg/field-group:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] @lg/field-group:gap-x-6",
                )}
              >
                <FieldLabel htmlFor={`${id}-${entry.key}`}>{entry.label}</FieldLabel>
                {entry.kind === "json" && (
                  <TestEnvironmentFields
                    id={`${id}-${entry.key}`}
                    name={entry.key}
                    initialValue={fieldValue(authored, entry)}
                    disabled={pending}
                    onEdit={() => {
                      setDirty(true)
                      onEdit()
                    }}
                  />
                )}
                {entry.kind === "lines" && (
                  <Textarea
                    id={`${id}-${entry.key}`}
                    name={entry.key}
                    defaultValue={fieldValue(authored, entry)}
                    placeholder={entry.fallback}
                    rows={3}
                    required={entry.required}
                    spellCheck={false}
                  />
                )}
                {entry.kind !== "json" && entry.kind !== "lines" && (
                  <Input
                    id={`${id}-${entry.key}`}
                    name={entry.key}
                    type={entry.kind === "number" ? "number" : "text"}
                    min={entry.min}
                    max={entry.max}
                    step={entry.kind === "number" ? 1 : undefined}
                    defaultValue={fieldValue(authored, entry)}
                    placeholder={entry.fallback}
                  />
                )}
                {entry.key === "github.cliPath" && (
                  <FieldDescription className="@lg/field-group:col-start-2">
                    {t(
                      "Sign in from Terminal with gh auth login. Tokens are not stored in Redpact.",
                    )}{" "}
                    {t(
                      "Leave empty for automatic detection. Save changes before checking the connection.",
                    )}
                  </FieldDescription>
                )}
                {entry.kind === "json" && (
                  <FieldDescription>
                    {t(
                      "Choose a value type for each variable. Service endpoints resolve when tests run.",
                    )}
                  </FieldDescription>
                )}
              </Field>
            ))
          )}
          {error && <Notice error>{error}</Notice>}
          {conflict && (
            <Button type="button" variant="outline" onClick={onReload}>
              {t("Discard draft and load current file")}
            </Button>
          )}
          <Button type="submit" className="self-end" disabled={!dirty || pending}>
            {pending ? t("Saving…") : t("Save settings")}
          </Button>
        </FieldGroup>
      </FieldSet>
    </form>
  )
}
