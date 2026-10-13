/**
 * The renderer's access to the main process.
 *
 * Every function is a one-line pass-through to the preload bridge, so the
 * contract lives in one place (`@shared/api`) and callers never touch
 * `window.colabdesk` directly.
 */

import type { ColabDeskApi, CreateSessionOptions, TransferTargets } from "@shared/api";

const bridge = (): ColabDeskApi => window.colabdesk;

export const envStatus = () => bridge().envStatus();
export const listSessions = () => bridge().listSessions();
export const listUntracked = () => bridge().listUntracked();
export const usage = () => bridge().usage();
export const usageTrend = () => bridge().usageTrend();

export const createSession = (options: CreateSessionOptions) => bridge().createSession(options);
export const stopSession = (name: string) => bridge().stopSession(name);
export const restartKernel = (name: string) => bridge().restartKernel(name);
export const syncSessions = () => bridge().syncSessions();

export const startLogin = () => bridge().startLogin();
export const submitLoginCode = (code: string) => bridge().submitLoginCode(code);
export const cancelLogin = () => bridge().cancelLogin();
export const logout = () => bridge().logout();
export const onAuthUrl = (listener: Parameters<ColabDeskApi["onAuthUrl"]>[0]) => bridge().onAuthUrl(listener);
export const onAuthDone = (listener: Parameters<ColabDeskApi["onAuthDone"]>[0]) => bridge().onAuthDone(listener);

export const sshSetup = (name: string) => bridge().sshSetup(name);
export const sshRemove = (name: string) => bridge().sshRemove(name);
export const sshOpenTerminal = (name: string) => bridge().sshOpenTerminal(name);
export const sshConnect = (name: string) => bridge().sshConnect(name);
export const sshDisconnect = (name: string) => bridge().sshDisconnect(name);
export const onSshStatus = (listener: Parameters<ColabDeskApi["onSshStatus"]>[0]) => bridge().onSshStatus(listener);

export const openTerminal = (session: string, cols: number, rows: number) =>
  bridge().openTerminal(session, cols, rows);
export const writeTerminal = (channelId: number, data: string) => bridge().writeTerminal(channelId, data);
export const resizeTerminal = (channelId: number, cols: number, rows: number) =>
  bridge().resizeTerminal(channelId, cols, rows);
export const closeTerminal = (channelId: number) => bridge().closeTerminal(channelId);
export const onTerminalData = (listener: Parameters<ColabDeskApi["onTerminalData"]>[0]) =>
  bridge().onTerminalData(listener);
export const onTerminalClosed = (listener: Parameters<ColabDeskApi["onTerminalClosed"]>[0]) =>
  bridge().onTerminalClosed(listener);

export const listDirectory = (session: string, path: string) => bridge().listDirectory(session, path);
export const makeDirectory = (session: string, path: string) => bridge().makeDirectory(session, path);
export const deletePath = (session: string, path: string) => bridge().deletePath(session, path);
export const download = (session: string, remote: string, name: string) =>
  bridge().download(session, remote, name);
export const upload = (targets: TransferTargets) => bridge().upload(targets);
export const pickUploadTargets = (session: string, remoteDir: string) =>
  bridge().pickUploadTargets(session, remoteDir);
export const onTransferProgress = (listener: Parameters<ColabDeskApi["onTransferProgress"]>[0]) =>
  bridge().onTransferProgress(listener);
export const pathForFile = (file: File) => bridge().pathForFile(file);
export const readClipboard = () => bridge().readClipboard();
export const writeClipboard = (text: string) => bridge().writeClipboard(text);

export const minimizeWindow = () => bridge().minimizeWindow();
export const toggleMaximizeWindow = () => bridge().toggleMaximizeWindow();
export const closeWindow = () => bridge().closeWindow();
export const onWindowMaximized = (listener: Parameters<ColabDeskApi["onWindowMaximized"]>[0]) =>
  bridge().onWindowMaximized(listener);

export const updateStatus = () => bridge().updateStatus();
export const checkForUpdates = () => bridge().checkForUpdates();
export const downloadUpdate = () => bridge().downloadUpdate();
export const installUpdate = () => bridge().installUpdate();
export const onUpdateStatus = (listener: Parameters<ColabDeskApi["onUpdateStatus"]>[0]) =>
  bridge().onUpdateStatus(listener);

/**
 * Error from an `invoke` rejection arrives as a plain string or an Error, and
 * Electron wraps the message with IPC plumbing (`Error invoking remote method
 * 'term:open': Error: …`) that means nothing to the person reading it.
 */
export function messageOf(error: unknown): string {
  const raw = typeof error === "string" ? error : error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, "");
}

/** Opens a URL in the user's browser (the main process intercepts window.open). */
export function openExternal(url: string): void {
  window.open(url, "_blank");
}
