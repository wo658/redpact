// Read-only adaptation of Kibo UI List; see app/web/NOTICE and app/web/licenses/kibo-ui.txt.
import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type ListProps = { children: ReactNode; className?: string }

export function ListGroup({ children, name }: ListProps & { name: string }) {
  return (
    <section aria-label={name} className="min-w-0 border-b last:border-b-0">
      {children}
    </section>
  )
}

export function ListHeader({
  name,
  count,
  failed = false,
  actions,
}: {
  name: string
  count: number
  failed?: boolean
  actions?: ReactNode
}) {
  return (
    <div className="flex min-h-10 items-center gap-2 bg-muted/50 px-3 py-2">
      <span
        aria-hidden="true"
        className={cn(
          "size-2 shrink-0 rounded-full",
          failed ? "bg-destructive" : "bg-muted-foreground",
        )}
      />
      <h3 className="min-w-0 break-words text-sm font-medium">{name}</h3>
      <Badge variant="secondary">{count}</Badge>
      {actions && <div className="ml-auto shrink-0">{actions}</div>}
    </div>
  )
}

export function ListItems({ children, className }: ListProps) {
  return <ul className={cn("flex min-w-0 flex-col divide-y", className)}>{children}</ul>
}

export function ListItem({ children, className }: ListProps) {
  return <li className={cn("min-w-0 bg-background", className)}>{children}</li>
}
