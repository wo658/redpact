import { ChevronDownIcon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import type {
  DependencyDefinition,
  DependencySettings,
  ServiceRelationship,
  SourceEvidence,
} from "@/lib/api"
import {
  dependencyDiagram,
  type DependencyNode as Node,
  dependencyNodeKey as nodeKey,
} from "@/lib/dependency-diagram"
import { dependencyModeLabel } from "@/lib/dependency-modes"
import { DependencyDiagram } from "./dependency-diagram"
import { EmptyState } from "./feedback"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible"

export function DependencyOverview({ settings }: { settings: DependencySettings }) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState("")
  const applications = Object.keys(settings.applicationServices ?? {})
  const dependencies = Object.keys(settings.dependencies ?? {})
  const nodes: Node[] = [
    ...applications.map((name) => ({
      kind: "application" as const,
      name,
    })),
    ...dependencies.map((name) => ({
      kind: "dependency" as const,
      name,
    })),
  ]
  const active = nodes.find((node) => nodeKey(node) === selected) ?? nodes[0]
  if (!active) {
    return <EmptyState>{t("No dependencies declared.")}</EmptyState>
  }
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {!applications.length && (
        <p className="text-sm text-muted-foreground">
          {t("Application services are not described yet. Ask your agent to update the topology.")}
        </p>
      )}
      <RelationshipMap
        nodes={nodes}
        relationships={settings.relationships ?? []}
        active={active}
        onSelect={setSelected}
      />
      <NodeDetails key={nodeKey(active)} node={active} settings={settings} />
    </div>
  )
}

function RelationshipMap({
  nodes,
  relationships,
  active,
  onSelect,
}: {
  nodes: Node[]
  relationships: ServiceRelationship[]
  active: Node
  onSelect: (key: string) => void
}) {
  const { t } = useTranslation()
  return (
    <section aria-label={t("Service relationships")} className="rounded-xl border border-border">
      <DependencyDiagram
        source={dependencyDiagram(nodes, relationships, {
          application: t("Application services"),
          dependency: t("Dependencies"),
        })}
        nodes={nodes}
        active={active}
        onSelect={onSelect}
      />
    </section>
  )
}

function NodeDetails({ node, settings }: { node: Node; settings: DependencySettings }) {
  const { t } = useTranslation()
  const application =
    node.kind === "application" ? settings.applicationServices?.[node.name] : undefined
  const dependency = node.kind === "dependency" ? settings.dependencies?.[node.name] : undefined
  const incoming = (settings.relationships ?? []).filter(
    (relation) => relation.to.kind === node.kind && relation.to.name === node.name,
  )
  const outgoing =
    node.kind === "application"
      ? (settings.relationships ?? []).filter((relation) => relation.from === node.name)
      : []
  return (
    <section
      aria-label={t("Service details")}
      className="flex w-full min-w-0 content-width-768 flex-col gap-4 [overflow-wrap:anywhere]"
    >
      <div>
        <h3 className="break-all text-base font-medium">{node.name}</h3>
        <p className="text-sm text-muted-foreground">
          {application?.description ?? dependency?.description}
        </p>
      </div>
      {application && <ServiceList services={application.services} />}
      {dependency && <ModeAssessments dependency={dependency} />}
      <div className="flex min-w-0 flex-col gap-6">
        <RelationshipList title={t("Used by")} relationships={incoming} />
        {node.kind === "application" && (
          <RelationshipList title={t("Uses")} relationships={outgoing} />
        )}
      </div>
    </section>
  )
}

function RelationshipList({
  title,
  relationships,
}: {
  title: string
  relationships: ServiceRelationship[]
}) {
  const { t } = useTranslation()
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h4 className="text-sm font-medium">{title}</h4>
      {relationships.length ? (
        <ul className="flex flex-col gap-3">
          {relationships.map((relation) => (
            <li
              key={`${relation.from}:${relation.to.kind}:${relation.to.name}`}
              className="flex flex-col gap-1 text-sm"
            >
              <p className="break-all">
                {relation.from} → {relation.to.name}{" "}
                <Badge variant="outline">
                  {t(relation.to.kind === "application" ? "Application service" : "Dependency")}
                </Badge>
              </p>
              <p>{relation.description}</p>
              <SourceList evidence={relation.evidence} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("No authored relationships.")}</p>
      )}
    </div>
  )
}

export function ModeAssessments({ dependency }: { dependency: DependencyDefinition }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Badge variant="outline" className="self-start">
        {t(dependencyModeLabel(dependency.kind))}
      </Badge>
      {!!dependency.services?.length && <ServiceList services={dependency.services} />}
    </div>
  )
}

function SourceList({ evidence }: { evidence: SourceEvidence[] }) {
  return (
    <ul className="text-xs text-muted-foreground">
      {evidence.map((source) => (
        <li key={`${source.path}:${source.line}`} className="break-all">
          <code>
            {source.path}
            {source.line === undefined ? "" : `:${source.line}`}
          </code>
        </li>
      ))}
    </ul>
  )
}

function ServiceList({ services }: { services: string[] }) {
  const { t } = useTranslation()
  return (
    <Collapsible>
      <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
        <ChevronDownIcon data-icon="inline-start" />
        {t("Compose services")}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="flex flex-col gap-1 p-2 text-sm">
          {services.map((service) => (
            <li key={service} className="break-all">
              <code>{service}</code>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
