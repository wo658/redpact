import { z } from "zod"

export const composeServiceName = z.string().min(1)
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
