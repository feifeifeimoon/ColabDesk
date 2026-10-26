/**
 * The API contract between the renderer and the main process. Preload
 * implements it; the renderer consumes it. Keeping it in `shared` means neither
 * side imports the other's internals.
 */

import type {
  AuthDoneEvent,
  AuthUrlEvent,
  CommandReport,
  EnvStatus,
  RemoteEntry,
  RemotePathState,
  RemoteTextRead,
  RemoteTextWrite,
  Session,
  SshSetup,
  SshState,
  TransferProgress,
  UpdateStatus,
  UploadRequest,
  UsageReport,
  UsageTrend,
  WriteTextRequest,
} from "./types";

export interface SessionList {
  sessions: Session[];
  error: string | null;
}

/**
 * The server's half of the rail. It answers a second question the local file
 * cannot — which runtimes are still allocated, and therefore still being
 * billed — so it carries the endpoint list on top of the rows:
 *
 * - `live_endpoints` is every runtime the account has right now, by endpoint.
 *   A local session whose endpoint is in it is still there; one whose endpoint
 *   is absent has been reclaimed, and its record is a credential for nothing.
 * - `null` is the third answer, and the reason this is not just an array: "the
 *   list could not be read" is not "the runtime is gone", and a row that
 *   conflated them would call every network blip a dead session.
 */
export interface RuntimeList extends SessionList {
  live_endpoints: string[] | null;
}

export interface TerminalHandle {
  channelId: number;
  session: string;
}

export interface CreateSessionOptions {
  gpu: string | null;
  tpu: string | null;
  name: string | null;
  highMem: boolean;
}

/** Every method is an `ipcRenderer.invoke`; every `on*` returns an unsubscribe. */
export interface ColabDeskApi {
  envStatus(): Promise<EnvStatus>;
  listSessions(): Promise<SessionList>;
  /**
   * Runtimes the server has that no local record mentions, plus the server's
   * own list of what is still allocated. `error` is set and `sessions` empty
   * when the answer could not be had — the rail then says so instead of
   * claiming there is nothing.
   */
  listUntracked(): Promise<RuntimeList>;
  usage(): Promise<UsageReport>;
  /** Compute-unit spend per day/week/month, from the readings this app recorded. */
  usageTrend(): Promise<UsageTrend>;

  createSession(options: CreateSessionOptions): Promise<CommandReport>;
  /** The CLI's own lines while that create runs (see ). */
  onSessionCreateOutput(listener: (payload: { line: string }) => void): () => void;
  stopSession(name: string): Promise<CommandReport>;
  restartKernel(name: string): Promise<CommandReport>;
  syncSessions(): Promise<CommandReport>;

  startLogin(): Promise<void>;
  submitLoginCode(code: string): Promise<void>;
  cancelLogin(): Promise<void>;
  logout(): Promise<void>;
  onAuthUrl(listener: (payload: AuthUrlEvent) => void): () => void;
  onAuthDone(listener: (payload: AuthDoneEvent) => void): () => void;

  sshSetup(name: string): Promise<SshSetup>;
  sshRemove(name: string): Promise<SshSetup>;
  /** The usable identity's private-key path, read locally (no network). */
  sshIdentity(): Promise<string | null>;
  sshGenerateKey(): Promise<string>;
  sshDisconnect(name: string): Promise<void>;
  onSshStatus(listener: (payload: SshState) => void): () => void;

  openTerminal(session: string, cols: number, rows: number): Promise<TerminalHandle>;
  writeTerminal(channelId: number, data: string): Promise<void>;
  resizeTerminal(channelId: number, cols: number, rows: number): Promise<void>;
  closeTerminal(channelId: number): Promise<void>;
  /**
   * Terminal output arrives as bytes, tagged with its session: a pane subscribes
   * before it knows its channel id, and the shell's first bytes can arrive in
   * that window. Bytes rather than base64 because this is the hot path.
   */
  onTerminalData(
    listener: (payload: { channelId: number; session: string; data: Uint8Array }) => void,
  ): () => void;
  onTerminalClosed(listener: (payload: { channelId: number; session: string }) => void): () => void;
  /**
   * Tells the main process how much of a terminal's output has been parsed, so
   * it can let the shell send more. Fire-and-forget on purpose: it travels with
   * every screenful.
   */
  ackTerminal(channelId: number, bytes: number): void;

  listDirectory(session: string, path: string): Promise<RemoteEntry[]>;
  /** Which of these remote paths already exist, so a conflict can be asked about. */
  statPaths(session: string, paths: string[]): Promise<RemotePathState[]>;
  /**
   * What a path is once symbolic links are followed. `null` means the target is
   * gone; a link is answered as the file or directory it points at, which is
   * what lets the tree open a linked file instead of calling readdir on it.
   */
  followPath(session: string, path: string): Promise<RemotePathState | null>;
  /**
   * A remote file as text, for the preview: the whole file when it is small
   * enough to be worth reading, its two ends when it is not, and a verdict
   * (`binary` / `invalidUtf8`) when it is not text at all.
   */
  readTextFile(session: string, path: string): Promise<RemoteTextRead>;
  /**
   * Writes a file's text back through a staging file beside it.
   *
   * Resolves with `{ ok: false }` when the file changed underneath: that is a
   * completed request carrying a question, not a failure.
   */
  writeTextFile(request: WriteTextRequest): Promise<RemoteTextWrite>;
  makeDirectory(session: string, path: string): Promise<void>;
  deletePath(session: string, path: string): Promise<void>;
  /**
   * Transfers. `title` is the native dialog's own caption, written by the
   * renderer: it is UI copy, and the main process has no catalog.
   *
   * A transfer that starts and then fails reports itself on its own row rather
   * than by rejecting; a rejection here means it never got that far.
   */
  download(
    session: string,
    remote: string,
    name: string,
    title: string,
  ): Promise<{ canceled: boolean; path?: string }>;
  downloadFolder(
    session: string,
    remote: string,
    name: string,
    title: string,
  ): Promise<{ canceled: boolean; path?: string }>;
  upload(targets: UploadRequest): Promise<void>;
  /** Stops a transfer by row id; its row reports the cancellation. */
  cancelTransfer(id: string): Promise<void>;
  pickUploadTargets(title: string): Promise<string[]>;
  pickUploadFolder(title: string): Promise<string[]>;
  onTransferProgress(listener: (payload: TransferProgress) => void): () => void;

  /** Drag-and-drop paths: modern Electron no longer exposes `File.path`. */
  pathForFile(file: File): string;

  /** Clipboard through Electron, so the terminal never hits a web permission prompt. */
  readClipboard(): Promise<string>;
  writeClipboard(text: string): Promise<void>;

  /**
   * Window controls. The window draws its own title bar (frameless on Windows
   * and Linux, inset traffic lights on macOS), so minimize/maximize/close are
   * ours to render — and to service.
   */
  minimizeWindow(): Promise<void>;
  toggleMaximizeWindow(): Promise<void>;
  closeWindow(): Promise<void>;
  onWindowMaximized(listener: (maximized: boolean) => void): () => void;
  zoomFactor(): number;
  /** The Chromium page-zoom level; 0 is 100%. The Appearance stepper writes it. */
  zoomLevel(): number;
  setZoomLevel(level: number): void;
  syncTrafficLights(zoomFactor: number): void;

  /**
   * The updater's current state. Read once on mount — a panel that only listened
   * would sit blank until the next transition, and the next one may be a day off.
   */
  updateStatus(): Promise<UpdateStatus>;
  /** A check the user asked for, which is what makes a failure worth reporting. */
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  /** Restarts into the downloaded build. Does not resolve on success. */
  installUpdate(): Promise<void>;
  onUpdateStatus(listener: (status: UpdateStatus) => void): () => void;

  /**
   * Where the app's log is. One file with everything the app did — the answer to
   * "what happened here" that does not depend on the user describing it.
   */
  logPath(): Promise<string>;
  /** Shows the log in the OS file manager, creating it first if need be. */
  revealLog(): Promise<void>;
}
