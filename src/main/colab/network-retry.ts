/**
 * The retry rule from `AGENTS.md`, in one place.
 *
 * Connections to Google are reset intermittently (`SSLEOFError`), so read-only
 * calls retry once and calls with side effects never do. Both the CLI wrapper
 * and the direct API reads in `account.ts` answer to the same rule, which is
 * why it lives here rather than in either of them.
 */

const RETRY_DELAY_MS = 600;

const TRANSIENT_MARKERS = [
  "SSLError",
  "UNEXPECTED_EOF_WHILE_READING",
  "MaxRetryError",
  "ConnectionResetError",
  "RemoteDisconnected",
  "Read timed out",
  // fetch failures carry these instead of the urllib/python ones.
  "fetch failed",
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "socket hang up",
];

/** A failure worth trying again: the request never reached Colab intact. */
export function isTransientNetworkFailure(output: string): boolean {
  return TRANSIENT_MARKERS.some((marker) => output.includes(marker));
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run a read-only attempt up to `attempts` times, retrying only transient
 * failures. The last failure wins, so the caller keeps the real cause.
 */
export async function retryTransientRead<T>(attempt: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown;
  for (let attemptNumber = 1; attemptNumber <= attempts; attemptNumber += 1) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attemptNumber === attempts || !isTransientNetworkFailure(message)) throw error;
      await delay(RETRY_DELAY_MS);
    }
  }
  throw lastError;
}
