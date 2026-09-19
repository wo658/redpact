import { cva } from "class-variance-authority"

export type SegmentedControlSize = "default" | "lg" | "sm"

export const segmentedControlItemSizeClassNames: Record<SegmentedControlSize, string> = {
  default: "h-7 px-2 min-w-16",
  lg: "h-8 px-2.5 min-w-18",
  sm: "h-6 px-2 min-w-14",
}

export const segmentedControlRootClassName =
  "relative z-0 flex w-fit items-center justify-center gap-0.5 rounded-lg bg-muted/50 p-0.5"

export const segmentedControlItemLayoutClassName =
  "gap-1.5 [&_svg:not([class*='opacity-'])]:opacity-80 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:-mx-0.5 [&_svg]:shrink-0"

export const segmentedControlItemVariants = cva(
  [
    "relative inline-flex shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-md border border-transparent font-medium text-sm text-muted-foreground outline-2 outline-transparent transition-[outline-color] hover:bg-accent/50 hover:text-accent-foreground focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-64 data-disabled:pointer-events-none data-disabled:opacity-64",
    segmentedControlItemLayoutClassName,
  ],
  {
    defaultVariants: {
      size: "default",
    },
    variants: {
      size: segmentedControlItemSizeClassNames,
      state: {
        checked: "data-checked:bg-accent data-checked:text-accent-foreground",
        current: "aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground",
        pressed: "data-pressed:bg-accent data-pressed:text-accent-foreground",
      },
    },
  },
)
