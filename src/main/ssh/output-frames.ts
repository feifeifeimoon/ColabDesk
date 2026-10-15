/**
 * Terminal output, coalesced before it crosses the IPC boundary.
 *
 * A shell hands us as many chunks as the network gives it, and in a burst that
 * is hundreds of small ones — each of which would otherwise become its own IPC
 * message and its own xterm write. Holding them for a frame's worth of time
 * costs nothing anyone can see and turns the burst into one message per channel.
 *
 * This only decides how the bytes are packaged. How many may be in flight is the
 * other half, and it lives with the channel that can push back (see
 * `ColabSshConnection.ackShell`).
 */

export interface OutputFrame {
  channelId: number;
  session: string;
  data: Buffer;
}

/** Within a frame, in milliseconds. */
const FRAME_MS = 8;
/** …or as soon as this much has piled up, whichever comes first. */
const FRAME_BYTES = 64 * 1024;

export interface OutputFrames {
  push(channelId: number, session: string, chunk: Buffer): void;
  /** Sends everything held; for a channel that is closing and should not wait. */
  flush(): void;
}

export function makeOutputFrames(
  emit: (frame: OutputFrame) => void,
  schedule: (run: () => void) => unknown = (run) => setTimeout(run, FRAME_MS),
): OutputFrames {
  const pending = new Map<number, { session: string; chunks: Buffer[]; bytes: number }>();
  let timer: unknown = null;

  const send = (channelId: number): void => {
    const entry = pending.get(channelId);
    if (!entry) return;
    pending.delete(channelId);
    emit({ channelId, session: entry.session, data: Buffer.concat(entry.chunks, entry.bytes) });
  };

  const flush = (): void => {
    timer = null;
    // Each `send` removes the entry it just sent, which is the one being
    // visited — the one deletion a Map iterator survives.
    for (const channelId of pending.keys()) send(channelId);
  };

  return {
    push(channelId, session, chunk) {
      const entry = pending.get(channelId);
      if (entry) {
        entry.chunks.push(chunk);
        entry.bytes += chunk.length;
      } else {
        pending.set(channelId, { session, chunks: [chunk], bytes: chunk.length });
      }
      if ((pending.get(channelId)?.bytes ?? 0) >= FRAME_BYTES) {
        send(channelId);
        return;
      }
      if (timer === null) timer = schedule(flush);
    },
    flush() {
      for (const channelId of pending.keys()) send(channelId);
    },
  };
}
