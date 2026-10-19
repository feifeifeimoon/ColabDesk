/**
 * Which account this machine last saw signed in.
 *
 * Persisted because neither `sessions.json` nor the usage history records an
 * owner — the CLI's own store has no such field — so an account *switch* can
 * only be noticed by remembering who was here before. `subject` is Google's
 * stable id; the email is what a person recognises, and can change.
 */

const KEY = "colabdesk.account";

export interface RememberedAccount {
  email: string;
  subject: string | null;
  /**
   * The address that was here before the current one, while the rails records
   * still belong to it. Kept so a restart does not lose the explanation.
   */
  previousEmail?: string | null;
}

export function readRememberedAccount(): RememberedAccount | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RememberedAccount;
    return typeof parsed.email === "string" && parsed.email ? parsed : null;
  } catch {
    return null;
  }
}

export function rememberAccount(account: RememberedAccount): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(account));
  } catch {
    // A full or disabled storage costs the detection, never the sign-in.
  }
}
