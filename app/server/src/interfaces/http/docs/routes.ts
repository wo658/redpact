import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { Hono } from "hono"
import { secureHeaders } from "hono/secure-headers"
import { openAPIRouteHandler } from "hono-openapi"

const require = createRequire(import.meta.url)
const assets = {
  "redoc.LICENSE.txt": ["redoc/LICENSE", "text/plain; charset=utf-8"],
  "redoc.standalone.js.LICENSE.txt": [
    "redoc/bundles/redoc.standalone.js.LICENSE.txt",
    "text/plain; charset=utf-8",
  ],
  "swagger-ui.LICENSE.txt": ["swagger-ui-dist/LICENSE", "text/plain; charset=utf-8"],
  "swagger-ui.NOTICE.txt": ["swagger-ui-dist/NOTICE", "text/plain; charset=utf-8"],
  "swagger-ui-bundle.js.LICENSE.txt": [
    "swagger-ui-dist/swagger-ui-bundle.js.LICENSE.txt",
    "text/plain; charset=utf-8",
  ],
  "redoc.standalone.js": ["redoc/bundles/redoc.standalone.js", "text/javascript; charset=utf-8"],
  "swagger-ui-bundle.js": [
    "swagger-ui-dist/swagger-ui-bundle.js",
    "text/javascript; charset=utf-8",
  ],
  "swagger-ui.css": ["swagger-ui-dist/swagger-ui.css", "text/css; charset=utf-8"],
} as const
const redocInit = `Redoc.init('/openapi.json', { sideNavStyle: 'path-only', disableGoogleFont: true, hideDownloadButton: false, theme: { typography: { fontFamily: 'system-ui, sans-serif', headings: { fontFamily: 'system-ui, sans-serif' } } } }, document.getElementById('redoc'));`
const swaggerInit = `SwaggerUIBundle({ url: '/openapi.json', dom_id: '#swagger-ui', deepLinking: true, validatorUrl: null, persistAuthorization: false, queryConfigEnabled: false });`
function page(kind: "redoc" | "swagger") {
  const redoc = kind === "redoc"
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Redpact API · ${redoc ? "Redoc" : "Swagger UI"}</title>
${redoc ? "" : '<link rel="stylesheet" href="/docs/assets/swagger-ui.css">'}
</head><body>
<nav aria-label="API documentation"><a href="/redoc">Redoc</a> · <a href="/swagger">Swagger UI</a> · <a href="/openapi.json">OpenAPI JSON</a></nav>
<p>Documentation is public on this local server. API calls require your REDPACT_TOKEN in Swagger UI's Authorize dialog.</p>
<noscript>Enable JavaScript to read the interactive reference, or download <a href="/openapi.json">OpenAPI JSON</a>.</noscript>
<div id="${redoc ? "redoc" : "swagger-ui"}"></div>
<script src="/docs/assets/${redoc ? "redoc.standalone.js" : "swagger-ui-bundle.js"}"></script>
<script src="/docs/assets/${kind}-init.js"></script>
</body></html>`
}

export function documentationRoutes(app: Hono) {
  const routes = new Hono()
  const documentationHeaders = secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      workerSrc: ["'self'", "blob:"],
      baseUri: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'none'"],
    },
  })
  // Mounted at root: an unscoped middleware would also restrict the viewer iframe.
  for (const path of ["/openapi.json", "/redoc", "/docs", "/swagger", "/docs/*"]) {
    routes.use(path, documentationHeaders)
  }
  routes.get(
    "/openapi.json",
    openAPIRouteHandler(app, {
      documentation: {
        openapi: "3.1.0",
        info: {
          title: "Redpact API",
          version: "0.1.0",
          description:
            "Local development review with immutable test submissions, Vitest runs, worktrees, and managed Compose environments. API requests use the local Host, Origin, and Fetch Metadata boundary without a token. Documentation endpoints are public on loopback. MCP uses the separate /mcp Streamable HTTP endpoint and is not a REST operation in this document.",
        },
        servers: [{ url: "/" }],
        security: [],
      },
      exclude: [/^(?!\/api\/)/],
    }),
  )
  routes.get("/redoc", (c) => c.html(page("redoc")))
  routes.get("/docs", (c) => c.html(page("redoc")))
  routes.get("/swagger", (c) => c.html(page("swagger")))
  for (const [name, [module, contentType]] of Object.entries(assets)) {
    let content: Promise<string> | undefined
    routes.get(`/docs/assets/${name}`, async (c) => {
      content ??= readFile(require.resolve(module), "utf8")
      return c.body(await content, 200, { "Content-Type": contentType })
    })
  }
  routes.get("/docs/assets/redoc-init.js", (c) =>
    c.body(redocInit, 200, { "Content-Type": "text/javascript; charset=utf-8" }),
  )
  routes.get("/docs/assets/swagger-init.js", (c) =>
    c.body(swaggerInit, 200, { "Content-Type": "text/javascript; charset=utf-8" }),
  )
  return routes
}
