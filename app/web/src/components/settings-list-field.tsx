import { PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "./ui/button"
import { Input } from "./ui/input"

export function SettingsListField({
  id,
  name,
  label,
  initialValue,
  placeholder,
  onEdit,
  onValueChange,
}: {
  id: string
  name: string
  label: string
  initialValue: string
  placeholder?: string
  onValueChange?(values: string[]): void
  onEdit(): void
}) {
  const { t } = useTranslation()
  const [rows, setRows] = useState(() =>
    (initialValue ? initialValue.split("\n") : [""]).map((value, id) => ({ id, value })),
  )
  const [nextId, setNextId] = useState(rows.length)
  function update(next: typeof rows) {
    setRows(next)
    onValueChange?.(next.map((row) => row.value))
    onEdit()
  }
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <Input type="hidden" name={name} value={rows.map((row) => row.value).join("\n")} />
      {rows.map((row, index) => (
        <div key={row.id} className="flex min-w-0 items-center gap-2">
          <Input
            id={index === 0 ? id : `${id}-${row.id}`}
            aria-label={index === 0 ? label : `${label} ${index + 1}`}
            value={row.value}
            placeholder={placeholder}
            spellCheck={false}
            onChange={(event) =>
              update(
                rows.map((item) =>
                  item.id === row.id ? { ...item, value: event.target.value } : item,
                ),
              )
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("Remove {{label}} {{number}}", { label, number: index + 1 })}
            onClick={() => update(rows.filter((item) => item.id !== row.id))}
          >
            <Trash2Icon />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => {
          update([...rows, { id: nextId, value: "" }])
          setNextId(nextId + 1)
        }}
      >
        <PlusIcon data-icon="inline-start" />
        {t("Add {{label}}", { label })}
      </Button>
    </div>
  )
}
