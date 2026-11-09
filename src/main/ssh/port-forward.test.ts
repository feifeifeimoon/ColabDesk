import { EventEmitter } from "node:events";
import net from "node:net";
import { Transform } from "node:stream";
import { describe, expect, it } from "vitest";
import type { PortForward } from "@shared/types";
import {
  PortForwardManager,
  type ForwardingConnection,
  type ForwardingSsh,
} from "./port-forward";

class FakeConnection extends EventEmitter implements ForwardingConnection {
  status = "ready" as const;
  readonly channels: Transform[] = [];

  async forwardOut(): Promise<Transform> {
    const channel = new Transform({
      transform(chunk, _encoding, done) {
        done(null, chunk);
      },
    });
    this.channels.push(channel);
    return channel;
  }
}

class FakeSsh implements ForwardingSsh {
  constructor(readonly connection: FakeConnection) {}

  async acquire(): Promise<ForwardingConnection> {
    return this.connection;
  }
}

class DelayedSsh implements ForwardingSsh {
  private resolve!: (connection: ForwardingConnection) => void;
  private readonly ready = new Promise<ForwardingConnection>((resolve) => {
    this.resolve = resolve;
  });

  async acquire(): Promise<ForwardingConnection> {
    return this.ready;
  }

  release(connection: ForwardingConnection): void {
    this.resolve(connection);
  }
}

/** A connection whose `forwardOut` never answers, so `accept` stays pending. */
class PendingChannelConnection extends FakeConnection {
  override async forwardOut(): Promise<Transform> {
    return new Promise<Transform>(() => undefined);
  }
}

async function waitFor(
  manager: PortForwardManager,
  session: string,
  status: PortForward["status"],
): Promise<PortForward> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const found = manager.list(session).find((forward) => forward.status === status);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`没有等到 ${session} 的 ${status} 状态`);
}

function exchange(port: number, text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => socket.end(text));
    let data = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => (data += chunk));
    socket.on("close", () => resolve(data));
    socket.on("error", reject);
    socket.setTimeout(3_000, () => {
      socket.destroy();
      reject(new Error("本地连接超时"));
    });
  });
}

/** Keeps a local connection open until the forward stops it. */
function openConnection(port: number): Promise<{ closed: Promise<void> }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => {
      resolve({ closed: new Promise((done) => socket.once("close", () => done())) });
    });
    socket.once("error", reject);
  });
}

describe("the port forward manager", () => {
  it("binds a local port and carries bytes both ways", async () => {
    const ssh = new FakeSsh(new FakeConnection());
    const manager = new PortForwardManager(ssh, () => {});
    try {
      const created = manager.create({ session: "alpha", remote_port: 8000 });
      expect(created.status).toBe("starting");
      expect(created.local_port).toBeNull();

      const active = await waitFor(manager, "alpha", "active");
      // Read back from `server.address()` by the manager, not copied from the
      // request: the listener really is on loopback.
      expect(active.local_host).toBe("127.0.0.1");
      expect(active.local_port).toBeGreaterThan(0);
      expect(await exchange(active.local_port!, "hello\n")).toBe("hello\n");
    } finally {
      manager.dispose();
    }
  });

  it("uses one status listener for every forward on one connection", async () => {
    const connection = new FakeConnection();
    const manager = new PortForwardManager(new FakeSsh(connection), () => {});
    try {
      for (let index = 0; index < 12; index += 1) {
        manager.create({ session: "alpha", remote_port: 8000 + index });
      }
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const active = manager.list("alpha").filter((forward) => forward.status === "active");
        if (active.length === 12) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const active = manager.list("alpha").filter((forward) => forward.status === "active");
      expect(active).toHaveLength(12);
      expect(connection.listenerCount("status")).toBe(1);

      manager.stopAll("alpha");
      expect(connection.listenerCount("status")).toBe(0);
    } finally {
      manager.dispose();
    }
  });

  it("closes an open forwarded connection when the mapping stops", async () => {
    const connection = new FakeConnection();
    const manager = new PortForwardManager(new FakeSsh(connection), () => {});
    try {
      const created = manager.create({ session: "alpha", remote_port: 8000 });
      const active = await waitFor(manager, "alpha", "active");
      const { closed } = await openConnection(active.local_port!);
      // Let the accept -> forwardOut callback create the channel.
      await new Promise((resolve) => setTimeout(resolve, 10));
      const channel = connection.channels.at(-1);
      expect(channel).toBeDefined();

      manager.stop(created.id);
      await closed;
      // The server-side socket's close handler destroys the paired channel on
      // the next turn; the client's close can arrive first.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(channel?.destroyed).toBe(true);
    } finally {
      manager.dispose();
    }
  });

  it("queues a start clicked while the first attempt is still pending", async () => {
    const connection = new FakeConnection();
    const ssh = new DelayedSsh();
    const manager = new PortForwardManager(ssh, () => {});
    try {
      const created = manager.create({ session: "alpha", remote_port: 8000 });
      manager.stop(created.id);
      // The first attempt still owns the handshake; this click is remembered
      // rather than racing a second server/status listener over the record.
      expect(manager.start(created.id)?.status).toBe("stopped");

      ssh.release(connection);
      const active = await waitFor(manager, "alpha", "active");
      expect(active.local_port).toBeGreaterThan(0);
    } finally {
      manager.dispose();
    }
  });

  it("leaves no status listener when a start is stopped mid-handshake", async () => {
    const connection = new FakeConnection();
    const ssh = new DelayedSsh();
    const manager = new PortForwardManager(ssh, () => {});
    try {
      const created = manager.create({ session: "alpha", remote_port: 8000 });
      manager.stop(created.id);
      ssh.release(connection);
      await new Promise((resolve) => setTimeout(resolve, 40));

      expect(manager.list("alpha")[0]?.status).toBe("stopped");
      expect(connection.listenerCount("status")).toBe(0);
    } finally {
      manager.dispose();
    }
  });

  it("reports a fixed local port conflict and leaves the first mapping alone", async () => {
    const ssh = new FakeSsh(new FakeConnection());
    const manager = new PortForwardManager(ssh, () => {});
    try {
      const first = manager.create({ session: "alpha", remote_port: 8000 });
      const active = await waitFor(manager, "alpha", "active");
      const second = manager.create({
        session: "alpha",
        remote_port: 8001,
        local_port: active.local_port,
      });
      const failed = await waitFor(manager, "alpha", "error");
      expect(failed.error).toMatch(/占用/);
      expect(manager.list("alpha").find((forward) => forward.id === first.id)?.status).toBe("active");
      expect(manager.list("alpha").find((forward) => forward.id === second.id)?.status).toBe("error");
    } finally {
      manager.dispose();
    }
  });

  it("turns a lost connection into an error on every mapping", async () => {
    const connection = new FakeConnection();
    const manager = new PortForwardManager(new FakeSsh(connection), () => {});
    try {
      manager.create({ session: "alpha", remote_port: 8000 });
      const active = await waitFor(manager, "alpha", "active");
      const port = active.local_port!;
      connection.emit("status", "closed", null);
      const failed = await waitFor(manager, "alpha", "error");
      expect(failed.error).toMatch(/连接已断开/);

      let refused = false;
      try {
        await exchange(port, "ping\n");
      } catch {
        refused = true;
      }
      expect(refused).toBe(true);
    } finally {
      manager.dispose();
    }
  });

  it("survives a client reset while the direct-tcpip channel is opening", async () => {
    const manager = new PortForwardManager(new FakeSsh(new PendingChannelConnection()), () => {});
    try {
      manager.create({ session: "alpha", remote_port: 8000 });
      const active = await waitFor(manager, "alpha", "active");
      const socket = net.connect({ host: "127.0.0.1", port: active.local_port! });
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", () => resolve());
        socket.once("error", reject);
      });
      // The accept is waiting on forwardOut. Without an error listener on the
      // accepted socket, the reset was an unhandled 'error' the process guard
      // turned into a crash.
      socket.resetAndDestroy();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(manager.list("alpha")[0]?.status).toBe("active");
    } finally {
      manager.dispose();
    }
  });

  it("closes and clears every mapping on dispose", async () => {
    const manager = new PortForwardManager(new FakeSsh(new FakeConnection()), () => {});
    manager.create({ session: "alpha", remote_port: 8000 });
    await waitFor(manager, "alpha", "active");
    manager.dispose();
    expect(manager.list("alpha")).toEqual([]);
  });

  it("forgets a session's mappings when the session goes away", async () => {
    const manager = new PortForwardManager(new FakeSsh(new FakeConnection()), () => {});
    try {
      manager.create({ session: "alpha", remote_port: 8000 });
      await waitFor(manager, "alpha", "active");
      manager.forget("alpha");
      expect(manager.list("alpha")).toEqual([]);
    } finally {
      manager.dispose();
    }
  });

  it("forgets only the sessions a successful sync no longer lists", async () => {
    const manager = new PortForwardManager(new FakeSsh(new FakeConnection()), () => {});
    try {
      manager.create({ session: "alpha", remote_port: 8000 });
      manager.create({ session: "beta", remote_port: 8001 });
      await waitFor(manager, "alpha", "active");
      await waitFor(manager, "beta", "active");

      manager.retain(["alpha"]);

      expect(manager.list("alpha")).toHaveLength(1);
      expect(manager.list("beta")).toEqual([]);
    } finally {
      manager.dispose();
    }
  });

  it("rejects requests the OS could never honour", () => {
    const manager = new PortForwardManager(new FakeSsh(new FakeConnection()), () => {});
    expect(() => manager.create({ session: "alpha", remote_port: 0 })).toThrow(/远程端口/);
    expect(() => manager.create({ session: "", remote_port: 8000 })).toThrow(/缺少会话/);
    expect(() =>
      manager.create({ session: "alpha", remote_port: 8000, local_port: 80 }),
    ).toThrow(/本地端口/);
    expect(() =>
      manager.create({ session: "alpha", remote_port: 8000, remote_host: ":" }),
    ).toThrow(/远程主机/);
    expect(() =>
      manager.create({ session: "alpha", remote_port: 8000, remote_host: "999.1.1.1" }),
    ).toThrow(/远程主机/);
    expect(() =>
      manager.create({ session: "alpha", remote_port: 8000, remote_host: 5 as never }),
    ).toThrow(/远程主机/);
    expect(() =>
      manager.create({ session: "alpha", remote_port: 8000, remote_host: "localhost" }),
    ).not.toThrow();
    manager.dispose();
  });
});
