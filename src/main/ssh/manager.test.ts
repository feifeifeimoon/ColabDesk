import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { ColabSshConnection, ConnectionStatus, SshTarget } from "./connection";
import { SshManager } from "./manager";

/**
 * A connection whose handshake never settles on its own — the shape a WebSocket
 * that closes without an ssh2 error used to leave behind.
 */
class FakeConnection extends EventEmitter {
  status: ConnectionStatus = "connecting";
  error: string | null = null;
  ended = false;
  resolveConnect: (() => void) | null = null;
  nextShellId = 1;
  private shells = new Set<number>();

  writeShell = vi.fn();
  resizeShell = vi.fn();
  ackShell = vi.fn();
  closeShell = vi.fn();

  constructor(readonly target: SshTarget) {
    super();
  }

  connect(): Promise<void> {
    return new Promise((resolve) => {
      this.resolveConnect = () => {
        this.status = "ready";
        resolve();
      };
    });
  }

  openShell(): Promise<number> {
    const id = this.nextShellId++;
    this.shells.add(id);
    return Promise.resolve(id);
  }

  end(): void {
    this.ended = true;
    this.status = "closed";
    // The real end() emits exit for every shell it closes; drop() must not let
    // that second report reach a listener.
    for (const id of this.shells) this.emit("exit", id);
    this.shells.clear();
  }
}

function setup(): { manager: SshManager; fakes: FakeConnection[] } {
  const fakes: FakeConnection[] = [];
  const manager = new SshManager(
    (name) => ({ name, url: "http://runtime.test", token: "token" }),
    (target) => {
      const fake = new FakeConnection(target);
      fakes.push(fake);
      return fake as unknown as ColabSshConnection;
    },
  );
  return { manager, fakes };
}

describe("SshManager drop", () => {
  it("forgets a handshake in flight, so the next acquire starts fresh", async () => {
    const { manager, fakes } = setup();

    const first = manager.acquire("alpha");
    await Promise.resolve();
    expect(fakes).toHaveLength(1);

    manager.drop("alpha");
    expect(fakes[0].ended).toBe(true);

    // The first promise is still unsettled, exactly like the bug. What matters
    // is that acquire no longer joins it: a held entry would return it forever.
    const second = manager.acquire("alpha");
    expect(fakes).toHaveLength(2);
    expect(second).not.toBe(first);

    fakes[1].resolveConnect?.();
    await expect(second).resolves.toBe(fakes[1]);
  });

  it("unregisters terminals and emits exit when a session is dropped", async () => {
    const { manager, fakes } = setup();

    const acquirePromise = manager.acquire("alpha");
    fakes[0].resolveConnect?.();
    await acquirePromise;

    const terminal1 = await manager.openTerminal("alpha", 80, 24);
    const terminal2 = await manager.openTerminal("alpha", 80, 24);

    const exited: Array<{ channelId: number; session: string }> = [];
    manager.on("exit", (channelId, session) => {
      exited.push({ channelId, session });
    });

    manager.drop("alpha");

    expect(exited).toEqual([
      { channelId: terminal1.channelId, session: "alpha" },
      { channelId: terminal2.channelId, session: "alpha" },
    ]);
    expect(fakes[0].ended).toBe(true);

    // Subsequent write/resize on old channelIds should safely no-op
    manager.write(terminal1.channelId, "hello");
    expect(fakes[0].writeShell).not.toHaveBeenCalled();

    manager.resize(terminal1.channelId, 100, 30);
    expect(fakes[0].resizeShell).not.toHaveBeenCalled();
  });
});
