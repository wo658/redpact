import type { ServiceRelationship } from "./api"

export type DependencyNode = { kind: "application" | "dependency"; name: string }
export const dependencyNodeKey = (node: DependencyNode) => `${node.kind}:${node.name}`

function label(value: string) {
  return value.replace(/[&"<>#\r\n[\]{}\\`|]/g, (character) => `#${character.charCodeAt(0)};`)
}

export function dependencyDiagram(
  nodes: DependencyNode[],
  relationships: ServiceRelationship[],
  labels: Record<DependencyNode["kind"], string>,
) {
  const ids = new Map(nodes.map((node, index) => [dependencyNodeKey(node), `service${index}`]))
  const lines = ["flowchart LR"]
  for (const kind of ["application", "dependency"] as const) {
    const members = nodes.filter((node) => node.kind === kind)
    if (!members.length) {
      continue
    }
    lines.push(`  subgraph group_${kind}["${label(labels[kind])}"]`)
    for (const node of members) {
      const id = ids.get(dependencyNodeKey(node))
      lines.push(`    ${id}["${label(node.name)}"]:::${id}`)
    }
    lines.push("  end")
  }
  for (const [index, relation] of relationships.entries()) {
    const from = ids.get(`application:${relation.from}`)
    const to = ids.get(dependencyNodeKey(relation.to))
    if (from && to) {
      lines.push(`  ${from} edge_${from}_${to}_${index}@--> ${to}`)
    }
  }
  return lines.join("\n")
}
