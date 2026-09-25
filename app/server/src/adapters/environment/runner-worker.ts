export async function prepareRunner(
  _worker: URL,
  _input: unknown,
  _signal: AbortSignal,
  _options: {
    timeout: number
    cwd?: string
    environment?: Record<string, string>
    failure: (stderr: string) => string
  },
): Promise<string> {
  return ""
}
