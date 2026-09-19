import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"
import { Table } from "./ui/table"

export function DataTable({
  width,
  ...props
}: Omit<ComponentProps<typeof Table>, "width"> & { width: "640" | "768" | "wide" }) {
  return (
    <div data-table-width={width} className={cn("w-full min-w-0", `content-width-${width}`)}>
      <Table {...props} />
    </div>
  )
}
