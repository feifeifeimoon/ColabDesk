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

/**
 * What the Colab CLI environment looks like. This is the whole of what the
 * domain service can answer — nothing about the Electron app itself, which the
 * IPC layer adds on its way to the renderer.
 */
export interface ColabEnvironment {
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

/** The environment as the renderer sees it, plus what only Electron knows. */
export interface EnvStatus extends ColabEnvironment {
  /** The Electron app's own version, from package.json. Not the CLI's. */
  app_version: string;
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

/**
 * Why an update attempt failed, as a category the renderer can put into words.
 * It lives here rather than beside the classifier because the contract is the
 * lowest layer — `main/` may import from `shared/`, never the other way round.
 */
export type UpdateFailureReason = "network" | "missing-release" | "unavailable" | "unknown";

/**
 * What the updater is doing, as one discriminant rather than a set of booleans
 * that can contradict each other. The main process owns every transition and
 * pushes the whole value; the renderer never infers a state from partial
 * signals.
 */
export type UpdateStatus =
  /**
   * This build cannot update itself — a development checkout, or macOS before
   * signing exists. Distinct from `idle` on purpose: a panel that treated it as
   * "nothing to report yet" would offer a check button that does nothing.
   */
  | { state: "unavailable" }
  | { state: "idle" }
  | { state: "checking"; userInitiated: boolean }
  | { state: "available"; version: string }
  | { state: "not-available"; userInitiated: boolean }
  | { state: "downloading"; version: string; percent: number }
  | { state: "downloaded"; version: string }
  /**
   * Failures cross the boundary as a category plus the raw text, never as
   * finished prose: the main process has no interface language, and
   * electron-updater's own strings are transport-level noise. `version` is the
   * one this failed on, if any — without it a failed download could not offer
   * a retry and the user would wait a day for the next scheduled check.
   */
  | {
      state: "error";
      reason: UpdateFailureReason;
      detail: string;
      userInitiated: boolean;
      version: string | null;
    };
