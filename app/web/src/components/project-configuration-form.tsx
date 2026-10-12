import { useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { ApiError, type SettingsDocument, type SettingsEdit } from "@/lib/api"
import type { Entry } from "./authored-settings"
import { Notice } from "./feedback"
import { PlaywrightTargetFields } from "./playwright-target-fields"
import { SearchPicker } from "./search-picker"
import { errorMessage } from "./settings-edit-error"
import { SettingsListField } from "./settings-list-field"
import { SettingsSection } from "./settings-row"
import { TestEnvironmentFields } from "./test-environment-fields"
import { Button } from "./ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from "./ui/field"
import { Input } from "./ui/input"

type Value = Record<string, unknown>
type ProjectEntry = Omit<Entry, "kind"> & {
  kind: Entry["kind"] | "choice" | "boolean" | "targets"
  options?: { value: string; label: string }[]
}
function object(value: unknown): value is Value {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
function read(value: Value, path: string): unknown {
  let current: unknown = value
  for (const key of path.split(".")) {
    current = object(current) ? current[key] : undefined
  }
  return current
}
function write(value: Value, path: string, next: unknown) {
  const keys = path.split(".")
  const key = keys.pop() as string
  let target = value
  for (const part of keys) {
    if (!object(target[part])) {
      target[part] = {}
    }
    target = target[part] as Value
  }
  if (next === undefined) {
    delete target[key]
  } else {
    target[key] = next
  }
}
function text(value: Value, entry: ProjectEntry): string {
  const item = read(value, entry.key)
  if (item === undefined) {
    return ""
  }
  if (entry.kind === "json" || entry.kind === "targets") {
    return JSON.stringify(item)
  }
  if (entry.kind === "lines" && Array.isArray(item)) {
    return item.join("\n")
  }
  return String(item)
}
function parse(source: string, issues: string[]): Value | null {
  try {
    const value: unknown = JSON.parse(source)
    if (
      !object(value) ||
      issues.some((issue) => /duplicate keys|Duplicate JSON|Invalid JSON object/i.test(issue))
    ) {
      return null
    }
    for (const key of ["tests", "unitTests", "playwright"]) {
      if (value[key] !== undefined && !object(value[key])) {
        return null
      }
    }
    return value
  } catch {
    return null
  }
}
function diagnostics(issues: string[]): string[] {
  return issues.flatMap((issue) => {
    try {
      const parsed: unknown = JSON.parse(issue)
      if (
        Array.isArray(parsed) &&
        parsed.every(
          (item) => object(item) && Array.isArray(item.path) && typeof item.message === "string",
        )
      ) {
        return parsed.map((item) => `${item.path.join(".")}: ${item.message}`)
      }
    } catch {
      /* Plain diagnostics already include their field path. */
    }
    return [issue]
  })
}
function fieldIssue(issue: string, key: string) {
  return issue.startsWith(`${key}:`) || issue.startsWith(`${key}.`)
}

function targetValue(
  value: unknown,
): value is Record<string, { purpose: string; testMatch: string[] }> {
  return (
    object(value) &&
    Object.values(value).every(
      (target) =>
        object(target) &&
        ["capture", "functional"].includes(String(target.purpose)) &&
        Array.isArray(target.testMatch) &&
        target.testMatch.every((pattern) => typeof pattern === "string") &&
        Object.keys(target).every((key) => key === "purpose" || key === "testMatch"),
    )
  )
}

function inputValue(entry: ProjectEntry, input: string): unknown {
  if (entry.kind === "lines") {
    return input
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  }
  if (!input) {
    return undefined
  }
  if (entry.kind === "json" || entry.kind === "targets") {
    const value: unknown = JSON.parse(input)
    if (!object(value)) {
      throw new Error(`${entry.key}: expected a JSON object`)
    }
    return value
  }
  if (entry.kind === "number") {
    return Number(input)
  }
  if (entry.kind === "boolean") {
    return input === "true"
  }
  return input
}
function editedSettings(authored: Value, fields: ProjectEntry[], data: FormData): Value {
  const value = structuredClone(authored)
  for (const entry of fields) {
    if (!data.has(entry.key)) {
      continue
    }
    const input = String(data.get(entry.key))
    if (input === text(authored, entry)) {
      continue
    }
    const next = inputValue(entry, input)
    if (
      next !== undefined &&
      entry.key.startsWith("playwright.viewport.") &&
      read(value, "playwright.viewport") === undefined
    ) {
      write(value, "playwright.viewport", { width: 1920, height: 1080 })
    }
    if (
      next !== undefined &&
      entry.key.startsWith("playwright.mobileViewport.") &&
      read(value, "playwright.mobileViewport") === undefined
    ) {
      write(value, "playwright.mobileViewport", { width: 390, height: 844 })
    }
    write(value, entry.key, next)
  }
  for (const key of ["unitTests", "playwright"]) {
    if (object(value[key]) && Object.keys(value[key]).length === 0) {
      delete value[key]
    }
  }
  return value
}

export function ProjectConfigurationForm({
  document,
  entries,
  onSave,
  onSaved,
  onReload,
  onEdit,
}: {
  document: SettingsDocument
  entries: Entry[]
  onSave(input: SettingsEdit): Promise<SettingsDocument>
  onSaved(document: SettingsDocument): void
  onReload(): void
  onEdit(): void
}) {
  const { t } = useTranslation()
  const id = useId()
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [conflict, setConflict] = useState(false)
  const authored = parse(document.source ?? "{}", document.issues)
  const issues = diagnostics(document.issues)
  const fields: ProjectEntry[] = [
    ...entries,
    { key: "playwright.targets", label: t("Playwright targets"), kind: "targets", fallback: "" },
    {
      key: "playwright.scheme",
      label: t("Browser connection"),
      kind: "choice",
      fallback: "http",
      options: [
        { value: "http", label: "HTTP" },
        { value: "https", label: "HTTPS" },
      ],
    },
    {
      key: "playwright.viewport.width",
      label: t("Viewport width"),
      kind: "number",
      fallback: "1920",
      min: 320,
      max: 3840,
    },
    {
      key: "playwright.viewport.height",
      label: t("Viewport height"),
      kind: "number",
      fallback: "1080",
      min: 240,
      max: 2160,
    },
    {
      key: "playwright.mobileViewport.width",
      label: t("Mobile viewport width"),
      kind: "number",
      fallback: "390",
      min: 320,
      max: 767,
    },
    {
      key: "playwright.mobileViewport.height",
      label: t("Mobile viewport height"),
      kind: "number",
      fallback: "844",
      min: 240,
      max: 2160,
    },
    { key: "playwright.locale", label: t("Browser locale"), kind: "text", fallback: "en-US" },
    { key: "playwright.timezoneId", label: t("Browser timezone"), kind: "text", fallback: "UTC" },
    {
      key: "playwright.colorScheme",
      label: t("Browser appearance"),
      kind: "choice",
      fallback: "light",
      options: [
        { value: "light", label: t("Light") },
        { value: "dark", label: t("Dark") },
      ],
    },
    { key: "playwright.video", label: t("Record video"), kind: "boolean", fallback: "false" },
    {
      key: "playwright.timeoutMs",
      label: t("Browser test timeout (ms)"),
      kind: "number",
      fallback: "30000",
      min: 1000,
      max: 120000,
    },
  ]
  function edit() {
    setDirty(true)
    onEdit()
  }
  async function save(form: HTMLFormElement) {
    if (pending || !authored) {
      return
    }
    setPending(true)
    setError("")
    setConflict(false)
    onEdit()
    try {
      const value = editedSettings(authored, fields, new FormData(form))
      const result = await onSave({
        source: `${JSON.stringify(value, null, 2)}\n`,
        revision: document.revision,
      })
      onSaved(result)
      setDirty(false)
    } catch (failure) {
      setError(errorMessage(failure))
      setConflict(failure instanceof ApiError && failure.status === 409)
    } finally {
      setPending(false)
    }
  }
  if (!authored) {
    return (
      <div className="flex flex-col gap-4">
        <Notice error>{document.issues.join("\n")}</Notice>
        <p>{t("Ask your agent to repair this file, then reload settings.")}</p>
        <code className="break-all text-sm">{document.file}</code>
        <Button variant="outline" onClick={onReload}>
          {t("Reload settings")}
        </Button>
      </div>
    )
  }
  const groups = [
    { title: t("Application"), prefix: "composeFiles" },
    { title: t("Unit Test"), prefix: "unitTests." },
    { title: t("Integration Test"), prefix: "tests." },
    { title: t("Playwright"), prefix: "playwright." },
  ]
  return (
    <form
      className="w-full min-w-0"
      onChange={edit}
      onSubmit={(event) => {
        event.preventDefault()
        void save(event.currentTarget)
      }}
    >
      <FieldSet disabled={pending}>
        <FieldGroup className="gap-8">
          {issues
            .filter((issue) => !fields.some((entry) => fieldIssue(issue, entry.key)))
            .map((issue) => (
              <Notice key={issue} error>
                {issue}
              </Notice>
            ))}
          {groups.map((group) => (
            <SettingsSection key={group.prefix} title={group.title}>
              {fields
                .filter((entry) => entry.key.startsWith(group.prefix))
                .map((entry) => {
                  const issue = issues.filter((issue) => fieldIssue(issue, entry.key)).join("\n")
                  const wide = entry.kind === "json" || entry.kind === "targets"
                  return (
                    <Field
                      key={entry.key}
                      data-slot="settings-row"
                      data-invalid={!!issue || undefined}
                      className={`grid min-h-16 min-w-0 gap-3 p-4 ${wide ? "" : "@lg/field-group:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] @lg/field-group:items-center"}`}
                    >
                      <FieldLabel htmlFor={`${id}-${entry.key}`}>{entry.label}</FieldLabel>
                      <ProjectControl
                        id={`${id}-${entry.key}`}
                        entry={entry}
                        authored={authored}
                        pending={pending}
                        onEdit={edit}
                        invalid={!!issue}
                      />
                      {issue && (
                        <FieldDescription className="text-destructive">{issue}</FieldDescription>
                      )}
                    </Field>
                  )
                })}
            </SettingsSection>
          ))}
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

function ProjectControl({
  id,
  entry,
  authored,
  pending,
  onEdit,
  invalid,
}: {
  id: string
  entry: ProjectEntry
  authored: Value
  pending: boolean
  onEdit(): void
  invalid: boolean
}) {
  const { t } = useTranslation()
  const initialValue = text(authored, entry)
  const [choice, setChoice] = useState(initialValue)
  if (entry.kind === "json") {
    return (
      <TestEnvironmentFields
        id={id}
        name={entry.key}
        initialValue={initialValue}
        disabled={pending}
        onEdit={onEdit}
      />
    )
  }
  if (entry.kind === "targets") {
    const value = read(authored, entry.key) ?? {}
    if (!targetValue(value)) {
      return <p>{t("Ask your agent to repair this file, then reload settings.")}</p>
    }
    return (
      <PlaywrightTargetFields
        id={id}
        initialValue={value}
        initialSource={initialValue}
        onEdit={onEdit}
      />
    )
  }
  if (entry.kind === "lines") {
    return (
      <SettingsListField
        id={id}
        name={entry.key}
        label={entry.label}
        initialValue={initialValue}
        placeholder={entry.fallback}
        onEdit={onEdit}
      />
    )
  }
  if (entry.kind === "choice" || entry.kind === "boolean") {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <Input type="hidden" name={entry.key} value={choice} />
        {entry.kind === "boolean" ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              id={id}
              aria-label={entry.label}
              disabled={pending}
              render={<Button variant="outline" />}
            >
              {(choice || entry.fallback) === "true" ? t("On") : t("Off")}
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuCheckboxItem
                checked={(choice || entry.fallback) === "true"}
                onCheckedChange={(checked) => {
                  setChoice(String(checked))
                  onEdit()
                }}
              >
                {entry.label}
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <SearchPicker
            id={id}
            label={entry.label}
            disabled={pending}
            value={choice}
            options={[{ value: "", label: t("Default") }, ...(entry.options ?? [])]}
            onValueChange={(value) => {
              setChoice(value)
              onEdit()
            }}
          />
        )}
      </div>
    )
  }
  return (
    <Input
      id={id}
      name={entry.key}
      aria-invalid={invalid || undefined}
      type={entry.kind === "number" ? "number" : "text"}
      min={entry.min}
      max={entry.max}
      step={entry.kind === "number" ? 1 : undefined}
      defaultValue={initialValue}
      placeholder={entry.fallback}
    />
  )
}
