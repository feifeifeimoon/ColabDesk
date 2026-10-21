import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
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

  end(): void {
    this.ended = true;
    this.status = "closed";
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
});
