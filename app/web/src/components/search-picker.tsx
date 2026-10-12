import { useRef } from "react"
import { useTranslation } from "react-i18next"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { cn } from "@/lib/utils"

export function SearchPicker({
  label,
  options,
  value,
  onValueChange,
  disabled = false,
  id,
  searchable = false,
}: {
  label: string
  options: { value: string; label: string }[]
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  id?: string
  searchable?: boolean
}) {
  const { t } = useTranslation()
  const anchor = useRef<HTMLDivElement>(null)
  return (
    <div ref={anchor} className="w-full min-w-0">
      <Combobox
        items={options}
        filter={searchable ? undefined : null}
        value={options.find((item) => item.value === value) ?? null}
        itemToStringLabel={(item) => item.label}
        itemToStringValue={(item) => item.value}
        isItemEqualToValue={(item, selected) => item.value === selected.value}
        onValueChange={(item) => {
          if (item) {
            onValueChange(item.value)
          }
        }}
        disabled={disabled}
      >
        <ComboboxInput
          disabled={disabled}
          id={id}
          aria-label={label}
          placeholder={label}
          readOnly={!searchable}
          className={cn(
            "w-full min-w-0",
            !searchable && "[&_input]:cursor-pointer [&_input]:caret-transparent",
          )}
        />
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>{t("No matching options")}</ComboboxEmpty>
          <ComboboxList>
            {(item: { value: string; label: string }) => (
              <ComboboxItem key={item.value} value={item}>
                <span className="min-w-0 break-all">{item.label}</span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  )
}
