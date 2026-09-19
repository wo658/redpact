import { createContext, type ReactNode, useContext, useLayoutEffect, useState } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { TabsList } from "./ui/coss-tabs"

type Slot = "navigation" | "secondary" | "actions"
export type ReviewToolbarSlots = Partial<Record<Slot, ReactNode>>
type Targets = Record<Slot, HTMLDivElement | null>
type Overrides = Record<Slot, boolean>
const emptyOverrides: Overrides = { navigation: false, secondary: false, actions: false }
const ToolbarContext = createContext<{
  targets: Targets
  setTarget: Record<Slot, (element: HTMLDivElement | null) => void>
  overrides: Overrides
  setOverrides: (overrides: Overrides) => void
} | null>(null)

/** One toolbar and one active override per scope; nested scopes are independent. */
export function ReviewToolbarScope({ children }: { children: ReactNode }) {
  const [navigation, setNavigation] = useState<HTMLDivElement | null>(null)
  const [secondary, setSecondary] = useState<HTMLDivElement | null>(null)
  const [actions, setActions] = useState<HTMLDivElement | null>(null)
  const [overrides, setOverrides] = useState(emptyOverrides)
  return (
    <ToolbarContext.Provider
      value={{
        targets: { navigation, secondary, actions },
        setTarget: { navigation: setNavigation, secondary: setSecondary, actions: setActions },
        overrides,
        setOverrides,
      }}
    >
      {children}
    </ToolbarContext.Provider>
  )
}

/** Undefined inherits, null hides, and a node replaces the owning slot. */
export function ReviewToolbarOverride({ navigation, secondary, actions }: ReviewToolbarSlots) {
  const context = useContext(ToolbarContext)
  const setOverrides = context?.setOverrides
  const hasNavigation = navigation !== undefined
  const hasSecondary = secondary !== undefined
  const hasActions = actions !== undefined
  useLayoutEffect(() => {
    setOverrides?.({ navigation: hasNavigation, secondary: hasSecondary, actions: hasActions })
    return () => setOverrides?.(emptyOverrides)
  }, [setOverrides, hasNavigation, hasSecondary, hasActions])
  if (!context) {
    return <ReviewToolbar navigation={navigation} secondary={secondary} actions={actions} />
  }
  // Portals preserve the source Tabs context while the parent owns physical placement.
  return (
    <>
      {(["navigation", "secondary", "actions"] as const).map((slot) => {
        const target = context.targets[slot]
        return target ? createPortal({ navigation, secondary, actions }[slot], target, slot) : null
      })}
    </>
  )
}

export function ReviewToolbar({
  children,
  navigation,
  secondary,
  actions,
  label,
  className,
  singleRow = false,
}: ReviewToolbarSlots & {
  children?: ReactNode
  label?: string
  singleRow?: boolean
  className?: string
}) {
  const context = useContext(ToolbarContext)
  const defaults = {
    navigation:
      navigation !== undefined
        ? navigation
        : children && (
            <TabsList
              variant="view"
              className="max-w-full overflow-x-auto"
              aria-label={label}
              activateOnFocus
            >
              {children}
            </TabsList>
          ),
    secondary,
    actions,
  }
  function slot(name: Slot) {
    return (
      <>
        {!context?.overrides[name] && defaults[name]}
        {context && <div ref={context.setTarget[name]} className="contents" />}
      </>
    )
  }
  return (
    <div
      data-slot="review-toolbar"
      className={cn(
        "flex min-w-0 shrink-0 flex-wrap items-center gap-3 border-b px-3 py-2",
        singleRow && "flex-nowrap",
        className,
      )}
    >
      <div
        className={cn(
          "flex min-w-0 flex-[1_1_20rem] items-center gap-3 overflow-x-auto",
          singleRow && "flex-1",
        )}
      >
        <div
          data-slot="toolbar-navigation"
          className="min-w-0 shrink-0 empty:hidden has-[>div:only-child:empty]:hidden"
        >
          {slot("navigation")}
        </div>
        <div
          data-slot="toolbar-secondary"
          className={cn(
            "min-w-0 shrink-0 empty:hidden has-[>div:only-child:empty]:hidden",
            (defaults.navigation || context?.overrides.navigation) && "border-l pl-3",
          )}
        >
          {slot("secondary")}
        </div>
      </div>
      <div
        data-slot="toolbar-actions"
        className={cn(
          "ml-auto flex min-w-0 max-w-full items-center gap-2 overflow-x-auto empty:hidden has-[>div:only-child:empty]:hidden",
          singleRow && "max-w-[65%] shrink-0 [&>*]:shrink-0",
        )}
      >
        {slot("actions")}
      </div>
    </div>
  )
}
