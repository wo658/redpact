import { Children, isValidElement, type ReactElement, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty"
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { CopyHandoff } from "./copy-handoff"

function visibleText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child)
      }
      if (isValidElement(child)) {
        return visibleText((child as ReactElement<{ children?: ReactNode }>).props.children)
      }
      return ""
    })
    .join("")
    .trim()
}

export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  const { t } = useTranslation()
  if (error) {
    const message = visibleText(children) || t("Visible diagnostic")
    return (
      <CopyHandoff
        showContext={false}
        context={{
          title: t("Problem details"),
          summary: t("Copy this context to continue investigating the problem."),
          fields: [[t("Message"), message]],
        }}
      >
        <Alert variant="destructive">
          <AlertDescription className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {children}
          </AlertDescription>
        </Alert>
      </CopyHandoff>
    )
  }
  return (
    <Alert variant="default" role="status">
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
