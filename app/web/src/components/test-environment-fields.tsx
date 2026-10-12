import { PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "./ui/button"
import { Field, FieldGroup, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { Textarea } from "./ui/textarea"

type Binding = string
type Row = { id: number; key: string; value: Binding }
function rowsFrom(source: string): Row[] {
  const parsed = JSON.parse(source || "{}")
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("tests.env: expected a JSON object")
  }
  return Object.entries(parsed).map(([key, value], id) => {
    if (typeof value === "string") {
      return { id, key, value }
    }
    throw new Error(`tests.env.${key}: expected a string`)
  })
}
export function TestEnvironmentFields({
  id,
  name,
  initialValue,
  disabled,
  onEdit,
}: {
  id: string
  name: string
  initialValue: string
  disabled: boolean
  onEdit(): void
}) {
  const { t } = useTranslation()
  const [initial] = useState(() => {
    try {
      return { rows: rowsFrom(initialValue), error: "" }
    } catch (failure) {
      return {
        rows: [] as Row[],
        error: failure instanceof Error ? failure.message : String(failure),
      }
    }
  })
  const [rows, setRows] = useState(initial.rows)
  const [nextId, setNextId] = useState(rows.length)
  const [raw, setRaw] = useState(!!initial.error)
  const [source, setSource] = useState(initialValue)
  const [error, setError] = useState(initial.error)
  const duplicate = rows.some((row, index) =>
    rows.some((other, otherIndex) => otherIndex !== index && row.key === other.key),
  )
  function update(next: Row[]) {
    setRows(next)
    setSource(
      next.length
        ? JSON.stringify(Object.fromEntries(next.map((row) => [row.key, row.value])), null, 2)
        : "",
    )
    onEdit()
  }
  function change(row: Row, patch: Partial<Row>) {
    update(rows.map((current) => (current.id === row.id ? { ...current, ...patch } : current)))
  }
  function toggle() {
    if (raw) {
      try {
        const next = rowsFrom(source)
        setRows(next)
        setNextId(next.length)
        setError("")
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : String(failure))
        return
      }
    }
    setRaw(!raw)
  }
  return (
    <div id={id} className="flex min-w-0 flex-col gap-3">
      <Input type="hidden" name={name} value={source} />
      {raw ? (
        <Field>
          <FieldLabel htmlFor={`${id}-json`}>{t("Test environment (JSON)")}</FieldLabel>
          <Textarea
            id={`${id}-json`}
            value={source}
            rows={10}
            disabled={disabled}
            className="font-mono leading-relaxed"
            spellCheck={false}
            onChange={(event) => {
              setSource(event.target.value)
              setError("")
              onEdit()
            }}
          />
        </Field>
      ) : (
        <FieldGroup className="gap-4">
          {!rows.length && (
            <p className="text-sm text-muted-foreground">{t("No environment variables.")}</p>
          )}
          {rows.map((row, index) => (
            <FieldGroup key={row.id} className="gap-2 border-b pb-4 last:border-0">
              <Field>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor={`${id}-${row.id}-key`}>
                    {t("Variable {{number}}", { number: index + 1 })}
                  </FieldLabel>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={disabled}
                    aria-label={t("Remove variable {{number}}", { number: index + 1 })}
                    onClick={() => update(rows.filter((current) => current.id !== row.id))}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
                <Input
                  id={`${id}-${row.id}-key`}
                  value={row.key}
                  required
                  pattern="[A-Za-z_][A-Za-z0-9_]*"
                  disabled={disabled}
                  aria-invalid={duplicate || undefined}
                  ref={(input) =>
                    input?.setCustomValidity(duplicate ? t("This key already exists.") : "")
                  }
                  onChange={(event) => change(row, { key: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-${row.id}-value`}>
                  {t("Value {{number}}", { number: index + 1 })}
                </FieldLabel>
                <Textarea
                  id={`${id}-${row.id}-value`}
                  value={row.value}
                  disabled={disabled}
                  rows={2}
                  maxLength={10000}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => change(row, { value: event.target.value })}
                />
              </Field>
            </FieldGroup>
          ))}
          {duplicate && (
            <p role="alert" className="text-sm text-destructive">
              {t("This key already exists.")}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={disabled || rows.length >= 100}
            onClick={() => {
              update([...rows, { id: nextId, key: "", value: "" }])
              setNextId(nextId + 1)
            }}
          >
            <PlusIcon data-icon="inline-start" />
            {t("Add environment variable")}
          </Button>
        </FieldGroup>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        disabled={disabled || (!raw && duplicate)}
        onClick={toggle}
      >
        {raw ? t("Use fields") : t("Edit JSON")}
      </Button>
    </div>
  )
}
