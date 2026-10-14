/**
 * Copies a piece of text and says so, in place.
 *
 * The label is the whole confirmation: a clipboard write is invisible, and a
 * toast raised for one would be heavier than the act it reports.
 */

import type { ButtonHTMLAttributes } from "react";
import { useEffect, useState } from "react";
import { writeClipboard } from "../../lib/api";
import { Button } from "./Button";

/** Long enough to read, short enough not to keep claiming a stale state. */
const CONFIRM_MS = 2000;

type CopyButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children"> & {
  text: string;
  label: string;
  copiedLabel: string;
};

export function CopyButton({ text, label, copiedLabel, ...rest }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      variant="ghost"
      size="sm"
      {...rest}
      onClick={() => {
        void writeClipboard(text);
        setCopied(true);
      }}
    >
      {copied ? copiedLabel : label}
    </Button>
  );
}
