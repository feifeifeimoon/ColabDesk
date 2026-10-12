/** Renderer-facing re-exports so pages import from one place. */
export type {
  AuthDoneEvent,
  AuthUrlEvent,
  CommandReport,
  EnvStatus,
  RemoteEntry,
  Session,
  SshSetup,
  SshState,
  SshStatus,
  TransferProgress,
  Usage,
  UsageReport,
} from "@shared/types";

/** Shape the login panel listens for (mirrors the main process event). */
export interface LoginDone {
  code: number | null;
  output: string;
}
