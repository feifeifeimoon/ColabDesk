/**
 * The fake Colab runtime: a real SSH server behind a real WebSocket tunnel.
 *
 * `connection.ts` hands the runtime proxy's WebSocket straight to `ssh2`, so a
 * test runtime is only a matter of providing both layers locally — an
 * `ssh2.Server` that speaks SSH, and an HTTP server that accepts the upgrade
 * and pipes its bytes into it. The app dials this exactly the way it dials
 * Colab; the session's `url` in the seeded store is the only thing that makes
 * this "the runtime".
 */

import { once, type EventEmitter } from "node:events";
import { createServer } from "node:http";
import { createConnection, type AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import {
  Server as SshServer,
  utils,
  type Attributes,
  type PseudoTtyInfo,
  type ServerChannel,
  type Session,
  type SFTPWrapper,
  type WindowChangeInfo,
} from "ssh2";
import { createWebSocketStream, WebSocketServer } from "ws";
import { generateHostKey } from "./mode";
import { RuntimeFilesystem, RUNTIME_HOME, normalizePath, type RuntimeNode } from "./runtime-filesystem";

const { OPEN_MODE, STATUS_CODE } = utils.sftp;

const DIRECTORY_MODE = 0o040755;
const FILE_MODE = 0o100644;
const LINK_MODE = 0o120777;
const HOSTNAME = "e2e-runtime";
const SSH_PATH = "/colab/ssh";

/** For a `REALPATH` on something that does not exist yet. */
const EMPTY_ATTRS: Attributes = { mode: 0, uid: 0, gid: 0, size: 0, atime: 0, mtime: 0 };

export interface MockRuntime {
  /** The address that goes into the seeded session store. */
  url: string;
  /** Shells opened since start: proves a tab switch did not reconnect. */
  shellsOpened(): number;
  close(): Promise<void>;
}

/** How the app reached us, as the runtime proxy would report it. */
function refuse(socket: Duplex, status: number, reason: string, body: string): void {
  socket.end(
    `HTTP/1.1 ${status} ${reason}\r\n`
      + "Connection: close\r\n"
      + `Content-Length: ${Buffer.byteLength(body)}\r\n`
      + "\r\n"
      + body,
  );
}

export async function startMockRuntime(): Promise<MockRuntime> {
  const filesystem = new RuntimeFilesystem();
  let shellsOpened = 0;

  const sshd = new SshServer({ hostKeys: [generateHostKey()] }, (client) => {
    // The runtime authenticates by public key; the key itself is never checked,
    // because what the tests exercise is everything after the handshake.
    client.on("authentication", (context) => context.accept());
    client.on("ready", () => {
      client.on("session", (accept) => {
        attachSession(accept(), filesystem, () => {
          shellsOpened += 1;
          return shellsOpened;
        });
      });
    });
    // A client that walks away mid-handshake is the app's problem to report.
    client.on("error", () => {});
  });

  await listen(sshd);
  const sshPort = (sshd.address() as AddressInfo).port;

  // The tunnel stands in for the runtime proxy: same upgrade, same gate on the
  // public-key header, and the same byte pipe on the other side.
  const proxy = createServer();
  const tunnel = new WebSocketServer({ noServer: true });
  proxy.on("upgrade", (request, socket, head) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (path !== SSH_PATH) {
      refuse(socket, 404, "Not Found", "no such proxy endpoint");
      return;
    }
    if (!request.headers["x-colab-ssh-pubkey"]) {
      refuse(socket, 400, "Bad Request", "missing pubkey");
      return;
    }
    tunnel.handleUpgrade(request, socket, head, (websocket) => {
      tunnel.emit("connection", websocket, request);
    });
  });

  tunnel.on("connection", (websocket) => {
    const upstream = createConnection({ host: "127.0.0.1", port: sshPort });
    const stream = createWebSocketStream(websocket);
    stream.pipe(upstream).pipe(stream);
    upstream.on("error", () => stream.destroy());
    stream.on("error", () => upstream.destroy());
  });

  await listen(proxy);
  const proxyPort = (proxy.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${proxyPort}`,
    shellsOpened: () => shellsOpened,
    close: async () => {
      for (const socket of tunnel.clients) socket.terminate();
      tunnel.close();
      await Promise.all([closeServer(proxy), closeServer(sshd)]);
    },
  };
}

/** A runtime accepts one SSH connection per session; two would need HTTP 429,
    which this mock leaves out so a test never depends on connection timing. */
function attachSession(session: Session, filesystem: RuntimeFilesystem, onShell: () => number): void {
  const window = { cols: 80, rows: 24 };

  session.on("pty", (accept, _reject, info: PseudoTtyInfo) => {
    window.cols = info.cols;
    window.rows = info.rows;
    accept();
  });
  // A window change expects no reply: ssh2 hands this handler an `accept` that
  // is undefined (the reply callbacks only exist when `wantReply` is set), so
  // calling it throws inside the packet handler and takes the whole connection
  // down with it — which is what a resize storm looked like from the app.
  session.on("window-change", (_accept, _reject, info: WindowChangeInfo) => {
    window.cols = info.cols;
    window.rows = info.rows;
  });
  session.on("shell", (accept) => {
    attachShell(accept(), filesystem, window, onShell());
  });
  session.on("sftp", (accept) => attachSftp(accept(), filesystem));
  session.on("exec", (accept) => {
    // Nothing in the app execs over SSH; a client that tries gets a clean exit.
    const stream = accept();
    stream.exit(0);
    stream.end();
  });
}

interface ShellWindow {
  cols: number;
  rows: number;
}

/**
 * A line editor and a handful of commands, which is as much shell as the tests
 * need. It echoes what is typed and keeps a working directory, because those
 * two are what let a spec tell "the same shell came back" from "the pane
 * reconnected to a new one".
 */
function attachShell(
  stream: ServerChannel,
  filesystem: RuntimeFilesystem,
  window: ShellWindow,
  ordinal: number,
): void {
  let cwd = RUNTIME_HOME;
  let line = "";
  /** `esc` sees the ESC itself, `csi` the parameters up to the final byte. */
  let escape: "none" | "esc" | "csi" = "none";
  let sequence = "";
  let carriageReturn = false;

  const write = (text: string): void => {
    stream.write(text);
  };
  const prompt = (): void => write(`\r\nroot@${HOSTNAME}:${cwd}# `);

  /** Set when the shell has been asked to end, so nothing prompts afterwards. */
  let ended = false;

  const run = (input: string): void => {
    const [command, ...rest] = input.trim().split(/\s+/);
    // `2>/dev/null` and friends are noise here; the app's startup line has one.
    const args = rest.filter((token) => !/^\d?>/.test(token));

    switch (command) {
      case "":
        return;
      case "echo":
        write(`${args.join(" ")}\r\n`);
        return;
      case "pwd":
        write(`${cwd}\r\n`);
        return;
      case "cd": {
        const target = args[0] ?? "/";
        if (filesystem.directory(target, cwd)) cwd = normalizePath(target, cwd);
        else write(`cd: ${target}: No such file or directory\r\n`);
        return;
      }
      case "ls": {
        const entries = filesystem.list(args[0] ?? cwd, cwd);
        write(entries ? `${[...entries.keys()].sort().join("  ")}\r\n` : `ls: ${args[0]}: no such file\r\n`);
        return;
      }
      case "whoami":
        write("root\r\n");
        return;
      case "uname":
        write("Linux e2e-runtime 6.1.0 #1 SMP x86_64 GNU/Linux\r\n");
        return;
      case "stty":
        return;
      /**
       * More output than any window holds, so a test can watch the app hold the
       * shell back instead of buffering a screenful of megabytes. The pump waits
       * on the channel's own buffer, which is the far end of the same
       * backpressure the app applies.
       */
      case "flood": {
        const total = Number(args[0] ?? 2_000_000);
        let sent = 0;
        const pump = (): void => {
          let wrote = 0;
          while (sent < total && (stream.writableLength ?? 0) < 512 * 1024 && wrote < 64) {
            const size = Math.min(64 * 1024, total - sent);
            write(`${"x".repeat(size - 1)}\n`);
            sent += size;
            wrote += 1;
          }
          if (sent < total) {
            setImmediate(pump);
            return;
          }
          write("flood done\r\n");
          prompt();
        };
        pump();
        return;
      }
      /** Ends the shell the way `exit` does, for a reconnect test. */
      case "exit":
        ended = true;
        write("logout\r\n");
        stream.exit(0);
        stream.end();
        return;
      default:
        write(`bash: ${command}: command not found\r\n`);
    }
  };

  // Asks for bracketed paste, like any readline would: a client that wraps what
  // it pastes is then visible in the transcript below.
  write(`\x1b[?2004hColabDesk E2E runtime · shell #${ordinal} · ${window.cols}x${window.rows}\r\n`);
  prompt();

  stream.on("data", (chunk: Buffer) => {
    for (const character of chunk.toString("utf8")) {
      if (escape === "esc") {
        if (character === "[") {
          escape = "csi";
          sequence = "";
          continue;
        }
        escape = "none";
        continue;
      }
      if (escape === "csi") {
        // The final byte of a control sequence is the first one in @–~.
        if (character >= "@" && character <= "~") {
          escape = "none";
          if (sequence === "200") write("\r\n[paste-start]\r\n");
          else if (sequence === "201") write("[paste-end]\r\n");
          continue;
        }
        sequence += character;
        continue;
      }
      if (character === "\x1b") {
        escape = "esc";
        continue;
      }
      if (character === "\r" || character === "\n") {
        // A bare LF after a CR is the same Enter, not a second one.
        if (character === "\n" && carriageReturn) {
          carriageReturn = false;
          continue;
        }
        carriageReturn = character === "\r";
        write("\r\n");
        run(line);
        line = "";
        if (!ended) prompt();
        continue;
      }
      if (character === "\x7f") {
        if (line.length > 0) {
          line = line.slice(0, -1);
          write("\b \b");
        }
        continue;
      }
      if (character === "\x03") {
        line = "";
        write("^C");
        prompt();
        continue;
      }
      if (character === "\t") continue;

      carriageReturn = false;
      line += character;
      write(character);
    }
  });
}

interface DirectoryHandle {
  kind: "dir";
  entries: Map<string, RuntimeNode>;
  delivered: boolean;
}

interface FileHandle {
  kind: "file";
  /** `OPEN` only ever hands back a regular file; a link is written through. */
  node: Extract<RuntimeNode, { kind: "file" }>;
}

/**
 * The fake runtime's bandwidth.
 *
 * A transfer that finishes inside one frame cannot be watched: a spec can never
 * click cancel while it is in flight, and the progress row is gone before it can
 * be read. Serving bytes at a rate instead of at memory speed is what makes one
 * observable. 8 MB/s is slow enough to click into and fast enough that no spec
 * waits on it.
 *
 * One timer for the whole queue, not one per request: hundreds of pending
 * timers starve the very process that hosts this fake (the app's main process),
 * and a starved main process cannot answer the cancel the test is trying to
 * click — measured, not feared.
 */
const BYTES_PER_SECOND = 8 * 1024 * 1024;

function makeBandwidth() {
  let freeAt = 0;
  let timer: NodeJS.Timeout | null = null;
  const queue: { at: number; release: () => void }[] = [];

  const pump = (): void => {
    timer = null;
    const now = Date.now();
    while (queue.length > 0 && queue[0].at <= now) queue.shift()?.release();
    if (queue.length > 0) timer = setTimeout(pump, Math.max(1, queue[0].at - Date.now()));
  };

  return (bytes: number): Promise<void> => {
    const now = Date.now();
    const at = Math.max(now, freeAt);
    freeAt = at + (bytes / BYTES_PER_SECOND) * 1000;
    return new Promise((resolve) => {
      queue.push({ at, release: resolve });
      if (timer === null) timer = setTimeout(pump, Math.max(1, at - now));
    });
  };
}

/**
 * Answers a rate-limited request, unless the channel went away while it waited —
 * which is exactly what cancelling a transfer does, and not an error here.
 */
function respond(reply: () => void): void {
  try {
    reply();
  } catch {
    // The client closed the channel under the in-flight request.
  }
}

/**
 * The SFTP subset the app uses: listings, folder creation, deletes, and the
 * open/read/write triple `fastGet` and `fastPut` build on. Anything else is
 * answered `OP_UNSUPPORTED` rather than silently accepted.
 */
function attachSftp(sftp: SFTPWrapper, filesystem: RuntimeFilesystem): void {
  const handles = new Map<string, DirectoryHandle | FileHandle>();
  const bandwidth = makeBandwidth();
  let nextHandle = 1;

  const attrsFor = (node: RuntimeNode): Attributes => ({
    mode: node.kind === "dir" ? DIRECTORY_MODE : node.kind === "link" ? LINK_MODE : FILE_MODE,
    uid: 0,
    gid: 0,
    size: node.kind === "file" ? node.length : node.kind === "link" ? node.target.length : 0,
    atime: node.mtime,
    mtime: node.mtime,
  });

  const longNameFor = (name: string, node: RuntimeNode): string => {
    if (node.kind === "link") {
      return `lrwxrwxrwx 1 root root ${node.target.length} ${name} -> ${node.target}`;
    }
    const permissions = node.kind === "dir" ? "drwxr-xr-x" : "-rw-r--r--";
    const size = node.kind === "file" ? node.length : 4096;
    return `${permissions} 1 root root ${size} ${name}`;
  };

  /** A directory entry as SFTP wants it; a path that does not exist still has a name. */
  const entryFor = (name: string, node: RuntimeNode | null) => ({
    filename: name,
    longname: node ? longNameFor(name, node) : name,
    attrs: node ? attrsFor(node) : EMPTY_ATTRS,
  });

  const keep = (handle: DirectoryHandle | FileHandle): Buffer => {
    const id = String(nextHandle++);
    handles.set(id, handle);
    return Buffer.from(id);
  };
  const held = (id: Buffer): DirectoryHandle | FileHandle | undefined => handles.get(id.toString());
  const missing = (reqid: number): void => sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
  const failed = (reqid: number): void => sftp.status(reqid, STATUS_CODE.FAILURE);

  sftp.on("REALPATH", (reqid: number, path: string) => {
    const real = normalizePath(path, RUNTIME_HOME);
    sftp.name(reqid, [entryFor(real, filesystem.node(real))]);
  });

  // STAT follows a link and LSTAT does not — the distinction the app's delete
  // path depends on, so the fake has to keep it.
  sftp.on("STAT", (reqid: number, path: string) => {
    const node = filesystem.node(path, RUNTIME_HOME);
    if (node) sftp.attrs(reqid, attrsFor(node));
    else missing(reqid);
  });
  sftp.on("LSTAT", (reqid: number, path: string) => {
    const node = filesystem.lstat(path, RUNTIME_HOME);
    if (node) sftp.attrs(reqid, attrsFor(node));
    else missing(reqid);
  });
  sftp.on("FSTAT", (reqid: number, handle: Buffer) => {
    const entry = held(handle);
    if (!entry) return failed(reqid);
    if (entry.kind === "file") return sftp.attrs(reqid, attrsFor(entry.node));
    failed(reqid);
  });

  sftp.on("OPENDIR", (reqid: number, path: string) => {
    const entries = filesystem.list(path, RUNTIME_HOME);
    if (!entries) return missing(reqid);
    sftp.handle(reqid, keep({ kind: "dir", entries, delivered: false }));
  });
  sftp.on("READDIR", (reqid: number, handle: Buffer) => {
    const entry = held(handle);
    if (entry?.kind !== "dir") return failed(reqid);
    // The client keeps asking until it sees EOF, as SFTP requires.
    if (entry.delivered) return sftp.status(reqid, STATUS_CODE.EOF);
    entry.delivered = true;
    sftp.name(
      reqid,
      [...entry.entries.entries()].map(([name, node]) => entryFor(name, node)),
    );
  });

  sftp.on("OPEN", (reqid: number, filename: string, flags: number) => {
    const existing = filesystem.node(filename, RUNTIME_HOME);

    if (flags & OPEN_MODE.WRITE || flags & OPEN_MODE.APPEND) {
      const node = existing ?? filesystem.create(filename, RUNTIME_HOME);
      if (!node || node.kind !== "file") return failed(reqid);
      if (flags & OPEN_MODE.TRUNC) {
        node.content = Buffer.alloc(0);
        node.length = 0;
      }
      return sftp.handle(reqid, keep({ kind: "file", node }));
    }

    if (existing?.kind !== "file") return missing(reqid);
    sftp.handle(reqid, keep({ kind: "file", node: existing }));
  });
  sftp.on("READ", async (reqid: number, handle: Buffer, offset: number, length: number) => {
    const entry = held(handle);
    if (entry?.kind !== "file") return failed(reqid);
    const { node } = entry;
    if (offset >= node.length) return sftp.status(reqid, STATUS_CODE.EOF);
    const slice = node.content.subarray(offset, Math.min(offset + length, node.length));
    await bandwidth(slice.length);
    respond(() => sftp.data(reqid, slice));
  });

  sftp.on("WRITE", async (reqid: number, handle: Buffer, offset: number, data: Buffer) => {
    const entry = held(handle);
    if (entry?.kind !== "file") return failed(reqid);
    await bandwidth(data.length);
    const { node } = entry;
    // `fastPut` writes chunks at arbitrary offsets, so the file grows to fit —
    // doubling the allocation, because growing it exactly would turn an 8 MB
    // upload into a gigabyte of copying through the app's own main process.
    if (offset + data.length > node.content.length) {
      const grown = Buffer.alloc(Math.max(offset + data.length, Math.max(node.content.length * 2, 64 * 1024)));
      node.content.copy(grown);
      node.content = grown;
    }
    data.copy(node.content, offset);
    node.length = Math.max(node.length, offset + data.length);
    node.mtime = Math.floor(Date.now() / 1000);
    respond(() => sftp.status(reqid, STATUS_CODE.OK));
  });

  sftp.on("CLOSE", (reqid: number, handle: Buffer) => {
    handles.delete(handle.toString());
    sftp.status(reqid, STATUS_CODE.OK);
  });

  sftp.on("MKDIR", (reqid: number, path: string) => {
    const result = filesystem.mkdir(path, RUNTIME_HOME);
    if (result === "ok") sftp.status(reqid, STATUS_CODE.OK);
    else if (result === "exists") failed(reqid);
    else missing(reqid);
  });
  sftp.on("RMDIR", (reqid: number, path: string) => {
    // A link is not a directory, and the target is not this path's to remove:
    // the fake refuses both, so a client that walks into a link fails here
    // rather than quietly emptying the directory behind it.
    if (filesystem.lstat(path, RUNTIME_HOME)?.kind !== "dir") return missing(reqid);
    const entries = filesystem.list(path, RUNTIME_HOME);
    // A non-empty directory is refused, so the app's own recursion is what the
    // tests exercise when deleting a folder.
    if (!entries || entries.size > 0) return failed(reqid);
    if (filesystem.remove(path, RUNTIME_HOME)) sftp.status(reqid, STATUS_CODE.OK);
    else missing(reqid);
  });
  sftp.on("REMOVE", (reqid: number, path: string) => {
    // `unlink` takes files and links but never a directory, as on the far side.
    const node = filesystem.lstat(path, RUNTIME_HOME);
    if (!node || node.kind === "dir") return missing(reqid);
    if (filesystem.remove(path, RUNTIME_HOME)) sftp.status(reqid, STATUS_CODE.OK);
    else failed(reqid);
  });
  sftp.on("RENAME", (reqid: number, oldPath: string, newPath: string) => {
    // Plain SFTP rename refuses an existing destination, which is what makes the
    // app's two-step promotion observable here.
    const result = filesystem.rename(oldPath, newPath, RUNTIME_HOME);
    if (result === "ok") sftp.status(reqid, STATUS_CODE.OK);
    else if (result === "exists") failed(reqid);
    else missing(reqid);
  });

  sftp.on("EXTENDED", (reqid: number) => sftp.status(reqid, STATUS_CODE.OP_UNSUPPORTED));
  sftp.on("error", () => {});
}

/** Binds to an ephemeral port so parallel runs cannot collide on a fixed one. */
async function listen(server: EventEmitter & { listen(port: number, host: string): unknown }): Promise<void> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
}

function closeServer(server: { close(callback: (error?: Error) => void): void }): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}
