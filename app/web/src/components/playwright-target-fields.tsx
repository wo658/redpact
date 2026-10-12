import { useState } from "react"
import { useTranslation } from "react-i18next"
import { SearchPicker } from "./search-picker"
import { SettingsListField } from "./settings-list-field"
import { Button } from "./ui/button"
import { Field, FieldGroup, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"

type Target = { scope?: "worktree" | "project"; purpose: string; testMatch: string[] }

export function PlaywrightTargetFields({
  id,
  initialValue,
  initialSource,
  onEdit,
}: {
  id: string
  initialValue: Record<string, Target>
  initialSource: string
  onEdit(): void
}) {
  const { t } = useTranslation()
  const [rows, setRows] = useState(() =>
    Object.entries(initialValue).map(([name, target], id) => ({ id, name, ...target })),
  )
  const [nextId, setNextId] = useState(rows.length)
  const [source, setSource] = useState(initialSource)
  function update(next: typeof rows) {
    setRows(next)
    setSource(
      JSON.stringify(
        Object.fromEntries(
          next.map(({ name, scope, purpose, testMatch }) => [name, { scope, purpose, testMatch }]),
        ),
      ),
    )
    onEdit()
  }
  const duplicate = rows.some((row, index) =>
    rows.some((other, otherIndex) => otherIndex !== index && other.name === row.name),
  )
  return (
    <FieldGroup className="gap-4">
      <Input type="hidden" name="playwright.targets" value={source} />
      {rows.map((row, index) => (
        <FieldGroup key={row.id} className="gap-3">
          <Field data-invalid={duplicate || undefined}>
            <FieldLabel htmlFor={`${id}-${row.id}`}>
              {t("Target name {{number}}", { number: index + 1 })}
            </FieldLabel>
            <Input
              id={`${id}-${row.id}`}
              value={row.name}
              required
              pattern="[a-z][a-z0-9-]{0,63}"
              aria-invalid={duplicate || undefined}
              ref={(input) =>
                input?.setCustomValidity(duplicate ? t("This key already exists.") : "")
              }
              onChange={(event) =>
                update(
                  rows.map((item) =>
                    item.id === row.id ? { ...item, name: event.target.value } : item,
                  ),
                )
              }
            />
          </Field>
          <SearchPicker
            label={t("Target scope {{number}}", { number: index + 1 })}
            value={row.scope ?? "project"}
            options={[
              { value: "worktree", label: t("Worktree") },
              { value: "project", label: t("Project") },
            ]}
            onValueChange={(scope) =>
              update(
                rows.map((item) =>
                  item.id === row.id ? { ...item, scope: scope as "worktree" | "project" } : item,
                ),
              )
            }
          />
          <SearchPicker
            label={t("Target purpose {{number}}", { number: index + 1 })}
            value={row.purpose}
            options={[
              { value: "capture", label: t("Capture scenarios") },
              { value: "functional", label: t("Functional execution") },
            ]}
            onValueChange={(purpose) =>
              update(rows.map((item) => (item.id === row.id ? { ...item, purpose } : item)))
            }
          />
          <Field>
            <FieldLabel htmlFor={`${id}-${row.id}-files`}>
              {t("Target files {{number}}", { number: index + 1 })}
            </FieldLabel>
            <SettingsListField
              id={`${id}-${row.id}-files`}
              name={`target-${row.id}-files`}
              label={t("Target files {{number}}", { number: index + 1 })}
              initialValue={row.testMatch.join("\n")}
              onEdit={onEdit}
              onValueChange={(values) =>
                update(
                  rows.map((item) =>
                    item.id === row.id
                      ? { ...item, testMatch: values.map((value) => value.trim()).filter(Boolean) }
                      : item,
                  ),
                )
              }
            />
          </Field>
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            onClick={() => update(rows.filter((item) => item.id !== row.id))}
          >
            {t("Remove target {{number}}", { number: index + 1 })}
          </Button>
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
        className="self-start"
        disabled={rows.length >= 20}
        onClick={() => {
          update([
            ...rows,
            { id: nextId, name: "", scope: "worktree", purpose: "capture", testMatch: [] },
          ])
          setNextId(nextId + 1)
        }}
      >
        {t("Add Playwright target")}
      </Button>
    </FieldGroup>
  )
}
