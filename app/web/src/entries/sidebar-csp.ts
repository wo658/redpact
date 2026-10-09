import { z } from "zod"

// MCP App sandboxes prohibit dynamic code generation, including capability probes.
z.config({ jitless: true })
