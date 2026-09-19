import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { promisify } from "node:util"

const execute = promisify(execFile)
let container: string | undefined
export async function target() {
  if (container) {
    return container
  }
  const file = process.env.REDPACT_CONNECTIONS_FILE
  if (!file) {
    throw new Error(
      "Run these E2E tests with Redpact run_tests and services: [app]; see e2e/README.md",
    )
  }
  const connections = JSON.parse(await readFile(file, "utf8"))
  const port = connections.services?.app?.ports?.["54318"]?.port
  if (!Number.isInteger(port)) {
    throw new Error("The selected app service has no observed 54318 port")
  }
  const result = await execute(
    "docker",
    ["ps", "--filter", `publish=${port}`, "--format", "{{.ID}}"],
    { timeout: 10000 },
  )
  const ids = result.stdout.trim().split(/\s+/).filter(Boolean)
  if (ids.length !== 1) {
    throw new Error(`Expected one managed app container, found ${ids.length}`)
  }
  container = ids[0]
  return container
}

// Requests originate inside the selected container to preserve Redpact's loopback boundary.
export async function node<T>(source: string, input: unknown = null): Promise<T> {
  const result = await execute(
    "docker",
    ["exec", await target(), "node", "--input-type=module", "-e", source, JSON.stringify(input)],
    { timeout: 15000, maxBuffer: 4 * 1024 * 1024 },
  )
  return JSON.parse(result.stdout)
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
export async function rpc<T = Record<string, unknown>>(method: string, params: unknown) {
  return node<T>(
    `
    const {method, params} = JSON.parse(process.argv[1]);
    const headers = {'Content-Type':'application/json', Accept:'application/json, text/event-stream'};
    async function send(body) {
      const response = await fetch('http://127.0.0.1:54318/mcp', {method:'POST', headers, body:JSON.stringify(body)});
      const session = response.headers.get('mcp-session-id');
      if (session) headers['mcp-session-id'] = session;
      if (!response.ok) throw new Error('MCP HTTP ' + response.status);
      const source = await response.text();
      if (!source) return;
      const value = source.startsWith('event:') || source.startsWith('data:')
        ? source.split('\\n').filter(line=>line.startsWith('data:')).map(line=>JSON.parse(line.slice(5))).at(-1)
        : JSON.parse(source);
      if (value.error) throw new Error(JSON.stringify(value.error));
      return value.result;
    }
    await send({jsonrpc:'2.0', id:1, method:'initialize', params:{protocolVersion:'2025-03-26', capabilities:{}, clientInfo:{name:'redpact-e2e', version:'1'}}});
    await send({jsonrpc:'2.0', method:'notifications/initialized'});
    console.log(JSON.stringify(await send({jsonrpc:'2.0', id:2, method, params})));
  `,
    { method, params },
  )
}
