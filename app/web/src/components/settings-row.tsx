import { CircleHelpIcon } from "lucide-react"
import { type ReactNode, useId } from "react"
import { Button } from "./ui/button"
import { Field, FieldContent, FieldGroup, FieldTitle } from "./ui/field"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <section
      data-slot="settings-section"
      aria-labelledby={id}
      className="flex min-w-0 flex-col gap-3"
    >
      <header className="flex min-w-0 items-start gap-2">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {description && <SettingsHelp title={title} description={description} />}
      </header>
      <FieldGroup className="gap-0 rounded-lg border bg-card [&>[data-slot=settings-row]+[data-slot=settings-row]]:border-t">
        {children}
      </FieldGroup>
    </section>
  )
}

export function SettingsRow({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Field
      data-slot="settings-row"
      aria-label={title}
      className="grid min-h-16 min-w-0 gap-3 p-4 @lg/field-group:grid-cols-[minmax(0,1fr)_auto] @lg/field-group:items-center @lg/field-group:gap-6"
    >
      <FieldContent className="min-w-0">
        <div className="flex min-w-0 items-start gap-2">
          <FieldTitle className="min-w-0 [overflow-wrap:anywhere]">{title}</FieldTitle>
          {description && <SettingsHelp title={title} description={description} />}
        </div>
      </FieldContent>
      <div className="flex min-w-0 flex-col items-start gap-3 @lg/field-group:max-w-72 @lg/field-group:items-end [&>*]:max-w-full">
        {children}
      </div>
    </Field>
  )
}

function SettingsHelp({ title, description }: { title: string; description: string }) {
  const id = useId()
  return (
    <Tooltip>
      <TooltipTrigger
        aria-describedby={id}
        render={<Button variant="ghost" size="icon-sm" aria-label={title} />}
      >
        <CircleHelpIcon />
      </TooltipTrigger>
      <TooltipContent id={id} role="tooltip">
        {description}
      </TooltipContent>
    </Tooltip>
  )
}
