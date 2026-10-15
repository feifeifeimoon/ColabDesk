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

/**
 * What to do about a destination name that is already taken.
 *
 * `replace` is the ordinary case — uploading the same file again means the copy
 * on the runtime is stale — but it is never chosen for the user: the question is
 * asked once per batch, and `skip` and `keepBoth` are the answers that do not
 * destroy anything.
 */
export type ConflictPolicy = "replace" | "skip" | "keepBoth";

/** One upload: this machine's paths landing in a runtime directory. */
export interface UploadRequest {
  session: string;
  localPaths: string[];
  remoteDir: string;
  conflict: ConflictPolicy;
}

/** Which of these paths already exist, asked before an upload starts. */
export interface RemotePathState {
  path: string;
  type: RemoteEntry["type"];
}

/** How a text file ends its lines, as a fact about the file — not a preference. */
export type EolStyle = "lf" | "crlf" | "mixed";

/**
 * A remote file read as text, in the shapes the preview can act on.
 *
 * `size` is bytes and `mtime` is milliseconds — the unit `RemoteEntry` already
 * uses. The SFTP protocol itself reports seconds, so anything that compares a
 * protocol mtime against one of these has to multiply first.
 */
export type RemoteTextRead =
  | { kind: "text"; text: string; eol: EolStyle; size: number; mtime: number; mode: number }
  | { kind: "invalidUtf8"; text: string; size: number; mtime: number; mode: number }
  /** Too large to send whole: the two ends, cut at line boundaries. */
  | {
      kind: "truncated";
      head: string;
      tail: string;
      /** Bytes between the two ends — what the preview is not showing. */
      omitted: number;
      size: number;
      mtime: number;
      mode: number;
    }
  | { kind: "binary"; size: number };

/**
 * One write of a file's text, and the baseline it was read at.
 *
 * `expected` is what the read returned. A save that finds different numbers on
 * the far side has a decision to make, and `force` is how the user's answer
 * travels — resolution belongs to the person, not to the app.
 */
export interface WriteTextRequest {
  session: string;
  path: string;
  text: string;
  /** How the file ended its lines when it was read; the buffer is LF. */
  eol: EolStyle;
  /** mtime (milliseconds) and size (bytes) as read; null when there was no file. */
  expected: { mtime: number; size: number } | null;
  /** Writes even when `expected` no longer matches — the user chose to. */
  force?: boolean;
}

/**
 * How a write ended. `ok: false` is a completed request carrying a question —
 * the file moved on (or disappeared) — not a failure.
 */
export type RemoteTextWrite =
  | { ok: true; size: number; mtime: number }
  | { ok: false; reason: "changed" | "missing" };

export interface TransferProgress {
  id: string;
  session: string;
  direction: "upload" | "download";
  name: string;
  /** A folder transfer says how many of its files are accounted for. */
  files?: { done: number; total: number };
  transferred: number;
  total: number;
  done: boolean;
  /** Items left alone: files the conflict policy skipped, and symbolic links. */
  skipped?: number;
  /** Stopped by the user. Not a failure: nothing is wrong with the transfer. */
  canceled?: boolean;
  error: string | null;
}

export interface AuthUrlEvent {
  url: string;
}

export interface AuthDoneEvent {
  /** The login process's exit code. What it printed is in the log. */
  code: number | null;
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
