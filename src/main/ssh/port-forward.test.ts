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

  async forwardOut(): Promise<Transform> {
    return new Transform({
      transform(chunk, _encoding, done) {
        done(null, chunk);
      },
    });
  }
}

class FakeSsh implements ForwardingSsh {
  constructor(readonly connection: FakeConnection) {}

  async acquire(): Promise<ForwardingConnection> {
    return this.connection;
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

describe("the port forward manager", () => {
  it("binds a local port and carries bytes both ways", async () => {
    const ssh = new FakeSsh(new FakeConnection());
    const manager = new PortForwardManager(ssh, () => {});
    try {
      const created = manager.create({ session: "alpha", remote_port: 8000 });
      expect(created.status).toBe("starting");
      expect(created.local_port).toBeNull();

      const active = await waitFor(manager, "alpha", "active");
      expect(active.local_port).toBeGreaterThan(0);
      expect(await exchange(active.local_port!, "hello\n")).toBe("hello\n");
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
      await waitFor(manager, "alpha", "active");
      connection.emit("status", "closed", null);
      const failed = await waitFor(manager, "alpha", "error");
      expect(failed.error).toMatch(/连接已断开/);
    } finally {
      manager.dispose();
    }
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

  it("rejects requests the OS could never honour", () => {
    const manager = new PortForwardManager(new FakeSsh(new FakeConnection()), () => {});
    expect(() => manager.create({ session: "alpha", remote_port: 0 })).toThrow(/远程端口/);
    expect(() => manager.create({ session: "", remote_port: 8000 })).toThrow(/缺少会话/);
    expect(() =>
      manager.create({ session: "alpha", remote_port: 8000, local_port: 80 }),
    ).toThrow(/本地端口/);
    manager.dispose();
  });
});
