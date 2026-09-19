import { CheckIcon, ChevronDownIcon, CircleIcon, XIcon } from "lucide-react"
import { useId, useState } from "react"
import { SearchPicker } from "@/components/search-picker"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/coss-tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldGroup, FieldTitle } from "@/components/ui/field"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { dependencyModeLabel } from "@/lib/dependency-modes"
import { TestFileBrowser } from "../test-file-browser"
import { UnifiedDiff } from "../unified-diff"
import type { CardActions, Selection, Snapshot } from "./model"
import { keyedRows } from "./model"

function PolicyMenu({ data, actions }: { data: Snapshot; actions: CardActions }) {
  if (!data.token) {
    return null
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={actions.busy}
        aria-label="Approval policy for the next request"
        render={<Button variant="ghost" size="sm" />}
      >
        {data.policy === "ask" ? "Ask first" : "Auto"}
        <ChevronDownIcon data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>From the next task</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuRadioGroup
          value={data.nextPolicy ?? data.policy ?? "auto"}
          onValueChange={(value) => actions.changePolicy(value as "auto" | "ask")}
        >
          <DropdownMenuRadioItem value="auto" closeOnClick>
            Auto
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="ask" closeOnClick>
            Ask first
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
function Footer({
  data,
  actions,
  subject,
  selection,
}: {
  data: Snapshot
  actions: CardActions
  subject: "environment" | "tests"
  selection?: Selection
}) {
  const review = data.review
  const approved = subject === "environment" ? review?.environmentApproved : review?.testsApproved
  const pending = review?.policy === "ask" && review.state === "pending" && !approved
  let label = "Snapshot at tool response"
  if (pending) {
    label = "Waiting for approval"
  }
  if (approved) {
    label = "Approved selection"
  }
  if (data.nextPolicy && data.nextPolicy !== data.policy) {
    label += ` · Next task: ${data.nextPolicy === "auto" ? "Auto" : "Ask first"}`
  }
  return (
    <CardFooter className="flex-wrap justify-between gap-2">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <PolicyMenu data={data} actions={actions} />
        {pending && (
          <Button
            size="sm"
            disabled={actions.busy || (subject === "tests" && !review?.environmentApproved)}
            onClick={() => actions.approve(subject, selection)}
          >
            Approve {subject}
          </Button>
        )}
      </div>
    </CardFooter>
  )
}
function environmentStatus(data: Snapshot) {
  if (data.run?.environment) {
    return data.run.environment.state
  }
  if (data.review) {
    if (data.review.environmentApproved) {
      return "Approved"
    }
    return data.review.state === "pending" ? "Awaiting approval" : data.review.state
  }
  if (data.valid !== undefined) {
    return data.valid ? "Valid configuration" : "Invalid configuration"
  }
  return "Configuration"
}

export function EnvironmentCard({ data, actions }: { data: Snapshot; actions: CardActions }) {
  const id = useId()
  const review = data.review
  const initial = review?.selection ?? data.selection
  const [selection, setSelection] = useState(initial)
  const dependencies = review?.dependencies ?? data.dependencies ?? {}
  const editable =
    review?.policy === "ask" && review.state === "pending" && !review.environmentApproved
  return (
    <Card size="sm" aria-label="Environment" className="w-full min-w-0 content-width-768">
      <CardHeader>
        <CardTitle>Environment</CardTitle>
        <CardDescription className="break-all">
          {review?.path ?? data.path ?? "Project configuration"}
        </CardDescription>
        <CardAction>
          <Badge variant="outline">{environmentStatus(data)}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {selection && (
          <p className="break-words text-sm">
            Selected services: {selection.services.join(", ") || "None"}
          </p>
        )}
        <p className="text-sm font-medium">Dependencies</p>
        {!Object.keys(dependencies).length && (data.valid === true || review) && (
          <p className="text-sm text-muted-foreground">No dependencies declared.</p>
        )}
        <FieldGroup>
          {Object.entries(dependencies).map(([name, modes]) => (
            <Field key={name}>
              <FieldTitle className="min-w-0 [overflow-wrap:anywhere]">{name}</FieldTitle>
              <div className="flex min-w-0 flex-col gap-2">
                <p className="break-words text-sm text-muted-foreground">
                  Modes: {modes.map(dependencyModeLabel).join(", ")}
                </p>
                {editable && selection ? (
                  <SearchPicker
                    id={`${id}-${name}`}
                    label={`${name} mode`}
                    disabled={actions.busy}
                    value={selection.select[name] ?? ""}
                    options={modes.map((mode) => ({
                      value: mode,
                      label: dependencyModeLabel(mode),
                    }))}
                    onValueChange={(mode) =>
                      setSelection({ ...selection, select: { ...selection.select, [name]: mode } })
                    }
                  />
                ) : (
                  selection?.select[name] && (
                    <Badge variant="outline">
                      Selected: {dependencyModeLabel(selection.select[name])}
                    </Badge>
                  )
                )}
              </div>
            </Field>
          ))}
        </FieldGroup>
        {keyedRows(data.issues ?? [], (issue) => issue.message).map(({ value: issue, key }) => (
          <Alert key={key}>
            <AlertDescription>{issue.message}</AlertDescription>
          </Alert>
        ))}
        {!review && (
          <p className="text-sm text-muted-foreground">
            Configuration preview. Readiness has not been checked.
          </p>
        )}
        {review?.error && (
          <Alert>
            <AlertDescription>{review.error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <Footer data={data} actions={actions} subject="environment" selection={selection} />
    </Card>
  )
}
export function TestCard({ data, actions }: { data: Snapshot; actions: CardActions }) {
  const [path, setPath] = useState("")
  const files = data.submission?.files ?? []
  const file = files.find((file) => file.path === path) ?? files[0]
  const cases = data.run?.result?.cases?.filter((item) => !file || item.file === file.path)
  const declarations =
    data.submission?.parsed
      .filter((item) => !file || item.path === file.path)
      .flatMap((file) =>
        file.review.scenarios.map((scenario) => ({ ...scenario, file: file.path })),
      ) ?? []
  return (
    <Card size="sm" aria-label="Tests">
      <CardHeader>
        <CardTitle>Tests</CardTitle>
        <CardDescription>Captured test bundle</CardDescription>
        <CardAction>
          <Badge variant="outline">
            {data.run?.result?.outcome ?? data.run?.state ?? "Not run"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex h-[32rem] min-h-0 flex-col gap-3">
        <TestFileBrowser files={files} path={file?.path ?? ""} onSelect={setPath} label="Tests">
          <Tabs defaultValue="results" className="min-h-0 flex-1">
            <TabsList variant="underline">
              <TabsTrigger value="results">Execution results</TabsTrigger>
              <TabsTrigger value="source">View test source</TabsTrigger>
            </TabsList>
            <TabsContent value="results" className="flex h-0 min-h-0 flex-col gap-3 overflow-auto">
              <ItemGroup className="w-full min-w-0 content-width-768 divide-y divide-border [overflow-wrap:anywhere]">
                {keyedRows(cases ?? [], (result) => `${result.file}:${result.name}`).map(
                  ({ value: result, key }) => {
                    let Icon = CircleIcon
                    if (result.state === "passed") {
                      Icon = CheckIcon
                    }
                    if (result.state === "failed") {
                      Icon = XIcon
                    }
                    return (
                      <Item key={key} size="sm" className="items-start px-0">
                        <ItemMedia variant="icon">
                          <Icon aria-label={result.state} />
                        </ItemMedia>
                        <ItemContent>
                          <ItemTitle className="break-words">{result.name}</ItemTitle>
                          <ItemDescription className="line-clamp-none">
                            {result.file} · {result.state}
                          </ItemDescription>
                          {keyedRows(result.errors, (error) => error.message).map(
                            ({ value: error, key: errorKey }) => (
                              <p
                                key={errorKey}
                                className="break-words font-mono text-code text-destructive"
                              >
                                {error.message}
                              </p>
                            ),
                          )}
                        </ItemContent>
                      </Item>
                    )
                  },
                )}
                {!cases?.length &&
                  keyedRows(declarations, (scenario) => `${scenario.file}:${scenario.title}`).map(
                    ({ value: scenario, key }) => (
                      <Item key={key} size="sm" className="px-0">
                        <ItemContent>
                          <ItemTitle className="break-words">{scenario.title}</ItemTitle>
                          <ItemDescription className="line-clamp-none">
                            {scenario.intent ?? scenario.file} · No recorded result
                          </ItemDescription>
                          {keyedRows(scenario.assertions, (assertion) => assertion.code).map(
                            ({ value: assertion, key: assertionKey }) => (
                              <p
                                key={assertionKey}
                                className="break-words text-sm text-muted-foreground"
                              >
                                {assertion.reason ?? assertion.code}
                              </p>
                            ),
                          )}
                        </ItemContent>
                      </Item>
                    ),
                  )}
              </ItemGroup>
              {!cases?.length && !declarations.length && (
                <p className="text-sm text-muted-foreground">
                  No statically discoverable scenarios. Inspect the captured source.
                </p>
              )}
              {keyedRows(data.run?.result?.errors ?? [], (error) => error).map(
                ({ value: error, key }) => (
                  <Alert key={key}>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ),
              )}
            </TabsContent>
            <TabsContent value="source" className="flex h-0 min-h-0 flex-col overflow-auto">
              {file && <UnifiedDiff source={{ path: file.path, content: file.source }} />}
            </TabsContent>
          </Tabs>
        </TestFileBrowser>
      </CardContent>
      <Footer data={data} actions={actions} subject="tests" />
    </Card>
  )
}
