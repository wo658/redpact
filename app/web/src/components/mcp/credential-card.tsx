import { useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { Notice } from "../feedback"
import { Button } from "../ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../ui/field"
import { Input } from "../ui/input"
import type { SecretStatus } from "./model"

type Save = (name: string, value: string) => Promise<{ configured: boolean }>
export function CredentialCard({ inputs, save }: { inputs: SecretStatus[]; save: Save }) {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col gap-3" aria-label={t("Required connection keys")}>
      <h2>{t("Required connection keys")}</h2>
      <p>
        {t("Enter only the keys needed for this connection. Values are saved directly to Redpact.")}
      </p>
      <FieldGroup>
        {inputs.map((input) => (
          <CredentialInput key={input.name} input={input} save={save} />
        ))}
      </FieldGroup>
    </section>
  )
}
function CredentialInput({ input, save }: { input: SecretStatus; save: Save }) {
  const { t } = useTranslation()
  const id = useId()
  const [value, setValue] = useState("")
  const [configured, setConfigured] = useState(input.configured)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  async function submit() {
    setBusy(true)
    setError(false)
    try {
      setConfigured((await save(input.name, value)).configured)
      setValue("")
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      className="flex flex-col gap-2"
    >
      <Field data-invalid={error} data-disabled={busy}>
        <FieldLabel htmlFor={id}>{input.name}</FieldLabel>
        <FieldDescription>
          {configured ? t("Configured") : t("Value required before execution")}
        </FieldDescription>
        <Input
          id={id}
          type="password"
          value={value}
          autoComplete="off"
          maxLength={10000}
          disabled={busy}
          aria-invalid={error}
          onChange={(event) => setValue(event.target.value)}
        />
      </Field>
      <Button type="submit" size="sm" className="self-start" disabled={busy || !value}>
        {t("Save")}
      </Button>
      {error && (
        <Notice error>
          {t("Could not save key. Request the input card again if it has expired.")}
        </Notice>
      )}
    </form>
  )
}
