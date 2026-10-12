/**
 * One SSH connection to one Colab runtime, carried over the runtime proxy's
 * WebSocket endpoint.
 *
 * Colab exposes SSH as a WebSocket byte tunnel:
 *
 *   wss://<session host>/colab/ssh?colab-runtime-proxy-token=<token>
 *   header  X-Colab-Ssh-Pubkey: <~/.ssh/id_ed25519.pub>
 *
 * `colab ssh --proxy-mode` bridges that to stdio so a system `ssh` can use it
 * as a ProxyCommand. This app instead hands the WebSocket straight to `ssh2`
 * as its transport, which removes three dependencies at once: no system
 * OpenSSH, no node-pty, and no patched Python (the CLI's Windows bridge fix
 * remains unreleased upstream).
 *
 * One caveat from the server side: a runtime accepts a single SSH connection
 * (a second upgrade gets HTTP 429). So everything — terminal channels and SFTP
 * — must multiplex over one connection per session, which is what this class
 * provides.
 */

import { EventEmitter } from "node:events";
import type { Duplex } from "node:stream";
import { Client, type ClientChannel, type SFTPWrapper } from "ssh2";
import WebSocket, { createWebSocketStream } from "ws";
import { findIdentity, type Identity } from "./identity";

export interface SshTarget {
  name: string;
  url: string;
  token: string;
}

export type ConnectionStatus = "connecting" | "ready" | "closed" | "error";

/** The route to Colab resets TLS connections intermittently; retries help. */
const CONNECT_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1_200;
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** A failure worth retrying: the request never reached Colab intact. */
class TransientConnectError extends Error {}

/** Maps upgrade-handshake failures to messages that say what to do. */
export function explainHandshakeFailure(status: number | undefined, body: string): string {
  const snippet = body.trim().slice(0, 200);
  if (status === 400 && snippet.includes("missing pubkey")) {
    return "服务端拒绝了请求：缺少公钥头。请反馈此问题。";
  }
  if (status === 400 && snippet.includes("unsupported key type")) {
    return "服务端拒绝了公钥：只接受 ssh-ed25519 与 ecdsa-sha2-nistp{256,384,521}，"
      + "RSA 密钥不可用。请生成 Ed25519 密钥：ssh-keygen -t ed25519";
  }
  if (status === 400) {
    return `服务端拒绝了公钥（HTTP 400）：${snippet}`;
  }
  if (status === 401) {
    return "认证失败（HTTP 401）：运行时令牌无效，会话可能已过期，请重新创建会话。";
  }
  if (status === 403) {
    return "被拒绝（HTTP 403）：令牌可能没有该操作的权限。";
  }
  if (status === 404) {
    return "端点不存在（HTTP 404）：该运行时没有开放 /colab/ssh。SSH 在创建运行时时启用，"
      + "旧运行时不可用——请用 colab new 建一个新会话。";
  }
  if (status === 429) {
    return "该运行时已有一个 SSH 会话（HTTP 429）：同一时间只允许一个连接，"
      + "请先断开另一处（另一个窗口 / 终端 / VS Code），或在本应用内重试。";
  }
  if (status === 502) {
    return "网关错误（HTTP 502）：运行时内的 sshd 不可达，运行时可能不健康。";
  }
  if (status === undefined) {
    return `WebSocket 连接失败：${snippet || "无 HTTP 状态"}。请检查网络。`;
  }
  return `WebSocket 升级被拒绝（HTTP ${status}）：${snippet}`;
}

export interface ShellOpenOptions {
  cols: number;
  rows: number;
  /** Command written into the fresh shell, e.g. `cd /content`. */
  initialCommand?: string;
}

export class ColabSshConnection extends EventEmitter {
  status: ConnectionStatus = "connecting";
  error: string | null = null;

  private ws: WebSocket | null = null;
  private sock: Duplex | null = null;
  private client: Client | null = null;
  private sftpWrapper: SFTPWrapper | null = null;
  private sftpPending: Promise<SFTPWrapper> | null = null;
  private shells = new Map<number, ClientChannel>();
  private nextShellId = 1;
  private identity: Identity | null = null;

  constructor(readonly target: SshTarget) {
    super();
  }

  private setStatus(status: ConnectionStatus, error: string | null = null): void {
    this.status = status;
    this.error = error;
    this.emit("status", status, error);
  }

  /**
   * Opens the WebSocket and completes the SSH handshake over it, retrying the
   * whole attempt on transport-level failures — the route to Colab resets TLS
   * connections, and a freshly allocated runtime can accept the upgrade before
   * its sshd is up and then drop it mid-handshake.
   */
  async connect(): Promise<void> {
    const identity = findIdentity();
    if (!identity) {
      throw new Error("~/.ssh 下没有可用的私钥（id_ed25519 / id_ecdsa）。请先运行：ssh-keygen -t ed25519");
    }
    this.identity = identity;

    const parsed = new URL(this.target.url);
    if (!parsed.host) throw new Error(`会话 ${this.target.name} 的运行时代址无效: ${this.target.url}`);
    const scheme = parsed.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${scheme}://${parsed.host}/colab/ssh?colab-runtime-proxy-token=${this.target.token}`;

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt += 1) {
      try {
        await this.openSocket(wsUrl, identity.publicKey);
        await this.handshake(identity);
        return;
      } catch (error) {
        lastError = error as Error;
        this.discardSocket();
        const retryable = error instanceof TransientConnectError;
        if (!retryable || attempt === CONNECT_ATTEMPTS) break;
        this.setStatus("connecting");
        await delay(RETRY_DELAY_MS * attempt);
      }
    }

    const failure = lastError ?? new Error("SSH 连接失败。");
    this.setStatus("error", failure.message);
    throw failure;
  }

  /** The SSH key exchange, over the socket `openSocket` just established. */
  private handshake(identity: Identity): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const client = new Client();
      this.client = client;

      client.on("ready", () => {
        this.setStatus("ready");
        resolve();
      });
      client.on("error", (error) => {
        if (error.level === "client-authentication") {
          reject(new Error(`SSH 认证失败：${error.message}（请确认 ~/.ssh/id_ed25519.pub 与私钥匹配）`));
          return;
        }
        // A socket that died mid-handshake reads as noise from ssh2 ("WebSocket
        // is not open: readyState 2"); it is worth another attempt, and if the
        // retries run out the user gets a plain-language message.
        const transient = /not open|closed|disconnected|ECONNRESET|EPIPE|timed? ?out/i.test(error.message);
        reject(
          transient
            ? new TransientConnectError("SSH 握手被中断（运行时可能仍在启动，或网络被重置）。")
            : new Error(`SSH 连接失败：${error.message}`),
        );
      });
      client.on("close", () => this.teardown("连接已关闭"));

      const sock = createWebSocketStream(this.ws!);
      this.sock = sock;
      client.connect({
        sock,
        host: "colab-runtime",
        username: "root",
        privateKey: identity.privateKey,
        // The runtime's host key is generated per VM; OpenSSH clients in this
        // flow disable host checking for the same reason.
        hostVerifier: () => true,
        keepaliveInterval: 20_000,
        readyTimeout: 30_000,
      });
    });
  }

  /** Drops a socket from a failed attempt so the next one starts clean. */
  private discardSocket(): void {
    this.client?.removeAllListeners();
    this.client = null;
    // Destroy the duplex before dropping the socket: otherwise inbound bytes
    // still reach ssh2's parser after the client is gone.
    this.sock?.destroy();
    this.sock = null;
    if (this.ws) {
      this.ws.removeAllListeners();
      try {
        this.ws.terminate();
      } catch {
        // already gone
      }
      this.ws = null;
    }
  }

  /** One WebSocket upgrade; network failures are marked retryable. */
  private openSocket(wsUrl: string, pubkey: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl, { headers: { "X-Colab-Ssh-Pubkey": pubkey } });
      this.ws = ws;

      let settled = false;
      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        try {
          ws.terminate();
        } catch {
          // already gone
        }
        reject(error);
      };

      ws.on("unexpected-response", (_request, response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => (body += chunk));
        response.on("end", () =>
          fail(new Error(explainHandshakeFailure(response.statusCode, body))),
        );
      });
      ws.on("error", (error) => fail(new TransientConnectError(`WebSocket 连接失败：${error.message}`)));
      ws.on("close", () => {
        if (!settled) fail(new TransientConnectError("WebSocket 连接在握手前关闭。"));
        else if (this.status !== "error") this.teardown("连接已关闭");
      });
      ws.on("open", () => {
        if (settled) return;
        settled = true;
        resolve();
      });
    });
  }

  /** Opens a PTY shell channel and returns its id. */
  async openShell(options: ShellOpenOptions): Promise<number> {
    const client = this.requireClient();
    const channel = await new Promise<ClientChannel>((resolve, reject) => {
      client.shell(
        { term: "xterm-256color", cols: options.cols, rows: options.rows },
        (error, stream) => (error ? reject(error) : resolve(stream)),
      );
    });

    const id = this.nextShellId++;
    this.shells.set(id, channel);

    channel.on("data", (chunk: Buffer) => this.emit("data", id, chunk));
    channel.stderr.on("data", (chunk: Buffer) => this.emit("data", id, chunk));
    channel.on("close", () => {
      this.shells.delete(id);
      this.emit("exit", id);
    });

    const initial = options.initialCommand ?? `cd /content 2>/dev/null\n`;
    channel.write(initial);
    return id;
  }

  writeShell(id: number, data: string): void {
    this.shells.get(id)?.write(data);
  }

  resizeShell(id: number, cols: number, rows: number): void {
    this.shells.get(id)?.setWindow(rows, cols, 0, 0);
  }

  closeShell(id: number): void {
    const channel = this.shells.get(id);
    if (channel) {
      channel.end();
      this.shells.delete(id);
    }
  }

  /** One SFTP subsystem per connection, created on first use. */
  async sftp(): Promise<SFTPWrapper> {
    if (this.sftpWrapper) return this.sftpWrapper;
    if (this.sftpPending) return this.sftpPending;

    const client = this.requireClient();
    this.sftpPending = new Promise<SFTPWrapper>((resolve, reject) => {
      client.sftp((error, wrapper) => {
        if (error) {
          this.sftpPending = null;
          reject(error);
          return;
        }
        this.sftpWrapper = wrapper;
        wrapper.on("close", () => {
          this.sftpWrapper = null;
          this.sftpPending = null;
        });
        resolve(wrapper);
      });
    });
    return this.sftpPending;
  }

  get identityPath(): string | null {
    return this.identity?.privateKeyPath ?? null;
  }

  end(): void {
    for (const [id, channel] of this.shells) {
      channel.end();
      this.shells.delete(id);
    }
    this.client?.end();
    this.sock?.destroy();
    this.sock = null;
    this.ws?.close();
    this.setStatus("closed");
  }

  private requireClient(): Client {
    if (!this.client || this.status !== "ready") {
      throw new Error(this.error ?? "SSH 连接尚未就绪。");
    }
    return this.client;
  }

  private teardown(reason: string): void {
    if (this.status === "closed") return;
    const hadError = this.status === "error";
    for (const [id] of this.shells) {
      this.shells.delete(id);
      this.emit("exit", id);
    }
    this.sftpWrapper = null;
    this.sftpPending = null;
    this.sock?.destroy();
    this.sock = null;
    this.setStatus(hadError ? "error" : "closed", hadError ? this.error : reason);
  }
}
