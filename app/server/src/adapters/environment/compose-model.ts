export type {
  Build,
  ComposeModel,
  ComposePort,
  ComposeService,
  EffectiveCompose,
} from "../../core/types/compose.js"
export type DockerInspection = {
  Image?: string
  Config: { Labels: Record<string, string> }
  Labels?: Record<string, string>
  State: { Status: string; ExitCode: number; Running: boolean; Health?: { Status: string } }
  NetworkSettings: { Ports: Record<string, { HostPort: string }[] | null> }
  Mounts?: { Type: string; Name?: string }[]
}
