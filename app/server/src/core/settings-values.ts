import { z } from "zod"

const name = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/)
export const variableName = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
  .refine(
    (value) =>
      !/^(REDPACT_|DOCKER_|TESTCONTAINERS_|COMPOSE_|NODE_|NPM_CONFIG_|npm_config_)/.test(value) &&
      !["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SystemRoot"].includes(value),
    "Reserved runner variable",
  )
export const relativeFile = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (value) => !value.startsWith("/") && !value.split(/[\\/]/).includes(".."),
    "Use a project-relative path",
  )
export const inputValue = z.union([
  z.strictObject({ value: z.string().max(10000) }),
  z.strictObject({ secret: variableName }),
])
export const connectionValue = z.strictObject({
  service: name,
  port: z.number().int().min(1).max(65535),
  value: z.enum(["host", "port", "url"]),
  scheme: z.enum(["http", "https"]).optional(),
})
