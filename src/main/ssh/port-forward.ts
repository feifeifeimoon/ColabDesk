/**
 * Local TCP forwards over the session's single SSH connection.
 *
 * Each forward owns one loopback `net.Server`. A local connection opens an SSH
 * `direct-tcpip` channel through `forwardOut` and the two streams are piped
 * together; no second SSH connection is made and nothing binds the forward to a
 * visible terminal tab.
 *
 * A forward is a connection consumer: the SSH layer is asked for the session's
 * connection when the forward starts, and the connection's own status closes the
 * listeners if it drops. The renderer is never trusted to keep that alive.
 */

import net from "node:net";
import type { Duplex } from "node:stream";
import type { PortForward, PortForwardRequest } from "@shared/types";
import { errorMessage, type LogSink } from "../log-file";
import type { ConnectionStatus } from "./connection";

const LOOPBACK = "127.0.0.1";
const MIN_LOCAL_PORT = 1024;
const MAX_PORT = 65535;

export interface ForwardingConnection {
  status: ConnectionStatus;
  forwardOut(dstHost: string, dstPort: number, srcPort?: number): Promise<Duplex>;
  on(event: "status", listener: (status: ConnectionStatus, error: string | null) => void): unknown;
  removeListener(
    event: "status",
    listener: (status: ConnectionStatus, error: string | null) => void,
  ): unknown;
}

export interface ForwardingSsh {
  acquire(session: string): Promise<ForwardingConnection>;
}

interface ForwardRecord {
  forward: PortForward;
  server: net.Server | null;
  sockets: Set<net.Socket>;
  connection: ForwardingConnection | null;
  statusListener: ((status: ConnectionStatus, error: string | null) => void) | null;
  /** One start attempt at a time; stop-then-start must not race two servers. */
  starting: boolean;
}

export class PortForwardManager {
  private readonly records = new Map<string, ForwardRecord>();
  private nextId = 1;

  constructor(
    private readonly ssh: ForwardingSsh,
    private readonly onChange: (session: string) => void,
    private readonly log?: LogSink,
  ) {}

  list(session: string): PortForward[] {
    return [...this.records.values()]
      .filter((record) => record.forward.session === session)
      .map((record) => ({ ...record.forward }));
  }

  create(request: PortForwardRequest): PortForward {
    const invalid = validate(request);
    if (invalid) throw new Error(invalid);

    const forward: PortForward = {
      id: `port-${this.nextId++}`,
      session: request.session,
      remote_host: request.remote_host?.trim() || LOOPBACK,
      remote_port: request.remote_port,
      local_host: LOOPBACK,
      local_port: null,
      requested_local_port: request.local_port ?? null,
      scheme: request.scheme ?? "http",
      status: "starting",
      error: null,
    };
    const record: ForwardRecord = {
      forward,
      server: null,
      sockets: new Set(),
      connection: null,
      statusListener: null,
      starting: false,
    };
    this.records.set(forward.id, record);
    this.publish(forward.session);
    void this.startRecord(record);
    return { ...forward };
  }

  start(id: string): PortForward | null {
    const record = this.records.get(id);
    if (!record) return null;
    // A previous attempt is still opening (possibly after a stop). Starting a
    // second one would let two continuations overwrite `server`/`statusListener`
    // and close each other's listener; let the first settle, then retry.
    if (record.starting) return { ...record.forward };
    if (record.forward.status === "starting" || record.forward.status === "active") {
      return { ...record.forward };
    }
    record.forward.status = "starting";
    record.forward.local_port = null;
    record.forward.error = null;
    this.publish(record.forward.session);
    void this.startRecord(record);
    return { ...record.forward };
  }

  stop(id: string): PortForward | null {
    const record = this.records.get(id);
    if (!record) return null;
    // A starting record is left to `startRecord`, which checks the status after
    // the handshake/listen and closes whatever it built. Closing its server here
    // could leave the listen promise unsettled.
    if (record.forward.status !== "starting") this.closeRecord(record);
    record.forward.status = "stopped";
    record.forward.local_port = null;
    record.forward.error = null;
    this.log?.write("ports", `${record.forward.session} 停止端口转发 ${record.forward.id}`);
    this.publish(record.forward.session);
    return { ...record.forward };
  }

  remove(id: string): void {
    const record = this.records.get(id);
    if (!record) return;
    const session = record.forward.session;
    this.closeRecord(record);
    this.records.delete(id);
    this.publish(session);
  }

  /**
   * Hang-up stop: every mapping of the session stops, but its definition stays
   * so the rows can be restarted when the session is opened again. A session
   * stop uses `forget` instead.
   */
  stopAll(session: string): void {
    let changed = false;
    for (const record of this.records.values()) {
      if (record.forward.session !== session) continue;
      // A starting record is left to `startRecord`, which sees the stopped
      // status after the handshake/listen and closes what it built.
      if (record.forward.status !== "starting") this.closeRecord(record);
      record.forward.status = "stopped";
      record.forward.local_port = null;
      record.forward.error = null;
      changed = true;
    }
    if (changed) this.publish(session);
  }

  /** The session is gone: stop and forget everything under it. */
  forget(session: string): void {
    let changed = false;
    // Deleting the current entry during a Map iteration is well-defined; a
    // snapshot would only allocate for the same answer.
    for (const [id, record] of this.records) {
      if (record.forward.session !== session) continue;
      this.closeRecord(record);
      this.records.delete(id);
      changed = true;
    }
    if (changed) this.publish(session);
  }

  dispose(): void {
    for (const record of this.records.values()) this.closeRecord(record);
    this.records.clear();
  }

  private publish(session: string): void {
    this.onChange(session);
  }

  private async startRecord(record: ForwardRecord): Promise<void> {
    const { forward } = record;
    record.starting = true;
    try {
      const connection = await this.ssh.acquire(forward.session);
      // The user may have stopped or removed it while the handshake ran.
      if (!this.records.has(forward.id) || forward.status !== "starting") return;

      record.connection = connection;
      const listener = (status: ConnectionStatus, error: string | null): void => {
        // A stop while the channel was opening must not turn the stopped row
        // back into an error when the connection later drops.
        if (forward.status !== "starting" && forward.status !== "active") return;
        if (status === "closed" || status === "error") {
          this.fail(record, error ?? "运行时连接已断开，端口转发已停止。");
        }
      };
      record.statusListener = listener;
      connection.on("status", listener);

      const server = net.createServer((socket) => this.accept(record, socket));
      record.server = server;
      await new Promise<void>((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
        server.listen({
          host: LOOPBACK,
          port: forward.requested_local_port ?? 0,
          exclusive: true,
        });
      });

      if (!this.records.has(forward.id) || forward.status !== "starting") {
        this.closeRecord(record);
        return;
      }
      const address = server.address();
      const localPort = typeof address === "object" && address !== null ? address.port : null;
      if (!localPort) throw new Error("无法分配本地端口。");

      forward.local_port = localPort;
      forward.status = "active";
      forward.error = null;
      server.on("error", (cause) => this.fail(record, portError(cause, forward)));
      this.log?.write(
        "ports",
        `${forward.session} ${forward.remote_host}:${forward.remote_port} → 127.0.0.1:${localPort}`,
      );
      this.publish(forward.session);
    } catch (cause) {
      if (!this.records.has(forward.id)) return;
      // A stop during the handshake is not a failure; keep the stopped row.
      if (forward.status !== "starting") {
        this.closeRecord(record);
        return;
      }
      this.fail(record, startError(cause, forward));
    } finally {
      record.starting = false;
    }
  }

  private accept(record: ForwardRecord, socket: net.Socket): void {
    const { forward } = record;
    socket.setNoDelay(true);
    record.sockets.add(socket);

    let channel: Duplex | null = null;
    let closed = false;
    const close = (): void => {
      if (closed) return;
      closed = true;
      record.sockets.delete(socket);
      // Destroying a piped socket does not close the Duplex on the other side;
      // without this the direct-tcpip channel outlives the listener and keeps
      // the runtime-side socket open until the whole SSH connection ends.
      channel?.destroy();
      socket.destroy();
    };
    // This listener must exist before `forwardOut`: a client that resets while
    // the channel is opening otherwise emits an unhandled 'error', and the
    // process guard rethrows that into the whole main process.
    socket.on("error", close);
    socket.on("close", close);

    const connection = record.connection;
    if (!connection) {
      close();
      return;
    }

    connection
      .forwardOut(forward.remote_host, forward.remote_port, socket.remotePort ?? 0)
      .then((opened) => {
        channel = opened;
        if (closed || !record.sockets.has(socket) || !this.records.has(forward.id)) {
          opened.destroy();
          return;
        }
        socket.pipe(opened).pipe(socket);
        opened.on("error", (cause) => {
          // One refused connection does not take the listener down: the target
          // service may simply not be up yet.
          this.log?.write(
            "ports",
            `${forward.session} 转发连接失败：${errorMessage(cause)}`,
          );
          close();
        });
        opened.on("close", close);
      })
      .catch((cause) => {
        this.log?.write(
          "ports",
          `${forward.session} 打开转发通道失败：${errorMessage(cause)}`,
        );
        close();
      });
  }

  private fail(record: ForwardRecord, detail: string): void {
    if (!this.records.has(record.forward.id)) return;
    this.closeRecord(record);
    record.forward.status = "error";
    record.forward.local_port = null;
    record.forward.error = detail;
    this.log?.write("ports", `${record.forward.session} 端口转发失败：${detail}`);
    this.publish(record.forward.session);
  }

  private closeRecord(record: ForwardRecord): void {
    if (record.connection && record.statusListener) {
      record.connection.removeListener("status", record.statusListener);
    }
    record.statusListener = null;
    record.connection = null;
    for (const socket of record.sockets) socket.destroy();
    record.sockets.clear();
    if (record.server) {
      try {
        record.server.close();
      } catch {
        // Not listening, or already closed.
      }
      record.server = null;
    }
  }
}

function validate(request: PortForwardRequest): string | null {
  if (!request || typeof request.session !== "string" || !request.session) {
    return "缺少会话。";
  }
  if (
    !Number.isInteger(request.remote_port)
    || request.remote_port < 1
    || request.remote_port > MAX_PORT
  ) {
    return `远程端口必须在 1–${MAX_PORT} 之间。`;
  }
  const local = request.local_port;
  if (
    local !== undefined
    && local !== null
    && (!Number.isInteger(local) || local < MIN_LOCAL_PORT || local > MAX_PORT)
  ) {
    return `本地端口必须在 ${MIN_LOCAL_PORT}–${MAX_PORT} 之间，或留空自动分配。`;
  }
  if (typeof request.remote_host !== "string" && request.remote_host !== undefined) {
    return "远程主机格式无效。";
  }
  const host = (request.remote_host ?? "").trim();
  if (host) {
    // A dot-address that `net.isIP` rejects (e.g. 999.1.1.1) must not slip
    // through as a hostname; `localhost`, DNS labels and IPv4/IPv6 are fine.
    const ip = net.isIP(host) !== 0;
    const dottedQuad = /^\d+(?:\.\d+){3}$/.test(host);
    const name = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(
      host,
    );
    if (!ip && (!name || dottedQuad)) return "远程主机格式无效。";
  }
  if (request.scheme !== undefined && request.scheme !== "http" && request.scheme !== "https") {
    return "协议无效。";
  }
  return null;
}

function portError(cause: unknown, forward: PortForward): string {
  const code = (cause as NodeJS.ErrnoException).code;
  if (code === "EADDRINUSE") {
    return forward.requested_local_port
      ? `本地端口 ${forward.requested_local_port} 已被占用，请改用自动或其它端口。`
      : "本地端口被占用，请重试。";
  }
  if (code === "EACCES") return "没有权限监听这个本地端口。";
  return errorMessage(cause);
}

function startError(cause: unknown, forward: PortForward): string {
  const message = errorMessage(cause);
  if (forward.requested_local_port && /address already in use/i.test(message)) {
    return `本地端口 ${forward.requested_local_port} 已被占用，请改用自动或其它端口。`;
  }
  return message;
}
