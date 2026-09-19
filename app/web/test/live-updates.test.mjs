import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"

test("live updates do not render connection failures in the content flow", async () => {
  const source = await readFile(
    new URL("../src/components/live-updates.tsx", import.meta.url),
    "utf8",
  )
  assert.doesNotMatch(source, /<Notice\b/)
})

test("Toast text has room for one line and wraps at word boundaries on narrow screens", async () => {
  const source = await readFile(new URL("../src/components/ui/toast.tsx", import.meta.url), "utf8")
  assert.match(source, /w-auto max-w-lg/)
  for (const slot of ["toast-title", "toast-description"]) {
    const classes = source.match(
      new RegExp(`data-slot="${slot}"\\s+className=\\{cn\\("([^"]+)"`),
    )?.[1]
    assert.ok(classes?.includes("break-keep"), `${slot} must keep Korean words together`)
    assert.ok(classes.includes("text-pretty"), `${slot} must avoid a short final line`)
    assert.ok(classes.includes("wrap-anywhere"), `${slot} must contain long unbroken diagnostics`)
  }
})
