import { Node, Project, SyntaxKind } from "ts-morph"
import type { ParsedFile } from "../../core/types/contracts.js"

function description(node: Node, kind: "intent" | "reason") {
  const comments = node.getLeadingCommentRanges()
  const selected =
    kind === "intent"
      ? comments.filter((comment) => comment.getText().startsWith("/**")).slice(-1)
      : comments.filter((comment) => comment.getText().startsWith("//"))
  if (!selected.length) {
    return null
  }
  return selected
    .map((comment) =>
      comment
        .getText()
        .replace(/^\/\*\*|\*\/$/g, "")
        .split("\n")
        .map((line) => line.replace(/^\s*(?:\*|\/\/) ?/, "").trim())
        .join("\n")
        .trim(),
    )
    .join("\n")
}

export function parseSource(path: string, source: string): ParsedFile {
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true })
  const file = project.createSourceFile(path, source)
  const review: ParsedFile = { scenarios: [], limitations: [] }
  const imports = new Map<number, string>()
  for (const declaration of file.getImportDeclarations()) {
    if (declaration.getModuleSpecifierValue() !== "vitest") {
      continue
    }
    for (const item of declaration.getNamedImports()) {
      imports.set(item.getStart(), item.getName())
    }
  }
  const importedName = (node: Node) => {
    if (!Node.isIdentifier(node)) {
      return undefined
    }
    return node
      .getSymbol()
      ?.getDeclarations()
      .map((declaration) => imports.get(declaration.getStart()))
      .find(Boolean)
  }
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expression = call.getExpression()
    const name = importedName(expression)
    if (name !== "test" && name !== "it") {
      if (
        Node.isPropertyAccessExpression(expression) &&
        ["test", "it"].includes(importedName(expression.getExpression()) ?? "")
      ) {
        review.limitations.push(
          `line ${call.getStartLineNumber()}: modified/dynamic test calls are not statically mapped`,
        )
      }
      continue
    }
    const [title, callback] = call.getArguments()
    if (
      !title ||
      !Node.isStringLiteral(title) ||
      !callback ||
      !(Node.isArrowFunction(callback) || Node.isFunctionExpression(callback))
    ) {
      review.limitations.push(`line ${call.getStartLineNumber()}: dynamic test title or callback`)
      continue
    }
    const statement = call.getParentIfKind(SyntaxKind.ExpressionStatement)
    if (!statement) {
      continue
    }
    const assertions = callback
      .getDescendantsOfKind(SyntaxKind.ExpressionStatement)
      .flatMap((item) => {
        const hasExpect = item
          .getDescendantsOfKind(SyntaxKind.CallExpression)
          .some((candidate) => importedName(candidate.getExpression()) === "expect")
        return hasExpect
          ? [
              {
                code: item.getText(),
                reason: description(item, "reason"),
                line: item.getStartLineNumber(),
                observed: "unknown" as const,
              },
            ]
          : []
      })
    review.scenarios.push({
      title: title.getLiteralValue(),
      intent: description(statement, "intent"),
      line: call.getStartLineNumber(),
      assertions,
    })
  }
  review.limitations.push(
    "Static review only: suite context, helper assertions and individual assertion execution are not inferred.",
  )
  return review
}
