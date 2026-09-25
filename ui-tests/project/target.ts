import { readFile } from "node:fs/promises"

export async function node<T>(source: string, input: unknown = null): Promise<T> {
  const file = process.env.REDPACT_CONNECTIONS_FILE
  if (!file) {
    throw new Error("Run through Redpact; see e2e/README.md")
  }
  const connections = JSON.parse(await readFile(file, "utf8"))
  const endpoint = connections.services?.app?.ports?.["54319"]
  if (!endpoint) {
    throw new Error("Managed fixture endpoint 54319 is unavailable")
  }
  const response = await fetch(`http://${endpoint.host}:${endpoint.port}/node`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source, input }),
    signal: AbortSignal.timeout(65000),
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json() as Promise<T>
}

export async function http<T = Record<string, unknown>>(
  path: string,
  method = "GET",
  body?: unknown,
) {
  return node<{ status: number; body: T }>(
    `
    const {path, method, body} = JSON.parse(process.argv[1]);
    const response = await fetch('http://127.0.0.1:54318' + path, {
      method, headers: {'Content-Type': 'application/json'},
      ...(body === undefined ? {} : {body: JSON.stringify(body)})
    });
    const text = await response.text();
    let value; try { value = JSON.parse(text) } catch { value = text }
    console.log(JSON.stringify({status: response.status, body: value}));
  `,
    { path, method, body },
  )
}
