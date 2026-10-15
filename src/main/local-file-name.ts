/**
 * Remote names, made legal on this machine.
 *
 * The runtime is Linux, where `:` `*` `?` and a trailing dot are ordinary parts
 * of a filename — and on Windows every one of them either fails the write or
 * silently loses the suffix. A name is sanitized before it is offered as a
 * download destination, so the failure lands in the dialog the user can still
 * change rather than in an `EPERM` afterwards.
 *
 * Applied on every platform: a name that is legal here and illegal elsewhere is
 * a support incident waiting for a different laptop, and the substitution is
 * visible enough (`best:1.pt` → `best-1.pt`) to be understood.
 */

/** The characters Windows refuses, plus the control range no shell shows. */
// eslint-disable-next-line no-control-regex -- the control range is the point
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g;

/** Windows device names are reserved with or without an extension. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?=\.|$)/i;

/** Leaves room for the directory a file lands in, and for the staging suffix. */
const MAX_LENGTH = 160;

const FALLBACK = "download";

export function sanitizeLocalName(name: string): string {
  const cleaned = name
    .replace(ILLEGAL, "-")
    // Windows silently drops trailing dots and spaces, which would make the
    // name that arrives differ from the one in the dialog.
    .replace(/[. ]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length === 0) return FALLBACK;
  if (!RESERVED.test(cleaned) && cleaned.length <= MAX_LENGTH) return cleaned;

  const prefixed = RESERVED.test(cleaned) ? `_${cleaned}` : cleaned;
  if (prefixed.length <= MAX_LENGTH) return prefixed;

  const dot = prefixed.lastIndexOf(".");
  const extension = dot > 0 ? prefixed.slice(dot) : "";
  return `${prefixed.slice(0, MAX_LENGTH - extension.length)}${extension}`;
}
