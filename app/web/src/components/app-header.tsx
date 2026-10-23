import { createContext, type ReactNode, useContext, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { SidebarProvider, SidebarTrigger } from "./ui/sidebar"

const wideSidebarQuery = "(min-width: 1100px)"

export function ResponsiveSidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia(wideSidebarQuery).matches,
  )
  useEffect(() => {
    const media = window.matchMedia(wideSidebarQuery)
    const update = () => setOpen(media.matches)
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])
  return (
    <SidebarProvider open={open} onOpenChange={setOpen} className="h-dvh min-h-0 overflow-hidden">
      {children}
    </SidebarProvider>
  )
}

const AppHeaderContext = createContext<{
  toolbar: HTMLDivElement | null
  actions: HTMLDivElement | null
  setToolbar: (target: HTMLDivElement | null) => void
  setActions: (target: HTMLDivElement | null) => void
} | null>(null)

export function AppHeaderScope({ children }: { children: ReactNode }) {
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null)
  const [actions, setActions] = useState<HTMLDivElement | null>(null)
  return (
    <AppHeaderContext.Provider value={{ toolbar, actions, setToolbar, setActions }}>
      {children}
    </AppHeaderContext.Provider>
  )
}

export function useAppHeader() {
  return useContext(AppHeaderContext)
}

export function AppHeader() {
  const context = useAppHeader()
  return (
    <header className="app-header grid min-w-0 shrink-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 px-2 py-2">
      <SidebarTrigger />
      <div className="flex min-w-0 items-center gap-3">
        <div ref={context?.setToolbar} className="min-w-0 flex-1" />
        <div
          ref={context?.setActions}
          className="flex min-w-0 max-w-[50%] shrink-0 items-center gap-2 overflow-x-auto empty:hidden [&>*]:shrink-0"
        />
      </div>
    </header>
  )
}

/** Form controls retain their owning component state and native form association. */
export function AppHeaderActions({ children }: { children: ReactNode }) {
  const context = useAppHeader()
  if (!context) {
    return children
  }
  return context.actions ? createPortal(children, context.actions) : null
}
