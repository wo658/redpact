import { test } from "vitest"

// Fail during module collection without keeping syntactically invalid code in the repository.
test("checkout cannot start without its fixture", () => {})

throw new Error("Intentional fixture initialization failure")
