/**
 * The HTTP transport for the Colab and Google reads.
 *
 * Node's `fetch` ignores the Windows user proxy, while the Colab CLI (Python)
 * and Chromium both use it. On a machine whose route to
 * `colab.research.google.com` is a local proxy, Node's fetch therefore times
 * out with a bare "fetch failed" and the usage panel goes blank — even though
 * `colab usage` still answers. `index.ts` installs Electron's `net.fetch` once
 * the app is ready; tests keep the global fetch.
 */

type Fetch = typeof globalThis.fetch;

let transport: Fetch = globalThis.fetch;

export function setHttpTransport(next: Fetch): void {
  transport = next;
}

export function httpFetch(input: Parameters<Fetch>[0], init?: Parameters<Fetch>[1]): ReturnType<Fetch> {
  return transport(input, init);
}
