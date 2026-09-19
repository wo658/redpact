import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import type { Api, DependencyMode, SettingsDocument } from "@/lib/api"
import { DataTable } from "./data-table"
import { Notice } from "./feedback"
import { Button } from "./ui/button"
import { Field, FieldGroup, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table"

type Binding = NonNullable<DependencyMode["env"]>[string][string]
type Props = {
  api: Api
  projectId: string
  dependency: string
  modeName: string
  mode: DependencyMode
  refresh(): void
}
type Draft = {
  target: string
  key: string
  value: string
  original?: string
  secret?: string
  document: SettingsDocument
}

export function EnvironmentEditor(props: Props) {
  const { t } = useTranslation()
  const { api, projectId, dependency, modeName, mode, refresh } = props
  const [draft, setDraft] = useState<Draft>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [values, setValues] = useState<Record<string, string>>({})
  const env = useMemo(() => mode.env ?? {}, [mode.env])
  useEffect(() => {
    const abort = new AbortController()
    const names = [
      ...new Set(
        Object.values(env).flatMap((row) =>
          Object.values(row).flatMap((value) =>
            typeof value !== "string" && "secret" in value ? [value.secret] : [],
          ),
        ),
      ),
    ]
    setValues({})
    void Promise.all(
      names.map(
        async (name) =>
          [name, (await api.projectSecretValue(projectId, name, abort.signal)).value] as const,
      ),
    )
      .then((entries) => {
        if (!abort.signal.aborted) {
          setValues(Object.fromEntries(entries))
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setError(t("Could not load environment values."))
        }
      })
    return () => abort.abort()
  }, [api, projectId, env, t])
  function text(value: Binding) {
    if (typeof value === "string") {
      return value || t("Empty string")
    }
    if ("secret" in value) {
      return values[value.secret] ?? t("Loading…")
    }
    return t("Unset")
  }
  async function edit(target: string, original?: string) {
    setBusy(true)
    setError("")
    try {
      const document = await api.projectConfiguration(projectId)
      if (!document.source || document.issues.length) {
        throw new Error(t("Repair project settings before editing environment values."))
      }
      const binding = original ? env[target]?.[original] : undefined
      const secret = typeof binding === "object" && "secret" in binding ? binding.secret : undefined
      if (secret && !Object.hasOwn(values, secret)) {
        throw new Error(t("Could not load environment values."))
      }
      let value = ""
      if (binding !== undefined) {
        value = typeof binding === "string" ? binding : text(binding)
      }
      setDraft({
        target,
        key: original ?? "",
        value,
        original,
        secret,
        document,
      })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }
  async function save(remove = false) {
    if (!draft) {
      return
    }
    setBusy(true)
    setError("")
    try {
      if (draft.secret && !remove) {
        await api.saveProjectSecret(projectId, draft.secret, draft.value)
        setValues((previous) => ({ ...previous, [draft.secret as string]: draft.value }))
      } else {
        const source = JSON.parse(draft.document.source as string)
        const definition = source.dependencies[dependency].modes[modeName]
        const entries = { ...(definition.env?.[draft.target] ?? {}) }
        if (!remove && draft.key !== draft.original && Object.hasOwn(entries, draft.key)) {
          throw new Error(t("This key already exists."))
        }
        if (draft.original) {
          delete entries[draft.original]
        }
        const next = remove ? entries : { ...entries, [draft.key]: draft.value }
        definition.env = { ...definition.env, [draft.target]: next }
        await api.saveProjectConfiguration(projectId, {
          source: `${JSON.stringify(source, null, 2)}\n`,
          revision: draft.document.revision,
        })
      }
      setDraft(undefined)
      refresh()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex w-full min-w-0 content-width-768 flex-col gap-4">
      {Object.entries(env).map(([target, bindings]) => (
        <section key={target} aria-label={target} className="flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <code className="min-w-0 [overflow-wrap:anywhere]">{target}</code>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("Add environment variable")}
              disabled={busy || !!draft}
              onClick={() => void edit(target)}
            >
              <PlusIcon />
            </Button>
          </div>
          <DataTable width="wide" aria-label={t("Environment overrides")} className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[min(35%,16rem)]">{t("key")}</TableHead>
                <TableHead>{t("value")}</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">{t("Actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(bindings).map(([key, value]) => (
                <TableRow key={key}>
                  <TableCell className="whitespace-normal break-all">
                    <code>{key}</code>
                  </TableCell>
                  <TableCell className="whitespace-pre-wrap break-all">
                    <code>{text(value)}</code>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("Edit {{key}}", { key })}
                      disabled={busy || !!draft}
                      onClick={() => void edit(target, key)}
                    >
                      <PencilIcon />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
        </section>
      ))}
      {!Object.keys(env).length && <p>{t("No environment overrides.")}</p>}
      {!draft && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          disabled={busy}
          onClick={() => void edit("")}
        >
          <PlusIcon data-icon="inline-start" />
          {t("Add target service")}
        </Button>
      )}
      {draft && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
          className="flex flex-col gap-3"
        >
          <FieldGroup>
            {!Object.hasOwn(env, draft.target) && (
              <Field>
                <FieldLabel htmlFor="env-target">{t("Target service")}</FieldLabel>
                <Input
                  id="env-target"
                  value={draft.target}
                  required
                  disabled={busy}
                  onChange={(event) => setDraft({ ...draft, target: event.target.value })}
                />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="env-key">{t("key")}</FieldLabel>
              <Input
                id="env-key"
                value={draft.key}
                required
                pattern="[A-Za-z_][A-Za-z0-9_]*"
                disabled={busy || !!draft.secret}
                onChange={(event) => setDraft({ ...draft, key: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="env-value">{t("value")}</FieldLabel>
              <Input
                id="env-value"
                value={draft.value}
                maxLength={10000}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setDraft({ ...draft, value: event.target.value })}
              />
            </Field>
          </FieldGroup>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {t("Save")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setDraft(undefined)
                setError("")
              }}
            >
              {t("Cancel")}
            </Button>
            {draft.original && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void save(true)}
              >
                <Trash2Icon data-icon="inline-start" />
                {t("Delete")}
              </Button>
            )}
          </div>
        </form>
      )}
      {error && <Notice error>{error}</Notice>}
    </div>
  )
}
