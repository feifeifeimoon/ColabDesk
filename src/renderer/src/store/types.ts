/**
 * The app state, sliced by domain.
 *
 * One store, one slice per domain — a second store is only worth it when the
 * coupling to this state is actively harmful, and then the reason goes in the
 * file that declares it. The slices are typed so `AppState` is their
 * intersection, which is what lets any action read the whole state through
 * `get()` while the type still says where each field came from.
 */

import type { EnvStatus, Session, SshState, UsageReport } from "@shared/types";
import type { PanelSide } from "../lib/panel-width";
import type { Theme, ThemePreference } from "../lib/theme";
import type { TerminalAppearance } from "../lib/terminal-appearance";

/** A transient result of a row action, shown under the title bar. */
export interface Notice {
  tone: "info" | "warn" | "danger";
  text: string;
}

/** One shell on a session's connection. A session can have several. */
export interface TerminalTab {
  id: string;
  session: string;
  /** Its number among the session's shells: "终端 1", "终端 2", … */
  ordinal: number;
}

export interface WorkspaceSlice {
  tabs: TerminalTab[];
  /** The rail's selection: whose shells the tab strip shows. */
  selectedSession: string | null;
  activeTabId: string | null;
  connections: Record<string, SshState>;
  /** Per session, because one runtime has one filesystem and one file browser. */
  remotePaths: Record<string, string>;
  transferCounts: Record<string, number>;

  /** Goes to a session, opening its first shell if it has none, and focuses it. */
  openSession(session: string): void;
  /** One more shell on the same connection — the reason tabs exist. */
  openTab(session: string): void;
  closeTab(tabId: string): void;
  /** Brings one shell of the selected session to the front. */
  focusTab(tabId: string): void;
  /** Closes every shell of a session, which is what releases its connection. */
  closeSessionTabs(session: string): void;
  /** Focuses the nth shell of the selected session, for the number keys. */
  focusTabAt(index: number): void;
  setConnection(state: SshState): void;
  setRemotePath(session: string, path: string): void;
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
  /** `${session}:${action}` while a row action is in flight. */
  busyAction: string | null;
  notice: Notice | null;

  loadSessions(): Promise<void>;
  /** Reconciles against the server, then reloads the list and the environment. */
  syncSessions(): Promise<void>;
  runSessionAction(name: string, action: SessionAction): Promise<void>;
  /** After a create: refresh, then open whatever the CLI produced. */
  sessionCreated(name: string | null): Promise<void>;
  setNotice(notice: Notice | null): void;
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

export interface SurfacesSlice {
  settingsOpen: boolean;
  newSessionOpen: boolean;

  openSettings(): void;
  closeSettings(): void;
  toggleSettings(): void;
  openNewSession(): void;
  closeNewSession(): void;
}

export type AppState = WorkspaceSlice & SessionsSlice & EnvironmentSlice & PreferencesSlice & SurfacesSlice;
