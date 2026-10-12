/**
 * The one ask this app makes of anyone: a star on GitHub.
 *
 * Opening the repository answers it. A click cannot prove a star, and there is
 * nothing here that could check (no GitHub account, no `gh`) — so the ask counts
 * as answered once it has been delivered, rather than repeating itself on every
 * launch. That is also why the button only ever points at the repository: it
 * never claims a star the user may not have given.
 */

/** Owner and name, the way GitHub writes it. */
export const REPOSITORY = "feifeifeimoon/ColabDesk";
export const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;

const OPENED_KEY = "colabdesk.repositoryOpened";

/**
 * Storage can be missing (the unit tests run in node, without a DOM) and can
 * throw (a browser in private mode); neither is a reason for the start page to
 * fail to draw, so both fall back to "not answered yet".
 */
function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function hasOpenedRepository(): boolean {
  try {
    return storage()?.getItem(OPENED_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberRepositoryOpened(): void {
  try {
    storage()?.setItem(OPENED_KEY, "1");
  } catch {
    /* Refusing to store it only means the ask comes back next launch. */
  }
}
