import { en } from "../locales/en"

export function BrandWordmark() {
  return (
    <span
      style={{
        color: "currentColor",
        fontWeight: 600,
        letterSpacing: "-0.035em",
        wordSpacing: "0.045em",
        whiteSpace: "nowrap",
      }}
    >
      {en["Red Pact"]}
    </span>
  )
}
