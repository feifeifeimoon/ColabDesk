/** Types shared between the main process, the preload bridge and the renderer. */

export interface Session {
  name: string;
  /**
   * True when the server has this runtime but the local store has no record of
   * it: `colab` can neither name nor stop it, so its `name` is the endpoint —
   * the only identity it has.
   */
  untracked: boolean;
  url: string;
  endpoint: string;
  variant: string;
  accelerator: string;
  machine_shape: string;
  kernel_id: string | null;
  session_id: string | null;
  token_expires_at: string | null;
  running: string | null;
  last_execution: [string, string | null, string] | null;
}

/** Who is signed in. Read from Google's tokeninfo endpoint — see `colab/account.ts`. */
export interface AccountInfo {
  email: string;
  /** Google's stable account id; the email is a display name that can change. */
  subject: string | null;
}

/**
 * Which accelerators the signed-in account may allocate, straight from the
 * session backend's `ccu-info`. `ineligible` is worth as much as `eligible`:
 * it is what turns "the request failed" into "this account cannot get H100".
 */
export interface AcceleratorEligibility {
  gpus: string[];
  ineligible_gpus: string[];
  tpus: string[];
  ineligible_tpus: string[];
  fetched_at: string;
}

export interface EnvStatus {
  cli_path: string | null;
  cli_source: "bundled" | "override" | "path" | "local-bin" | null;
  cli_version: string | null;
  config_dir: string | null;
  sessions_file_exists: boolean;
  authenticated: boolean;
  account: AccountInfo | null;
  /** Null until it has ever been read; not an error — `colab` may be unreachable. */
  accelerator_eligibility: AcceleratorEligibility | null;
  token_expiry: string | null;
  has_refresh_token: boolean;
  hint: string | null;
}

export interface CommandReport {
  ok: boolean;
  code: number | null;
  timed_out: boolean;
  output: string;
  error: string | null;
  attempts: number;
}

export interface Usage {
  balance: number | null;
  rate: number | null;
  assignments: number | null;
}

export interface UsageReport {
  ok: boolean;
  needs_login: boolean;
  usage: Usage;
  raw: string;
  error: string | null;
  attempts: number;
}

export type UsageGranularity = "day" | "week" | "month";

export interface UsageBucket {
  /** Local-date key: `2026-10-09` for a day or a Monday, `2026-10` for a month. */
  key: string;
  /** Compute units spent inside the bucket. */
  units: number;
  /** Readings inside the bucket. `0` means "not measured", not "nothing spent". */
  samples: number;
}

export interface UsageTrend {
  buckets: Record<UsageGranularity, UsageBucket[]>;
  /** Units spent across every reading ever recorded. */
  total: number;
  first_sample: string | null;
  last_sample: string | null;
}

export interface SshSetup {
  alias: string;
  config_path: string;
  block: string;
  ssh_command: string;
  replaced: boolean;
}

export type SshStatus = "idle" | "connecting" | "ready" | "closed" | "error";

/** What a terminal pane can report — `idle` is the status bar's "no tab open". */
export type ConnectionState = Exclude<SshStatus, "idle">;

export interface SshState {
  session: string;
  status: SshStatus;
  error: string | null;
}

export interface RemoteEntry {
  name: string;
  type: "file" | "dir" | "link";
  size: number;
  mtime: number;
  mode: number;
}

export interface TransferProgress {
  id: string;
  session: string;
  direction: "upload" | "download";
  name: string;
  transferred: number;
  total: number;
  done: boolean;
  error: string | null;
}

export interface AuthUrlEvent {
  url: string;
}

export interface AuthDoneEvent {
  code: number | null;
  output: string;
}
