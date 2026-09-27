import type { ReactNode } from "react"
import { Item, ItemContent, ItemTitle } from "./ui/item"

export function ResultRow({
  title,
  metadata,
  actions,
  children,
}: {
  title: ReactNode
  metadata?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <Item
      render={<article />}
      data-slot="result-row"
      className="content-width-768 items-start py-4"
    >
      <ItemContent className="min-w-0 gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <ItemTitle className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
              {title}
            </ItemTitle>
            {metadata && (
              <div
                data-slot="result-metadata"
                className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground [overflow-wrap:anywhere]"
              >
                {metadata}
              </div>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
        {children && (
          <div className="flex min-w-0 flex-col gap-3 text-sm leading-relaxed [overflow-wrap:anywhere]">
            {children}
          </div>
        )}
      </ItemContent>
    </Item>
  )
}
