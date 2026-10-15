/**
 * The tree, as a list of rows.
 *
 * A tree is drawn as one flat list whose rows carry a depth, rather than as
 * nested elements: it keeps the DOM shallow however deep the filesystem goes,
 * and it means "what is on screen" is one array that can be walked with a
 * number — which is all the keyboard navigation needs.
 *
 * Kept apart from the pane so the projection can be asserted on its own: the
 * rules worth holding are about what a closed folder hides and where a child
 * lands, and neither needs a terminal or a connection to say.
 */

import type { RemoteEntry } from "@shared/types";

/** A directory's contents, and how that read is going. */
export interface Listing {
  entries: RemoteEntry[];
  loading: boolean;
  error: string | null;
}

/** One row of the tree as drawn: a path, its depth, and what is at it. */
export interface Row {
  path: string;
  name: string;
  depth: number;
  /** The root has no entry of its own; everything else has one. */
  entry: RemoteEntry | null;
  /** Directories are what can be opened, so they are what has a twisty. */
  open: boolean;
}

/** A child path, without the doubled slash the root would produce. */
export function childPath(parent: string, name: string): string {
  return parent === "/" ? `/${name}` : `${parent}/${name}`;
}

/** Whether a row is a directory, as far as its type says. */
export function isDirectoryRow(row: Row): boolean {
  return row.entry === null || row.entry.type === "dir" || row.entry.type === "link";
}

/**
 * Every row the tree shows, in draw order: a folder, then its children if it is
 * open, each of them recursive.
 *
 * A directory that has no listing yet is still drawn — the row is how the user
 * sees the click land, and the loading state belongs on it rather than on a tree
 * that has not changed shape.
 */
export function projectRows(
  listings: Record<string, Listing>,
  open: ReadonlySet<string>,
  root: string,
): Row[] {
  const drawn: Row[] = [];

  const walk = (path: string, name: string, depth: number, entry: RemoteEntry | null): void => {
    const isOpen = path === root ? true : open.has(path);
    drawn.push({ path, name, depth, entry, open: isOpen });
    if (!isOpen) return;
    for (const child of listings[path]?.entries ?? []) {
      const at = childPath(path, child.name);
      // A plain file is a leaf; a directory — or a link, which the runtime's own
      // `readdir` answers for — carries the recursion.
      if (child.type === "file") {
        drawn.push({ path: at, name: child.name, depth: depth + 1, entry: child, open: false });
        continue;
      }
      walk(at, child.name, depth + 1, child);
    }
  };

  walk(root, root, 0, null);
  return drawn;
}
