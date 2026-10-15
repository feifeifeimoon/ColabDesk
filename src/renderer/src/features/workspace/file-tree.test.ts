/**
 * The tree's shape, as a projection.
 *
 * What is worth holding here is what a closed folder hides, where a child lands,
 * and that a folder with no listing yet still draws its row — the last one
 * because that row is how the user sees their click land.
 */

import { describe, expect, it } from "vitest";
import type { RemoteEntry } from "@shared/types";
import { childPath, isDirectoryRow, projectRows, type Listing } from "./file-tree";

const ROOT = "/content";

function dir(name: string): RemoteEntry {
  return { name, type: "dir", size: 0, mtime: 0, mode: 0o040755 };
}

function file(name: string, size = 10): RemoteEntry {
  return { name, type: "file", size, mtime: 0, mode: 0o100644 };
}

function link(name: string): RemoteEntry {
  return { name, type: "link", size: 0, mtime: 0, mode: 0o120777 };
}

const listing = (entries: RemoteEntry[]): Listing => ({ entries, loading: false, error: null });

/** The row list as `[depth, name]`, which is what "in the right place" means. */
function shape(rows: ReturnType<typeof projectRows>): [number, string][] {
  return rows.map((row) => [row.depth, row.name]);
}

describe("projectRows", () => {
  it("draws the root, then its children in the order the runtime gave them", () => {
    const listings = {
      [ROOT]: listing([dir("data"), file("model.pt"), file("README.txt")]),
    };

    expect(shape(projectRows(listings, new Set(), ROOT))).toEqual([
      [0, ROOT],
      [1, "data"],
      [1, "model.pt"],
      [1, "README.txt"],
    ]);
  });

  it("hides a closed folder's contents but keeps its row", () => {
    const listings = {
      [ROOT]: listing([dir("data"), file("model.pt")]),
      [`${ROOT}/data`]: listing([file("sample.csv")]),
    };

    const closed = projectRows(listings, new Set(), ROOT);
    expect(closed.some((row) => row.name === "sample.csv")).toBe(false);
    expect(closed.find((row) => row.name === "data")?.open).toBe(false);

    const opened = projectRows(listings, new Set([`${ROOT}/data`]), ROOT);
    expect(shape(opened)).toEqual([
      [0, ROOT],
      [1, "data"],
      [2, "sample.csv"],
      [1, "model.pt"],
    ]);
  });

  it("interleaves siblings of different depths, in draw order", () => {
    const listings = {
      [ROOT]: listing([dir("a"), dir("b")]),
      [`${ROOT}/a`]: listing([dir("a1"), file("a.txt")]),
      [`${ROOT}/a/a1`]: listing([file("deep.txt")]),
    };
    const open = new Set([`${ROOT}/a`, `${ROOT}/a/a1`]);

    // The tree reads top to bottom: a folder's children come immediately after
    // it, before its siblings — that is what makes the depth column legible.
    expect(shape(projectRows(listings, open, ROOT))).toEqual([
      [0, ROOT],
      [1, "a"],
      [2, "a1"],
      [3, "deep.txt"],
      [2, "a.txt"],
      [1, "b"],
    ]);
  });

  it("draws a folder that has not been read yet, with its row the only thing there", () => {
    const listings = { [ROOT]: listing([dir("data")]) };
    const rows = projectRows(listings, new Set([`${ROOT}/data`]), ROOT);

    expect(shape(rows)).toEqual([
      [0, ROOT],
      [1, "data"],
    ]);
    expect(rows[1]?.open).toBe(true);
  });

  it("treats a link's row as a folder and a file's row as a leaf", () => {
    const listings = {
      [ROOT]: listing([link("mirror"), dir("data"), file("model.pt")]),
      [`${ROOT}/mirror`]: listing([file("behind-the-link.txt")]),
    };
    const rows = projectRows(listings, new Set([`${ROOT}/mirror`]), ROOT);

    expect(shape(rows)).toEqual([
      [0, ROOT],
      [1, "mirror"],
      [2, "behind-the-link.txt"],
      [1, "data"],
      [1, "model.pt"],
    ]);
    // A link is drawn as openable; a file never is.
    expect(rows.find((row) => row.name === "model.pt")?.open).toBe(false);
    expect(rows.find((row) => row.name === "mirror")?.open).toBe(true);
  });

  it("never closes the root, whatever the expanded set says", () => {
    const listings = { [ROOT]: listing([file("model.pt")]) };
    const rows = projectRows(listings, new Set(), ROOT);
    expect(rows[0]?.open).toBe(true);
    expect(rows).toHaveLength(2);
  });
});

describe("isDirectoryRow", () => {
  it("counts the root, folders and links as openable, and files not", () => {
    const root = projectRows({ [ROOT]: listing([]) }, new Set(), ROOT)[0]!;
    expect(isDirectoryRow(root)).toBe(true);
    expect(isDirectoryRow({ path: "/content/a", name: "a", depth: 1, entry: dir("a"), open: false })).toBe(true);
    expect(isDirectoryRow({ path: "/content/l", name: "l", depth: 1, entry: link("l"), open: false })).toBe(true);
    expect(isDirectoryRow({ path: "/content/f", name: "f", depth: 1, entry: file("f"), open: false })).toBe(false);
  });
});

describe("childPath", () => {
  it("does not double the root's slash", () => {
    expect(childPath("/", "content")).toBe("/content");
    expect(childPath("/content", "data")).toBe("/content/data");
  });
});
