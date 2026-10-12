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
  Session,
  SshSetup,
  SshState,
  TransferProgress,
  UsageReport,
  UsageTrend,
} from "./types";

export interface SessionList {
  sessions: Session[];
  error: string | null;
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

export interface DirectoryRef {
  session: string;
  path: string;
}

export interface TransferTargets {
  session: string;
  localPaths: string[];
  remoteDir: string;
}

/** Every method is an `ipcRenderer.invoke`; every `on*` returns an unsubscribe. */
export interface ColabDeskApi {
  envStatus(): Promise<EnvStatus>;
  listSessions(): Promise<SessionList>;
  /**
   * Runtimes the server has that no local record mentions. `error` is set and
   * `sessions` empty when the answer could not be had — the rail then says so
   * instead of claiming there is nothing.
   */
  listUntracked(): Promise<SessionList>;
  usage(): Promise<UsageReport>;
  /** Compute-unit spend per day/week/month, from the readings this app recorded. */
  usageTrend(): Promise<UsageTrend>;

  createSession(options: CreateSessionOptions): Promise<CommandReport>;
  stopSession(name: string): Promise<CommandReport>;
  restartKernel(name: string): Promise<CommandReport>;
  syncSessions(): Promise<CommandReport>;

  startLogin(): Promise<void>;
  submitLoginCode(code: string): Promise<void>;
  cancelLogin(): Promise<void>;
  onAuthUrl(listener: (payload: AuthUrlEvent) => void): () => void;
  onAuthDone(listener: (payload: AuthDoneEvent) => void): () => void;

  sshSetup(name: string): Promise<SshSetup>;
  sshRemove(name: string): Promise<SshSetup>;
  sshOpenTerminal(name: string): Promise<string>;
  sshConnect(name: string): Promise<{ session: string; status: string }>;
  sshDisconnect(name: string): Promise<void>;
  onSshStatus(listener: (payload: SshState) => void): () => void;

  openTerminal(session: string, cols: number, rows: number): Promise<TerminalHandle>;
  writeTerminal(channelId: number, data: string): Promise<void>;
  resizeTerminal(channelId: number, cols: number, rows: number): Promise<void>;
  closeTerminal(channelId: number): Promise<void>;
  /**
   * Terminal output arrives base64-encoded (IPC is string-oriented), tagged
   * with its session: a pane subscribes before it knows its channel id, and the
   * shell's first bytes can arrive in that window.
   */
  onTerminalData(listener: (payload: { channelId: number; session: string; data: string }) => void): () => void;
  onTerminalClosed(listener: (payload: { channelId: number; session: string }) => void): () => void;

  listDirectory(session: string, path: string): Promise<RemoteEntry[]>;
  makeDirectory(session: string, path: string): Promise<void>;
  deletePath(session: string, path: string): Promise<void>;
  download(session: string, remote: string, name: string): Promise<{ canceled: boolean; path?: string }>;
  upload(targets: TransferTargets): Promise<void>;
  pickUploadTargets(session: string, remoteDir: string): Promise<string[]>;
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
}
