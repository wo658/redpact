import type { z } from "zod"
import type { startWorkInput } from "../start-work-schema.js"
export type StartWorkInput = z.infer<typeof startWorkInput>
export type WorkStart = {
  id: string
  input: StartWorkInput
  checkoutRoot: string
  revision: string
  worktreeId: string
  workItemId: string
  createdAt: string
  state: "prepared" | "attempted" | "created" | "completed"
}
