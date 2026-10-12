import { SlidersHorizontal } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"

const menuIds = [
  "container",
  "tests",
  "files",
  "git-graph",
  "dependencies",
  "project-settings",
] as const
type MenuId = (typeof menuIds)[number]

function readHidden(key: string | undefined): MenuId[] {
  try {
    const value: unknown = key ? JSON.parse(localStorage.getItem(key) ?? "[]") : []
    if (Array.isArray(value)) {
      return menuIds.filter((id) => value.includes(id))
    }
  } catch {
    // Display preferences must not prevent access to connected projects.
  }
  return []
}

export function useProjectMenuOptions(projectId?: string) {
  const key = projectId ? `redpact:project-navigation:${projectId}` : undefined
  const [hidden, setHidden] = useState(() => readHidden(key))
  function save(next: MenuId[]) {
    setHidden(next)
    try {
      if (key) {
        localStorage.setItem(key, JSON.stringify(next))
      }
    } catch {
      // Keep the session usable when browser storage is unavailable.
    }
  }
  return { hidden, save }
}

export function ProjectMenuOptions({
  items,
  display,
  disabled,
}: {
  items: { id: MenuId; label: string }[]
  display: ReturnType<typeof useProjectMenuOptions>
  disabled: boolean
}) {
  const { t } = useTranslation()
  const count = items.filter((item) => display.hidden.includes(item.id)).length
  const label = count
    ? t("Project menu options ({{count}} hidden)", { count })
    : t("Project menu options")
  return (
    <div className="relative shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={label} title={label} />}
          disabled={disabled}
        >
          <SlidersHorizontal aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("Show in sidebar")}</DropdownMenuLabel>
            {items.map((item) => (
              <DropdownMenuCheckboxItem
                key={item.id}
                checked={!display.hidden.includes(item.id)}
                closeOnClick={false}
                onCheckedChange={(checked) =>
                  display.save(
                    checked
                      ? display.hidden.filter((id) => id !== item.id)
                      : [...display.hidden, item.id],
                  )
                }
              >
                {item.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem disabled={!count} onClick={() => display.save([])}>
              {t("Show all")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {count > 0 && (
        <Badge
          variant="secondary"
          aria-hidden="true"
          className="pointer-events-none absolute -right-1 -top-1 px-1"
        >
          {count}
        </Badge>
      )}
    </div>
  )
}
