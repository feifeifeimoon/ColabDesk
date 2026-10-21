/** The typed surface the renderer sees; everything else stays in main. */

import { contextBridge, ipcRenderer, webUtils } from "electron";
import { EVENTS, IPC } from "@shared/ipc";
import type { ColabDeskApi, RuntimeList, SessionList } from "@shared/api";

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>;

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: unknown, payload: T): void => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const api: ColabDeskApi = {
  envStatus: () => invoke(IPC.envStatus),
  listSessions: () => invoke<SessionList>(IPC.listSessions),
  listUntracked: () => invoke<RuntimeList>(IPC.listUntracked),
  usage: () => invoke(IPC.usage),
  usageTrend: () => invoke(IPC.usageTrend),

  createSession: (options) => invoke(IPC.createSession, options),
  onSessionCreateOutput: (listener) => subscribe(EVENTS.sessionCreateOutput, listener),
  stopSession: (name) => invoke(IPC.stopSession, name),
  restartKernel: (name) => invoke(IPC.restartKernel, name),
  syncSessions: () => invoke(IPC.syncSessions),

  startLogin: () => invoke(IPC.startLogin),
  submitLoginCode: (code) => invoke(IPC.submitLoginCode, code),
  cancelLogin: () => invoke(IPC.cancelLogin),
  logout: () => invoke(IPC.logout),
  onAuthUrl: (listener) => subscribe(EVENTS.authUrl, listener),
  onAuthDone: (listener) => subscribe(EVENTS.authDone, listener),

  sshSetup: (name) => invoke(IPC.sshSetup, name),
  sshRemove: (name) => invoke(IPC.sshRemove, name),
  sshIdentity: () => invoke(IPC.sshIdentity),
  sshGenerateKey: () => invoke(IPC.sshGenerateKey),
  sshDisconnect: (name) => invoke(IPC.sshDisconnect, name),
  onSshStatus: (listener) => subscribe(EVENTS.sshStatus, listener),

  openTerminal: (session, cols, rows) => invoke(IPC.termOpen, { session, cols, rows }),
  writeTerminal: (channelId, data) => invoke(IPC.termWrite, { channelId, data }),
  resizeTerminal: (channelId, cols, rows) => invoke(IPC.termResize, { channelId, cols, rows }),
  ackTerminal: (channelId, bytes) => ipcRenderer.send(IPC.termAck, { channelId, bytes }),
  closeTerminal: (channelId) => invoke(IPC.termClose, channelId),
  onTerminalData: (listener) => subscribe(EVENTS.sshData, listener),
  onTerminalClosed: (listener) => subscribe(EVENTS.sshClosed, listener),

  listDirectory: (session, path) => invoke(IPC.sftpList, { session, path }),
  statPaths: (session, paths) => invoke(IPC.sftpStat, { session, paths }),
  readTextFile: (session, path) => invoke(IPC.sftpReadText, { session, path }),
  writeTextFile: (request) => invoke(IPC.sftpWriteText, request),
  makeDirectory: (session, path) => invoke(IPC.sftpMkdir, { session, path }),
  deletePath: (session, path) => invoke(IPC.sftpDelete, { session, path }),
  download: (session, remote, name, title) => invoke(IPC.sftpDownload, { session, remote, name, title }),
  downloadFolder: (session, remote, name, title) =>
    invoke(IPC.sftpDownloadFolder, { session, remote, name, title }),
  upload: (targets) => invoke(IPC.sftpUpload, targets),
  cancelTransfer: (id) => invoke(IPC.sftpCancel, id),
  pickUploadTargets: (title) => invoke(IPC.pickUploadTargets, { title }),
  pickUploadFolder: (title) => invoke(IPC.pickUploadFolder, { title }),
  onTransferProgress: (listener) => subscribe(EVENTS.transferProgress, listener),

  pathForFile: (file) => webUtils.getPathForFile(file),

  // Through the main process: the clipboard module is not one a preload gets.
  readClipboard: () => invoke(IPC.clipboardRead),
  writeClipboard: (text) => invoke(IPC.clipboardWrite, text),

  minimizeWindow: () => invoke(IPC.windowMinimize),
  toggleMaximizeWindow: () => invoke(IPC.windowToggleMaximize),
  closeWindow: () => invoke(IPC.windowClose),
  onWindowMaximized: (listener) => subscribe(EVENTS.windowMaximized, listener),

  updateStatus: () => invoke(IPC.updateStatus),
  checkForUpdates: () => invoke(IPC.updateCheck),
  downloadUpdate: () => invoke(IPC.updateDownload),
  installUpdate: () => invoke(IPC.updateInstall),
  onUpdateStatus: (listener) => subscribe(EVENTS.updateStatus, listener),

  logPath: () => invoke(IPC.logPath),
  revealLog: () => invoke(IPC.logReveal),
};

contextBridge.exposeInMainWorld("colabdesk", api);
