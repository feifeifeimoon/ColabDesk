/**
 * Which answer is the current one.
 *
 * Every listing a directory asks for opens its own SFTP channel, so two reads of
 * the same folder really are concurrent — and the slower one is not necessarily
 * the older one. Without this, a refresh that lands before a read it started
 * after would be overwritten by that read, and the folder would snap back to the
 * listing the user just refreshed away from. Seen on the Linux lane: an upload
 * finished, the tree refreshed, and then went back to not having the file.
 *
 * The rule is one line long: a request only applies its answer if nothing newer
 * has asked for the same key since.
 */

export interface RequestTokens {
  /** Starts a request for `key`, and says whether its answer still counts. */
  begin(key: string): () => boolean;
}

export function makeRequestTokens(): RequestTokens {
  const latest = new Map<string, number>();
  return {
    begin(key) {
      const token = (latest.get(key) ?? 0) + 1;
      latest.set(key, token);
      return () => latest.get(key) === token;
    },
  };
}
