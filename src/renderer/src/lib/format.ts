import { translate } from "../i18n/i18n";
import type { UsageGranularity } from "@shared/types";

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatPercent(transferred: number, total: number): string {
  if (total <= 0) return "…";
  return `${Math.round((transferred / total) * 100)}%`;
}

/** Join a directory and a child name without doubling the separator. */
export function joinPath(base: string, name: string): string {
  return `${base.replace(/\/$/, "")}/${name}`;
}

export function parentPath(path: string): string {
  const trimmed = path.replace(/\/$/, "");
  const index = trimmed.lastIndexOf("/");
  return index <= 0 ? "/" : trimmed.slice(0, index);
}

/**
 * The CLI writes ISO-8601 UTC (`2026-10-09T08:39:59.053369Z`). A desktop client
 * should show the reader's own clock, at a width a table cell can hold; the
 * raw value stays available as a tooltip.
 */
export function formatExpiry(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return sameDay
    ? translate("format.today", `${time}（今天）`, { time })
    : `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`;
}

/** A trend bucket's key is already a local date: `2026-10-09` → `10-09`. */
export function formatBucketLabel(key: string, granularity: UsageGranularity): string {
  return granularity === "month" ? key : key.slice(5);
}

/** Month and day plus clock time: the chart only ever spans a few months. */
export function formatReading(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
