import type { ReactNode } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty"
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <Alert variant={error ? "destructive" : "default"} role={error ? "alert" : "status"}>
      <AlertDescription className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
        {children}
      </AlertDescription>
    </Alert>
  )
}

export function Loading({ children }: { children: ReactNode }) {
  return (
    <Item role="status" size="xs">
      <ItemMedia variant="icon">
        <Spinner aria-hidden="true" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{children}</ItemTitle>
      </ItemContent>
    </Item>
  )
}

export function EmptyState({
  children,
  compact = false,
  className,
}: {
  children: ReactNode
  compact?: boolean
  className?: string
}) {
  return (
    <Empty className={cn("min-h-24 p-6", compact && "min-h-0 flex-none p-3", className)}>
      <EmptyHeader>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
