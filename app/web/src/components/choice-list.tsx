import { useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { SearchPicker } from "./search-picker"
import { Field, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { RadioGroup, RadioGroupItem } from "./ui/radio-group"

export function ChoiceList({
  label,
  options,
  value,
  onValueChange,
  disabled = false,
  id,
  searchable = true,
  compact = false,
}: {
  label: string
  options: { value: string; label: string }[]
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  id?: string
  searchable?: boolean
  compact?: boolean
}) {
  const { t } = useTranslation()
  const prefix = useId()
  const [query, setQuery] = useState("")
  const visible = options.filter((option) =>
    option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  )
  if (compact) {
    return (
      <SearchPicker
        id={id}
        label={label}
        options={options}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        searchable={searchable && options.length > 5}
      />
    )
  }
  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      {searchable && (
        <Input
          id={id}
          aria-label={label}
          placeholder={label}
          disabled={disabled}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}
      <RadioGroup
        aria-label={label}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (typeof next === "string") {
            onValueChange(next)
          }
        }}
        className="max-h-64 overflow-auto"
      >
        {visible.map((option, index) => (
          <Field key={option.value} orientation="horizontal">
            <RadioGroupItem id={`${prefix}-${index}`} value={option.value} />
            <FieldLabel htmlFor={`${prefix}-${index}`} className="min-w-0 break-all">
              {option.label}
            </FieldLabel>
          </Field>
        ))}
      </RadioGroup>
      {!visible.length && <p className="text-muted-foreground">{t("No matching options")}</p>}
    </div>
  )
}
