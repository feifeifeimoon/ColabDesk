/**
 * Connection and terminal registry.
 *
 * A runtime accepts exactly one SSH connection, so every feature that needs
 * SSH for a session (terminals, SFTP) shares the entry created here. Terminal
 * channels get process-wide ids so the IPC layer can route write/resize/close
 * without knowing about connections.
 */

import { EventEmitter } from "node:events";
import { ColabSshConnection, type ConnectionStatus, type SshTarget } from "./connection";

export interface TerminalHandle {
  channelId: number;
  session: string;
}

interface TerminalRecord {
  session: string;
  shellId: number;
  connection: ColabSshConnection;
}

/**
 * Events, with process-wide channel ids instead of per-connection shell ids.
 *
 * The session travels with them because a pane knows its session from the first
 * render but learns its channel id a round trip later — output that arrives in
 * between must not be mistaken for another tab's.
 */
export interface SshManagerEvents {
  data: (channelId: number, session: string, data: Buffer) => void;
  exit: (channelId: number, session: string) => void;
  status: (session: string, status: ConnectionStatus, error: string | null) => void;
}

export class SshManager extends EventEmitter {
  private connections = new Map<string, ColabSshConnection>();
  private pending = new Map<string, Promise<ColabSshConnection>>();
  private terminals = new Map<number, TerminalRecord>();
  private nextChannelId = 1;

  /**
   * `createConnection` is a seam for the lifecycle tests: a fake connection lets
   * `drop`/`acquire` be exercised without opening a socket.
   */
  constructor(
    private readonly resolveTarget: (name: string) => SshTarget,
    private readonly createConnection: (target: SshTarget) => ColabSshConnection = (target) =>
      new ColabSshConnection(target),
  ) {
    super();
  }

  /** A shell id on one connection, with the channel it is published under. */
  private recordFor(
    connection: ColabSshConnection,
    shellId: number,
  ): [number, TerminalRecord] | null {
    for (const [channelId, record] of this.terminals) {
      if (record.connection === connection && record.shellId === shellId) return [channelId, record];
    }
    return null;
  }

  get(name: string): ColabSshConnection | undefined {
    return this.connections.get(name);
  }

  /**
   * Reuses a live connection, joins an in-flight handshake, or starts a new
   * one. Callers must always await this: a connection that exists but is still
   * handshaking has no client yet, and using it would fail with "not ready".
   */
  async acquire(name: string): Promise<ColabSshConnection> {
    const existing = this.connections.get(name);
    if (existing?.status === "ready") return existing;

    const inFlight = this.pending.get(name);
    if (inFlight) return inFlight;

    if (existing) existing.end();

    const connection = this.createConnection(this.resolveTarget(name));
    this.connections.set(name, connection);

    connection.on("data", (shellId: number, chunk: Buffer) => {
      const found = this.recordFor(connection, shellId);
      if (found) this.emit("data", found[0], found[1].session, chunk);
    });
    connection.on("exit", (shellId: number) => {
      const found = this.recordFor(connection, shellId);
      if (found) {
        this.terminals.delete(found[0]);
        this.emit("exit", found[0], found[1].session);
      }
    });
    connection.on("status", (status: ConnectionStatus, error: string | null) => {
      this.emit("status", name, status, error);
    });

    const promise = connection
      .connect()
      .then(() => connection)
      .catch((error) => {
        if (this.connections.get(name) === connection) this.connections.delete(name);
        throw error;
      })
      .finally(() => {
        if (this.pending.get(name) === promise) this.pending.delete(name);
      });

    this.pending.set(name, promise);
    return promise;
  }

  async openTerminal(name: string, cols: number, rows: number): Promise<TerminalHandle> {
    const connection = await this.acquire(name);
    const shellId = await connection.openShell({ cols, rows });
    const channelId = this.nextChannelId++;
    this.terminals.set(channelId, { session: name, shellId, connection });
    return { channelId, session: name };
  }

  write(channelId: number, data: string): void {
    this.terminals.get(channelId)?.connection.writeShell(this.terminals.get(channelId)!.shellId, data);
  }

  resize(channelId: number, cols: number, rows: number): void {
    const record = this.terminals.get(channelId);
    if (record) record.connection.resizeShell(record.shellId, cols, rows);
  }

  /** The renderer has parsed this much of that terminal's output. */
  ack(channelId: number, bytes: number): void {
    const record = this.terminals.get(channelId);
    if (record) record.connection.ackShell(record.shellId, bytes);
  }

  closeTerminal(channelId: number): void {
    const record = this.terminals.get(channelId);
    if (!record) return;
    record.connection.closeShell(record.shellId);
    this.terminals.delete(channelId);
  }

  /** Ends the connection for a session; its terminals are closed with it. */
  drop(name: string): void {
    const connection = this.connections.get(name);
    // A handshake in flight has a `pending` entry even though it has no usable
    // connection yet. Leaving it behind makes every later acquire join a
    // promise that nothing will settle.
    this.pending.delete(name);

    for (const [channelId, record] of this.terminals) {
      if (record.session === name || (connection && record.connection === connection)) {
        this.terminals.delete(channelId);
        this.emit("exit", channelId, record.session);
      }
    }

    if (!connection) return;
    this.connections.delete(name);
    connection.end();
  }

  dropAll(): void {
    // The snapshot is the point: `drop` deletes from the map this loop walks.
    // eslint-disable-next-line unicorn/no-useless-spread
    for (const name of [...this.connections.keys()]) this.drop(name);
  }
}
