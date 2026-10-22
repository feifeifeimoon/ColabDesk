import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColabSshConnection } from "./connection";

/**
 * The handshake needs an identity, and the point of these cases is the socket:
 * a generated key keeps the real discovery path (`~/.ssh`) out of the test.
 */
vi.mock("./identity", async () => {
  const { utils } = await import("ssh2");
  let key = utils.generateKeyPairSync("ed25519");
  for (let attempt = 0; attempt < 20 && utils.parseKey(key.private) instanceof Error; attempt += 1) {
    key = utils.generateKeyPairSync("ed25519");
  }
  return {
    findIdentity: () => ({
      privateKeyPath: "test-id",
      privateKey: Buffer.from(key.private),
      publicKey: key.public.trim(),
    }),
  };
});

interface FakeServer {
  server: WebSocketServer;
  url: string;
  stop: () => Promise<void>;
}

const servers: WebSocketServer[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    for (const client of server.clients) client.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function startServer(onConnection: (socket: WebSocket) => void): Promise<FakeServer> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  servers.push(server);
  server.on("connection", onConnection);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("测试服务器没有端口");
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    stop: async () => {
      for (const client of server.clients) client.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("等待条件超时");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("ColabSshConnection handshake settlement", () => {
  /**
   * ssh2 settles a close *before* the server banner with its own error. The
   * window this covers is the next one: the header arrived, key exchange began,
   * and the socket went away — ssh2 emits only `close` there, so without an
   * explicit handler `connect()` stays pending forever and `SshManager` caches
   * that promise for every later acquire.
   */
  it("rejects when the peer closes after the server banner", async () => {
    const server = await startServer((socket) => {
      socket.once("message", () => {
        socket.send("SSH-2.0-OpenSSH_9.9\r\n");
        setTimeout(() => socket.close(), 20);
      });
    });
    try {
      const connection = new ColabSshConnection({ name: "e2e", url: server.url, token: "token" });
      await expect(connection.connect()).rejects.toThrow(/握手被中断|连接已关闭/);
      expect(connection.status).toBe("error");
    } finally {
      await server.stop();
    }
  }, 20_000);

  it("retries without announcing closed, and end() interrupts the backoff", async () => {
    const server = await startServer((socket) => {
      socket.once("message", () => {
        socket.send("SSH-2.0-OpenSSH_9.9\r\n");
        setTimeout(() => socket.close(), 20);
      });
    });
    try {
      const connection = new ColabSshConnection({ name: "e2e", url: server.url, token: "token" });
      const statuses: string[] = [];
      const backoff = new Promise<void>((resolve) => {
        connection.on("status", (status: string) => {
          statuses.push(status);
          if (status === "connecting") resolve();
        });
      });

      const connecting = connection.connect();
      await backoff;
      // The retry is still connecting: a `closed` here would flicker the
      // renderer's status for every failed attempt.
      expect(statuses).not.toContain("closed");

      // The retry delay is 1.2 s; waiting it out would mean end() did not
      // interrupt the backoff.
      const started = Date.now();
      connection.end();
      await expect(connecting).rejects.toThrow("SSH 连接已关闭。");
      expect(Date.now() - started).toBeLessThan(500);
    } finally {
      await server.stop();
    }
  }, 20_000);

  it("settles end() while an upgrade rejection is still streaming its body", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(401, { "content-type": "text/plain" });
      response.write("not authorized");
      // Deliberately no end(): this body is what openSocket waits on.
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address() as AddressInfo;
    try {
      const connection = new ColabSshConnection({
        name: "e2e",
        url: `http://127.0.0.1:${address.port}`,
        token: "token",
      });
      const connecting = connection.connect();
      // Let the upgrade reach `unexpected-response` and start buffering it.
      await new Promise((resolve) => setTimeout(resolve, 100));

      const started = Date.now();
      connection.end();
      await expect(connecting).rejects.toThrow("SSH 连接已关闭。");
      expect(Date.now() - started).toBeLessThan(1_000);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 10_000);

  it("settles immediately when end() cancels a handshake in flight", async () => {
    const server = await startServer(() => {
      // Accept and stay silent: the client is mid-handshake when end() arrives.
    });
    try {
      const connection = new ColabSshConnection({ name: "e2e", url: server.url, token: "token" });
      const connecting = connection.connect();
      await waitFor(() => server.server.clients.size > 0);

      const started = Date.now();
      connection.end();

      await expect(connecting).rejects.toThrow("SSH 连接已关闭。");
      expect(Date.now() - started).toBeLessThan(1_000);
      expect(connection.status).toBe("closed");
    } finally {
      await server.stop();
    }
  }, 20_000);
});
