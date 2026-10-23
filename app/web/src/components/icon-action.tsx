import { type LucideIcon, Play } from "lucide-react"
import type { ComponentProps } from "react"
import { Button } from "./ui/button"

/** Shared compact actions retain their accessible name and native tooltip. */
export function IconAction({
  label,
  icon: Icon = Play,
  ...props
}: Omit<ComponentProps<typeof Button>, "children" | "size" | "variant"> & {
  label: string
  icon?: LucideIcon
}) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} title={label} {...props}>
      <Icon aria-hidden="true" />
    </Button>
  )
}
