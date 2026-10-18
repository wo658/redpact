import { problem } from "../core/problems.js"
import type { Store } from "../core/types/contracts.js"
import type { WorkStartQueries } from "../core/types/services.js"

export function createWorkStartQueries(store: Pick<Store, "getWorkStart">): WorkStartQueries {
  return {
    get: (id) => store.getWorkStart(id) ?? problem("not_found", "Work start record not found"),
  }
}
