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

export async function browser(source: string) {
  return node<{
    stats: { expected: number; unexpected: number }
    suites: { specs: { tests: { results: { steps: { title: string }[] }[] }[] }[] }[]
  }>(
    `
    import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
    import {execFileSync} from 'node:child_process';
    const directory=mkdtempSync('/e2e-browser/run-');
    try {
      writeFileSync(directory+'/test.spec.cjs',JSON.parse(process.argv[1]));
      writeFileSync(directory+'/playwright.config.cjs',"module.exports={testDir:__dirname,testMatch:'test.spec.cjs',reporter:'json',use:{headless:true},workers:1}");
      let report;
      try {report=execFileSync('/e2e-browser/node_modules/.bin/playwright',['test','--config',directory+'/playwright.config.cjs'],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024})}
      catch(error){if(!error.stdout)throw error;report=error.stdout}
      const parsed=JSON.parse(report);
      for (const suite of parsed.suites??[]) for(const spec of suite.specs??[]) for(const test of spec.tests??[]) for(const result of test.results??[]) {
        if(result.status!=='passed') for(const attachment of result.attachments??[]) if(attachment.name==='error-context') result.context=readFileSync(attachment.path,'utf8').slice(0,16000);
      }
      console.log(JSON.stringify(parsed));
    } finally {rmSync(directory,{recursive:true,force:true})}
  `,
    source,
  )
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
