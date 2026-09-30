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
import { cn } from "@/lib/utils"
import { DependencyDiagram } from "./dependency-diagram"
import { EmptyState } from "./feedback"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible"
import { Separator } from "./ui/separator"

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
      className="@container flex w-full min-w-0 content-width-768 flex-col gap-5 [overflow-wrap:anywhere]"
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">{node.name}</h3>
          <Badge variant="outline">
            {t(node.kind === "application" ? "Application service" : "Dependency")}
          </Badge>
          {dependency && <Badge variant="outline">{t(dependencyModeLabel(dependency.kind))}</Badge>}
        </div>
        {(application?.description ?? dependency?.description) && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {application?.description ?? dependency?.description}
          </p>
        )}
        {application && <ServiceList services={application.services} />}
        {!!dependency?.services?.length && <ServiceList services={dependency.services} />}
      </div>
      <Separator />
      <div
        className={cn(
          "grid min-w-0 grid-cols-1 gap-6",
          node.kind === "application" && "@min-[640px]:grid-cols-2",
        )}
      >
        <RelationshipList title={t("Used by")} relationships={incoming} direction="incoming" />
        {node.kind === "application" && (
          <RelationshipList title={t("Uses")} relationships={outgoing} direction="outgoing" />
        )}
      </div>
    </section>
  )
}

function RelationshipList({
  title,
  relationships,
  direction,
}: {
  title: string
  direction: "incoming" | "outgoing"
  relationships: ServiceRelationship[]
}) {
  const { t } = useTranslation()
  return (
    <section
      aria-label={`${title} · ${relationships.length}`}
      className="flex min-w-0 flex-col gap-3"
    >
      <h4 className="flex items-baseline gap-2 text-base font-semibold">
        {title}
        <span className="text-sm font-normal text-muted-foreground">{relationships.length}</span>
      </h4>
      {relationships.length ? (
        <ul className="flex min-w-0 flex-col gap-5">
          {relationships.map((relation) => (
            <li
              key={`${relation.from}:${relation.to.kind}:${relation.to.name}`}
              className="flex min-w-0 flex-col gap-2 text-sm leading-relaxed"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {direction === "incoming" ? relation.from : relation.to.name}
                </span>
                <Badge variant="outline">
                  {t(
                    direction === "incoming" || relation.to.kind === "application"
                      ? "Application service"
                      : "Dependency",
                  )}
                </Badge>
              </div>
              <p className="whitespace-pre-wrap text-muted-foreground">{relation.description}</p>
              <SourceList evidence={relation.evidence} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("No authored relationships.")}</p>
      )}
    </section>
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
  const { t } = useTranslation()
  if (!evidence.length) {
    return null
  }
  return (
    <Collapsible>
      <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
        <ChevronDownIcon data-icon="inline-start" />
        {t("Code evidence")} · {evidence.length}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="flex min-w-0 flex-col gap-2 py-2 text-sm text-muted-foreground">
          {evidence.map((source) => (
            <li key={`${source.path}:${source.line}`}>
              <code>
                {source.path}
                {source.line === undefined ? "" : `:${source.line}`}
              </code>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

function ServiceList({ services }: { services: string[] }) {
  const { t } = useTranslation()
  return (
    <Collapsible>
      <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
        <ChevronDownIcon data-icon="inline-start" />
        {t("Compose services")} · {services.length}
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
