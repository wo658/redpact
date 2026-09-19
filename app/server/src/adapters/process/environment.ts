export function minimalEnvironment(): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key of ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SystemRoot", "LANG"]) {
    if (process.env[key]) {
      result[key] = process.env[key] as string
    }
  }
  return result
}
