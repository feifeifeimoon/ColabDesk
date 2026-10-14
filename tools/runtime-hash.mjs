/**
 * A content hash over a directory tree, used to answer one question: did this
 * build change the bundled runtime? Two builds of the same CLI and Python
 * version must produce the same hash, or the installer's block map will differ
 * and every update degrades into a full 190MB download.
 *
 * Exclusions are the point of the whole thing: .pyc files embed absolute source
 * paths from whatever machine compiled them.
 */

import { createHash } from "node:crypto";
import { lstat, readdir, readFile, readlink, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const IGNORED_DIRECTORIES = new Set(["__pycache__"]);

async function collect(dir, root, into) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      await collect(full, root, into);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      if (entry.name.endsWith(".pyc")) continue;
      into.push(relative(root, full).split(sep).join("/"));
    }
  }
}

export async function hashRuntimeDir(dir) {
  // Fail loudly: an empty hash for a missing directory would read as "unchanged".
  await stat(dir);

  const paths = [];
  await collect(dir, dir, paths);
  paths.sort();

  const digest = createHash("sha256");
  for (const path of paths) {
    digest.update(path);
    digest.update("\0");
    const full = join(dir, path);
    const st = await lstat(full);
    if (st.isSymbolicLink()) {
      digest.update(await readlink(full));
    } else {
      digest.update(await readFile(full));
    }
    digest.update("\0");
  }
  return digest.digest("hex");
}
