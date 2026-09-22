import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { expect, test } from "vitest"

const root = fileURLToPath(new URL("../src/", import.meta.url))
const pureImports = new Map<string, Set<string>>([
  ["zod", new Set(["z"])],
  ["semver", new Set(["gt", "prerelease", "valid"])],
  ["node:path", new Set(["isAbsolute", "matchesGlob"])],
  ["node:crypto", new Set(["createHash", "timingSafeEqual"])],
  ["node:util", new Set(["isDeepStrictEqual"])],
])

function unreviewedImport(node: ts.Node): string | undefined {
  if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) {
    return
  }
  const name = node.moduleSpecifier.text
  if (name.startsWith(".") || node.importClause?.isTypeOnly) {
    return
  }
  const allowed = pureImports.get(name)
  const bindings = node.importClause?.namedBindings
  if (!allowed || node.importClause?.name || !bindings || !ts.isNamedImports(bindings)) {
    return name
  }
  if (
    bindings.elements.some(
      (binding) => !binding.isTypeOnly && !allowed.has((binding.propertyName ?? binding.name).text),
    )
  ) {
    return name
  }
}

function coreEffects(source: ts.SourceFile): string[] {
  const violations: string[] = []
  function visit(node: ts.Node) {
    const unreviewed = unreviewedImport(node)
    if (unreviewed) {
      violations.push(`external import: ${unreviewed}`)
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      !node.moduleSpecifier.text.startsWith(".") &&
      !node.isTypeOnly
    ) {
      violations.push(`external export: ${node.moduleSpecifier.text}`)
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const expression = node.expression.getText(source)
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        /^(require|fetch|setTimeout|setInterval|setImmediate|queueMicrotask|Date)$/.test(
          expression,
        ) ||
        /^(Date\.now|Math\.random|(?:globalThis|process|console|crypto)\.)/.test(expression)
      ) {
        violations.push(`ambient effect: ${expression}`)
      }
    }
    if (ts.isPropertyAccessExpression(node) && node.expression.getText(source) === "process") {
      violations.push(`process access: ${node.getText(source)}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return violations
}

function files(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(path, entry.name)) : [join(path, entry.name)],
  )
}
const graph = new Map<string, string[]>()
for (const file of files(root).filter((path) => path.endsWith(".ts"))) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true)
  const dependencies: string[] = []
  function visit(node: ts.Node) {
    let specifier: ts.Node | undefined
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      specifier = node.moduleSpecifier
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      specifier = node.argument.literal
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      specifier = node.arguments[0]
    }
    if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith(".")) {
      dependencies.push(
        relative(root, resolve(dirname(file), specifier.text.replace(/\.js$/, ".ts"))),
      )
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  graph.set(relative(root, file), dependencies)
}

test("Core is independent of Shell and transport cannot bypass workflows through adapters", () => {
  const violations: string[] = []
  for (const [file, dependencies] of graph) {
    for (const target of dependencies) {
      if (
        (file.startsWith("core/") && !target.startsWith("core/")) ||
        (file.startsWith("adapters/") &&
          (target.startsWith("workflows/") || target.startsWith("interfaces/"))) ||
        (file.startsWith("interfaces/") && target.startsWith("adapters/")) ||
        (file.startsWith("workflows/") && target.startsWith("interfaces/"))
      ) {
        violations.push(`${file} -> ${target}`)
      }
    }
  }
  expect(violations).toEqual([])
})

test("Core uses reviewed deterministic imports and does not access ambient effects", () => {
  const violations: string[] = []
  for (const file of files(join(root, "core")).filter((path) => path.endsWith(".ts"))) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    )
    violations.push(
      ...coreEffects(source).map((violation) => `${relative(root, file)}: ${violation}`),
    )
  }
  expect(violations).toEqual([])
})

test("Core guard detects aliased I/O imports, dynamic imports and ambient state", () => {
  const source = ts.createSourceFile(
    "fixture.ts",
    `
    import { readFile as read } from "node:fs/promises"
    import { randomUUID as id } from "node:crypto"
    const io = import("node:fs")
    const now = Date.now()
    const created = new Date()
    const random = Math.random()
    const value = process.env.HOME
  `,
    ts.ScriptTarget.Latest,
    true,
  )
  expect(coreEffects(source)).toEqual([
    "external import: node:fs/promises",
    "external import: node:crypto",
    "ambient effect: import",
    "ambient effect: Date.now",
    "ambient effect: Date",
    "ambient effect: Math.random",
    "process access: process.env",
  ])
})

test("Server dependencies are acyclic, including type imports", () => {
  const cycles = new Set<string>()
  const visited = new Set<string>()
  function visit(file: string, path: string[]) {
    if (path.includes(file)) {
      cycles.add([...path.slice(path.indexOf(file)), file].join(" -> "))
      return
    }
    if (visited.has(file)) {
      return
    }
    for (const dependency of graph.get(file) ?? []) {
      visit(dependency, [...path, file])
    }
    visited.add(file)
  }
  for (const file of graph.keys()) {
    visit(file, [])
  }
  expect([...cycles]).toEqual([])
})

test("Shared Core types live in types modules containing only type declarations and imports", () => {
  const misplaced: string[] = []
  const runtime: string[] = []
  for (const path of files(join(root, "core")).filter((path) => path.endsWith(".ts"))) {
    const file = relative(join(root, "core"), path)
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    )
    for (const statement of source.statements) {
      const declaration =
        ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)
      if (file.startsWith("types/")) {
        if (
          !declaration &&
          !(ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly)
        ) {
          runtime.push(`${file}: ${ts.SyntaxKind[statement.kind]}`)
        }
      } else if (
        declaration &&
        statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        misplaced.push(`${file}: ${statement.name.text}`)
      }
    }
  }
  expect(misplaced).toEqual([])
  expect(runtime).toEqual([])
})
