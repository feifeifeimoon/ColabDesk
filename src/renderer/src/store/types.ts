/**
 * The app state, sliced by domain.
 *
 * One store, one slice per domain — a second store is only worth it when the
 * coupling to this state is actively harmful, and then the reason goes in the
 * file that declares it. The slices are typed so `AppState` is their
 * intersection, which is what lets any action read the whole state through
 * `get()` while the type still says where each field came from.
 */

import type { CreateSessionOptions } from "@shared/api";
import type { EnvStatus, Session, SshState, UpdateStatus, UsageReport } from "@shared/types";
import type { PanelSide } from "../lib/panel-width";
import type { Theme, ThemePreference } from "../lib/theme";
import type { TerminalAppearance, TerminalThemeId } from "../lib/terminal-appearance";

/** A message about what just happened, in one sentence, gone by itself. */
export interface Toast {
  /** One per message, which is what lets the same sentence replace its own. */
  id: number;
  tone: "info" | "warn" | "danger";
  text: string;
}

export interface ToastsSlice {
  /** Newest last, and never more than a corner's worth of them. */
  toasts: Toast[];
  /** Says something now. Repeating the same sentence restarts it, not stacks it. */
  notify(toast: { tone: Toast["tone"]; text: string }): void;
  dismissToast(id: number): void;
}

/** One shell on a session's connection. A session can have several. */
export interface TerminalTab {
  kind: "shell";
  id: string;
  session: string;
  /** Its number among the session's shells: "终端 1", "终端 2", … */
  ordinal: number;
  /**
   * The name the user gave this shell, or `null` for "never renamed" — the strip
   * then shows the derived "终端 N". Two states instead of one because that
   * default is translated: storing it would freeze the label into whichever
   * language happened to be on screen.
   */
  customTitle: string | null;
}

/**
 * A file, open in the middle column beside the shells.
 *
 * It is a tab and not a dialog because it is read *against* the terminal: a
 * training log gets opened while a shell is running, and a modal would stand
 * between the two. Like a shell it needs the session's connection — it is SFTP
 * over that same session — so a file tab holds the connection open the way a
 * shell does.
 */
export interface FileTab {
  kind: "file";
  /** One tab per file: opening the same one again focuses it, never duplicates it. */
  id: string;
  session: string;
  path: string;
  name: string;
}

export type WorkspaceTab = TerminalTab | FileTab;

export interface WorkspaceSlice {
  tabs: WorkspaceTab[];
  /** The rail's selection: whose shells the tab strip shows. */
  selectedSession: string | null;
  activeTabId: string | null;
  connections: Record<string, SshState>;
  /**
   * The file tree's shape, per session: which directories are open. It lives
   * here rather than in the pane because a pane that is only hidden has to come
   * back the way it was left, and it is dropped with the connection — the
   * listings it describes go with it.
   */
  expandedDirs: Record<string, string[]>;
  transferCounts: Record<string, number>;
  /** File tabs with unsaved edits, by tab id: the strip asks before closing one. */
  dirtyTabs: Record<string, boolean>;
  /** A close waiting on an answer about unsaved edits — the pane that owns it asks. */
  pendingCloseTabId: string | null;
  /**
   * Where a save last landed, per session: the tree re-reads that one directory
   * instead of guessing which listing went stale.
   */
  fileWrites: Record<string, { dir: string; revision: number }>;

  /** Goes to a session, opening its first shell if it has none, and focuses it. */
  openSession(session: string): void;
  /** One more shell on the same connection — the reason tabs exist. */
  openTab(session: string): void;
  /**
   * Names a shell. `null`, or nothing but whitespace, goes back to the derived
   * "终端 N". File tabs are not renameable: their name is the file's.
   */
  renameTab(tabId: string, customTitle: string | null): void;
  /** Opens a file beside the shells; one that is already open is focused. */
  openFileTab(session: string, path: string, name: string): void;
  closeTab(tabId: string): void;
  /**
   * What the strip's `×` and `Ctrl+Shift+W` do: close the tab, or — when it has
   * unsaved edits — bring it forward and let its pane ask what to do.
   */
  requestCloseTab(tabId: string): void;
  /** The pane's "never mind" to that question. */
  cancelPendingClose(): void;
  /** Says whether a file tab has edits that are not on the runtime yet. */
  setTabDirty(tabId: string, dirty: boolean): void;
  /** A save landed in this directory; the tree re-reads it. */
  noteFileWrite(session: string, dir: string): void;
  /** Brings one tab of the selected session to the front. */
  focusTab(tabId: string): void;
  /** Closes every tab of a session, which is what releases its connection. */
  closeSessionTabs(session: string): void;
  /** Focuses the nth tab of the selected session, for the number keys. */
  focusTabAt(index: number): void;
  setConnection(state: SshState): void;
  /** Opens a directory that was closed, closes one that was open. */
  toggleDirectory(session: string, path: string): void;
  /** Closes every open folder of one session, keeping the listings cached. */
  collapseAllDirectories(session: string): void;
  /** Drops a directory and everything under it, for a folder that is gone. */
  forgetDirectory(session: string, path: string): void;
  setTransferCount(session: string, active: number): void;
  /** Drops tabs whose session no longer exists server-side. */
  pruneTabs(): void;
}

export type SessionAction =
  | "open"
  | "new-terminal"
  | "close-all"
  | "restart-kernel"
  | "ssh-config"
  | "copy-ssh"
  | "stop";

export interface SessionsSlice {
  sessions: Session[];
  sessionsLoading: boolean;
  sessionsSyncing: boolean;
  /**
   * The other half of the rail: runtimes the server has that no local record
   * mentions. They are not sessions the app can act on, so they are held apart
   * rather than folded into `sessions`.
   */
  untrackedSessions: Session[];
  /** Set when that read failed — the rail may be missing runtimes, and says so. */
  untrackedError: string | null;
  /**
   * Every endpoint the server still has allocated, from the same read. A row
   * whose endpoint is in here is still costing compute units; one that is
   * absent is a record pointing at nothing.
   *
   * `null` means the read did not answer, and a row must then say nothing at
   * all: "gone" is a claim about somebody's machine, and a network blip must
   * not be able to make it.
   */
  runtimeEndpoints: string[] | null;
  /** `${session}:${action}` while a row action is in flight. */
  busyAction: string | null;

  loadSessions(): Promise<void>;
  loadUntracked(): Promise<void>;
  /** Reconciles against the server, then reloads the list and the environment. */
  syncSessions(): Promise<void>;
  runSessionAction(name: string, action: SessionAction): Promise<void>;
  /** After a create: refresh, then open whatever the CLI produced. */
  sessionCreated(name: string | null): Promise<void>;
}

export interface EnvironmentSlice {
  env: EnvStatus | null;
  usage: UsageReport | null;
  /**
   * A reading is on its way and there is nothing to show yet — the state the
   * status bar draws a skeleton for. Distinct from `usage.balance === null`,
   * which means "read, and the answer has no number".
   */
  usagePending: boolean;
  /**
   * The address that was signed in before the current one — set when a refresh
   * sees a different account, cleared once the list has been reconciled.
   * The session records have no owner, so this is how the rail can say whose
   * they are.
   */
  previousAccount: string | null;
  /** The banner: the CLI or the runtime failed to answer. */
  error: string | null;

  loadUsage(): Promise<void>;
  clearPreviousAccount(): void;
  /** True while the OAuth flow is waiting for a pasted code. */
  loginRunning: boolean;
  setLoginRunning(running: boolean): void;
  /**
   * Environment and quota are always read together; they answer as a pair.
   * Resolves to the fresh `authenticated` flag, which the login flow reports on.
   */
  refreshEnvironment(): Promise<boolean>;
  /** Re-reads the on-disk SSH identity without asking the network. */
  refreshSshIdentity(): Promise<void>;
  setError(error: string | null): void;
}

export interface PreferencesSlice {
  theme: ThemePreference;
  resolvedTheme: Theme;
  language: import("@shared/ui-language").UiLanguage;
  /** How the terminal looks — colours, type, cursor, ring, buffer. One record. */
  terminal: TerminalAppearance;
  /**
   * Which palette is switched on, after the slots and the app's polarity are
   * resolved. Its own field because the terminal's record does not change when
   * the app flips: panes subscribe to this to know the palette moved.
   */
  terminalThemeId: TerminalThemeId;
  sidebarOpen: boolean;
  filesOpen: boolean;
  /** How wide each rail is, in pixels; the terminal takes what is left. */
  panelWidths: Record<PanelSide, number>;
  /** Whether a file row shows its size; off by default, the name is the point. */
  showFileSizes: boolean;

  setTheme(preference: ThemePreference): void;
  toggleTheme(): void;
  /** Re-resolves `system` against the OS, which can flip while the app is open. */
  applySystemTheme(): void;
  setLanguage(language: import("@shared/ui-language").UiLanguage): void;
  /** Merged into the record and clamped there, so every caller gets the limits. */
  setTerminalAppearance(patch: Partial<TerminalAppearance>): void;
  toggleSidebar(): void;
  toggleFiles(): void;
  /** Clamped here, so every caller gets the same limits. */
  setPanelWidth(side: PanelSide, width: number): void;
  setShowFileSizes(show: boolean): void;
}

/** Which section of the settings rail is showing. State, so it lives here. */
export type SectionId =
  | "appearance"
  | "terminal"
  | "shortcuts"
  | "external"
  | "account"
  | "usage"
  | "about";

export interface SurfacesSlice {
  settingsOpen: boolean;
  /** Survives closing and reopening, so settings comes back where you left it. */
  settingsSection: SectionId;

  /** `section` is how a caller elsewhere in the app deep-links into settings. */
  openSettings(section?: SectionId): void;
  closeSettings(): void;
  toggleSettings(): void;
  setSettingsSection(section: SectionId): void;
}

/** What `colab new` is asked for — the same shape the IPC call takes. */
export type CreationRequest = CreateSessionOptions;

/**
 * `setup` is the form, `provisioning` is a request in flight, `failed` keeps
 * the log and the reason so they can still be read when the surface reopens.
 */
export type CreationPhase = "setup" | "provisioning" | "failed";

/**
 * The runtime-setup surface's state. It lives here rather than in the component
 * because the surface is a *view*: leaving it (a tab, Escape) must not abandon
 * a request that is already running, and a failure must still be somewhere when
 * the person comes back.
 */
export interface CreationState {
  open: boolean;
  phase: CreationPhase;
  /** The request that was sent, or the one a failed attempt was made with. */
  request: CreationRequest | null;
  /** Epoch ms the request went out; the surface counts the wait from here. */
  startedAt: number | null;
  /** The CLI's own lines, in the order it printed them. */
  lines: string[];
  error: string | null;
}

export interface CreationSlice {
  creation: CreationState;
  openNewSession(): void;
  closeNewSession(): void;
  startCreation(request: CreationRequest): Promise<void>;
  appendCreationLine(line: string): void;
}

export interface UpdateSlice {
  /** What the main process last reported; the only source of truth. */
  update: UpdateStatus;
  /** A version the user waved away, so the prompt does not return for it. */
  dismissedVersion: string | null;

  setUpdateStatus(status: UpdateStatus): void;
  dismissUpdate(version: string): void;
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
}

export type AppState = WorkspaceSlice &
  SessionsSlice &
  EnvironmentSlice &
  PreferencesSlice &
  SurfacesSlice &
  CreationSlice &
  ToastsSlice &
  UpdateSlice;
