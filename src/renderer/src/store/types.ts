/**
 * The app state, sliced by domain.
 *
 * One store, one slice per domain — a second store is only worth it when the
 * coupling to this state is actively harmful, and then the reason goes in the
 * file that declares it. The slices are typed so `AppState` is their
 * intersection, which is what lets any action read the whole state through
 * `get()` while the type still says where each field came from.
 */

import type { EnvStatus, Session, SshState, UpdateStatus, UsageReport } from "@shared/types";
import type { PanelSide } from "../lib/panel-width";
import type { Theme, ThemePreference } from "../lib/theme";
import type { TerminalAppearance } from "../lib/terminal-appearance";

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

  /** Goes to a session, opening its first shell if it has none, and focuses it. */
  openSession(session: string): void;
  /** One more shell on the same connection — the reason tabs exist. */
  openTab(session: string): void;
  /** Opens a file beside the shells; one that is already open is focused. */
  openFileTab(session: string, path: string, name: string): void;
  closeTab(tabId: string): void;
  /** Brings one tab of the selected session to the front. */
  focusTab(tabId: string): void;
  /** Closes every tab of a session, which is what releases its connection. */
  closeSessionTabs(session: string): void;
  /** Focuses the nth tab of the selected session, for the number keys. */
  focusTabAt(index: number): void;
  setConnection(state: SshState): void;
  /** Opens a directory that was closed, closes one that was open. */
  toggleDirectory(session: string, path: string): void;
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
  /** The banner: the CLI or the runtime failed to answer. */
  error: string | null;

  loadUsage(): Promise<void>;
  /**
   * Environment and quota are always read together; they answer as a pair.
   * Resolves to the fresh `authenticated` flag, which the login flow reports on.
   */
  refreshEnvironment(): Promise<boolean>;
  setError(error: string | null): void;
}

export interface PreferencesSlice {
  theme: ThemePreference;
  resolvedTheme: Theme;
  language: import("@shared/ui-language").UiLanguage;
  /** How the terminal looks — colours, type, cursor, ring, buffer. One record. */
  terminal: TerminalAppearance;
  sidebarOpen: boolean;
  filesOpen: boolean;
  /** How wide each rail is, in pixels; the terminal takes what is left. */
  panelWidths: Record<PanelSide, number>;

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
}

/** Which section of the settings rail is showing. State, so it lives here. */
export type SectionId =
  | "account"
  | "usage"
  | "appearance"
  | "terminal"
  | "runtime"
  | "external"
  | "about";

export interface SurfacesSlice {
  settingsOpen: boolean;
  /** Survives closing and reopening, so settings comes back where you left it. */
  settingsSection: SectionId;
  newSessionOpen: boolean;

  /** `section` is how a caller elsewhere in the app deep-links into settings. */
  openSettings(section?: SectionId): void;
  closeSettings(): void;
  toggleSettings(): void;
  setSettingsSection(section: SectionId): void;
  openNewSession(): void;
  closeNewSession(): void;
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
  ToastsSlice &
  UpdateSlice;
