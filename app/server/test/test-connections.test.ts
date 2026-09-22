import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test as unitTest } from "vitest"
import { createTestVitestRunner as createVitestRunner } from "./helpers/container-runner.js"

const test = unitTest.skipIf(process.env.REDPACT_DOCKER_TESTS !== "1")

test("secret values are removed from stdout, stderr and failure evidence including overlapping keys", async () => {
  const root = await mkdtemp(join(tmpdir(), "redpact-redaction-"))
  try {
    const value = "private-overlapping-value"
    const result = await createVitestRunner(root).execute(
      {
        files: [
          {
            path: "failure.test.ts",
            source: `
      import {test,expect} from 'vitest';
      test('runtime failure', () => {
        process.stdout.write(process.env.CREDENTIAL);
        process.stderr.write(process.env.CREDENTIAL);
        expect(process.env.CREDENTIAL).toBe("different-value");
      });
    `,
          },
        ],
      } as never,
      "redaction",
      new AbortController().signal,
      undefined,
      { CREDENTIAL: value },
      ["private", value],
    )
    expect(result.outcome).toBe("assertion_failed")
    const evidence =
      JSON.stringify(result) +
      (await readFile(join(root, "runs/redaction/stdout.log"), "utf8")) +
      (await readFile(join(root, "runs/redaction/stderr.log"), "utf8")) +
      (await readFile(join(root, "runs/redaction/report.json"), "utf8"))
    expect(evidence).toContain("[REDACTED]")
    expect(evidence).not.toContain(value)
    expect(evidence).not.toContain("overlapping-value")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("runner supplies a private per-run connection file without secrets or source edits", async () => {
  const root = await mkdtemp(join(tmpdir(), "redpact-connections-"))
  try {
    const runner = createVitestRunner(root)
    const submission = {
      files: [
        {
          path: "connections.test.ts",
          source: `
      import { readFileSync } from 'node:fs';
      import { test, expect } from 'vitest';
      test('runtime connections', () => {
        expect(process.env.REDPACT_CONNECTIONS_FILE).toBeTypeOf('string');
        expect(process.env.REDPACT_CONNECTIONS_FILE).not.toBe('/wrong');
        const connections = JSON.parse(readFileSync(process.env.REDPACT_CONNECTIONS_FILE!, 'utf8'));
        expect(connections).toEqual({version: 1, services: {app: {ports: {'3000': {host: '127.0.0.1', port: 41001}}}, db: {ports: {'5432': {host: '127.0.0.1', port: 41002}}}, worker: {ports: {}}}});
        expect(process.env.DB_PASSWORD).toBe('fixture-secret');
      });`,
        },
      ],
    }
    const connections = {
      version: 1,
      services: {
        app: { ports: { "3000": { host: "127.0.0.1", port: 41001 } } },
        db: { ports: { "5432": { host: "127.0.0.1", port: 41002 } } },
        worker: { ports: {} },
      },
    }
    const result = await runner.execute(
      submission as never,
      "first",
      new AbortController().signal,
      undefined,
      { DB_PASSWORD: "fixture-secret", REDPACT_CONNECTIONS_FILE: "/wrong" },
      ["fixture-secret"],
      connections as never,
    )
    expect(result, JSON.stringify(result)).toMatchObject({ outcome: "passed" })
    const file = join(root, "runs/first/connections.json")
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual(connections)
    expect((await stat(file)).mode & 0o777).toBe(0o600)
    expect(await readFile(file, "utf8")).not.toContain("fixture-secret")
    expect(await readFile(join(root, "runs/first/source/connections.test.ts"), "utf8")).toBe(
      submission.files[0].source,
    )
    const empty = await runner.execute(
      {
        files: [
          {
            path: "empty.test.ts",
            source: `
      import {test,expect} from 'vitest'; import {readFileSync} from 'node:fs';
      test('no stale connections', () => expect(JSON.parse(readFileSync(process.env.REDPACT_CONNECTIONS_FILE!, 'utf8'))).toEqual({version: 1, services: {}}));
    `,
          },
        ],
      } as never,
      "second",
      new AbortController().signal,
    )
    expect(empty.outcome).toBe("passed")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 20000)

test("user fixtures run unchanged in Redpact and standalone Vitest and release clients", async () => {
  const { createServer } = await import("node:http")
  const { mkdir, writeFile, symlink } = await import("node:fs/promises")
  const { createRequire } = await import("node:module")
  const { dirname } = await import("node:path")
  const { execa } = await import("execa")
  const root = await mkdtemp(join(tmpdir(), "redpact-portable-"))
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "application/json")
    response.end(JSON.stringify({ quantity: 1, totalCents: 250 }))
  })
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", resolve)
    })
    const address = server.address()
    if (!address || typeof address === "string") {
      throw new Error("No test listener")
    }
    const connections = {
      version: 1 as const,
      services: {
        app: {
          ports: {
            "3000": { host: "127.0.0.1", port: address.port },
            "9000": { host: "127.0.0.1", port: address.port },
          },
        },
      },
    }
    const files = await Promise.all(
      ["connections.js", "fixtures.js", "http.test.js"].map(async (name) => ({
        path: name,
        source: await readFile(
          new URL(`../../../examples/order-desk/tests/${name}`, import.meta.url),
          "utf8",
        ),
      })),
    )
    files.push({
      path: "lifecycle.test.ts",
      source: `
      import { test as base, expect, afterAll } from 'vitest';
      import { connection } from './connections.js';
      let closed = 0;
      const test = base.extend<{client: {port: number}}>({client: async ({}, use) => {
        const client = connection('app', 3000);
        try { await use(client); } finally { closed++; }
      }});
      test('user client', ({client}) => expect(client.port).toBeGreaterThan(0));
      test('missing service', () => expect(() => connection('inactive')).toThrow('Unavailable service'));
      test('ambiguous port', () => expect(() => connection('app')).toThrow('Select an exposed port'));
      test('missing port', () => expect(() => connection('app', 1234)).toThrow('Select an exposed port'));
      afterAll(() => expect(closed).toBe(1));
    `,
    })
    const runner = createVitestRunner(root)
    const managed = await runner.execute(
      { files } as never,
      "managed",
      new AbortController().signal,
      undefined,
      undefined,
      [],
      {
        ...connections,
        services: {
          app: {
            ports: Object.fromEntries(
              Object.entries(connections.services.app.ports).map(([key, value]) => [
                key,
                { ...value, host: "host.docker.internal" },
              ]),
            ),
          },
        },
      },
    )
    expect(managed).toMatchObject({ outcome: "passed" })
    const standalone = join(root, "standalone")
    await mkdir(join(standalone, "node_modules"), { recursive: true })
    for (const file of files) {
      await writeFile(join(standalone, file.path), file.source)
    }
    const require = createRequire(import.meta.url)
    const vitestRoot = dirname(require.resolve("vitest/package.json"))
    await symlink(vitestRoot, join(standalone, "node_modules/vitest"), "junction")
    const connectionFile = join(root, "standalone-connections.json")
    await writeFile(connectionFile, JSON.stringify(connections))
    const config = join(standalone, "vitest.config.mjs")
    await writeFile(config, "export default {test: {fileParallelism: false, maxWorkers: 1}}")
    const result = await execa(
      process.execPath,
      [join(vitestRoot, "vitest.mjs"), "run", "--config", config],
      {
        cwd: standalone,
        env: { TEST_CONNECTIONS_FILE: connectionFile },
        extendEnv: false,
        reject: false,
      },
    )
    expect(result.exitCode, result.stdout + result.stderr).toBe(0)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
}, 20000)
