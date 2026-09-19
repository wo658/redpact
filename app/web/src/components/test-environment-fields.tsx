import { PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { SearchPicker } from "./search-picker"
import { Button } from "./ui/button"
import { Field, FieldGroup, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { Textarea } from "./ui/textarea"

type Binding = string | { secret: string } | { service: string; port: number; scheme: string }
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
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const keys = Object.keys(value)
      if (keys.length === 1 && "secret" in value && typeof value.secret === "string") {
        return { id, key, value: { secret: value.secret } }
      }
      if (
        keys.length === 3 &&
        "service" in value &&
        typeof value.service === "string" &&
        "port" in value &&
        Number.isInteger(value.port) &&
        Number(value.port) >= 1 &&
        Number(value.port) <= 65535 &&
        "scheme" in value &&
        (value.scheme === "http" || value.scheme === "https")
      ) {
        return {
          id,
          key,
          value: { service: value.service, port: Number(value.port), scheme: value.scheme },
        }
      }
    }
    throw new Error(`tests.env.${key}: expected text, a secret reference or a service endpoint`)
  })
}
function kind(value: Binding) {
  if (typeof value === "string") {
    return "text"
  }
  return "secret" in value ? "secret" : "service"
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
              <SearchPicker
                label={t("Value type {{number}}", { number: index + 1 })}
                value={kind(row.value)}
                disabled={disabled}
                options={[
                  { value: "text", label: t("Text value") },
                  { value: "service", label: t("Service endpoint") },
                  { value: "secret", label: t("Secret reference") },
                ]}
                onValueChange={(type) => {
                  if (type === kind(row.value)) {
                    return
                  }
                  let value: Binding = ""
                  if (type === "secret") {
                    value = { secret: "" }
                  }
                  if (type === "service") {
                    value = { service: "", port: 3000, scheme: "http" }
                  }
                  change(row, { value })
                }}
              />
              <BindingFields
                id={`${id}-${row.id}`}
                number={index + 1}
                value={row.value}
                disabled={disabled}
                onChange={(value) => change(row, { value })}
              />
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

function BindingFields({
  id,
  number,
  value,
  disabled,
  onChange,
}: {
  id: string
  number: number
  value: Binding
  disabled: boolean
  onChange(value: Binding): void
}) {
  const { t } = useTranslation()
  if (typeof value === "string") {
    return (
      <Field>
        <FieldLabel htmlFor={`${id}-value`}>{t("Value {{number}}", { number })}</FieldLabel>
        <Textarea
          id={`${id}-value`}
          value={value}
          disabled={disabled}
          rows={2}
          maxLength={10000}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
        />
      </Field>
    )
  }
  if ("secret" in value) {
    return (
      <Field>
        <FieldLabel htmlFor={`${id}-value`}>{t("Secret name {{number}}", { number })}</FieldLabel>
        <Input
          id={`${id}-value`}
          value={value.secret}
          disabled={disabled}
          required
          pattern="[A-Za-z_][A-Za-z0-9_]*"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onChange({ secret: event.target.value })}
        />
      </Field>
    )
  }
  return (
    <FieldGroup className="gap-2">
      <Field>
        <FieldLabel htmlFor={`${id}-service`}>{t("Service {{number}}", { number })}</FieldLabel>
        <Input
          id={`${id}-service`}
          value={value.service}
          required
          pattern="[a-z][a-z0-9-]{0,63}"
          disabled={disabled}
          onChange={(event) => onChange({ ...value, service: event.target.value })}
        />
      </Field>
      <div className="grid min-w-0 grid-cols-1 items-end gap-2 @sm/field-group:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${id}-port`}>{t("Port {{number}}", { number })}</FieldLabel>
          <Input
            id={`${id}-port`}
            type="number"
            value={value.port || ""}
            required
            min={1}
            max={65535}
            step={1}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, port: Number(event.target.value) })}
          />
        </Field>
        <SearchPicker
          label={t("Scheme {{number}}", { number })}
          value={value.scheme}
          disabled={disabled}
          options={[
            { value: "http", label: "HTTP" },
            { value: "https", label: "HTTPS" },
          ]}
          onValueChange={(scheme) => onChange({ ...value, scheme })}
        />
      </div>
    </FieldGroup>
  )
}
