# Local server workspace

TypeScript/Hono HTTP and MCP over shared Core services, with Vitest execution and
file-based evidence. Build and launch from the repository root:

```sh
pnpm --filter @redpact/server build
node app/server/dist/cli.js serve --project .
```

The default server binds loopback on port 54318. See the canonical documentation:

- [Installation and connection](../../docs/installation.md)
- [Architecture](../../docs/architecture.md)
- [Settings ownership](../../docs/settings-reference.md)
- [Execution and environments](../../docs/execution.md)
- [HTTP/MCP and generated API reference](../../docs/interfaces.md)
- [Runtime data and recovery](../../docs/storage.md)
- [Development, verification and packaging](../../docs/development.md)

[PACKAGE_README.md](PACKAGE_README.md) is the standalone installation entry shipped
inside the runtime package, not a separate implementation manual.
