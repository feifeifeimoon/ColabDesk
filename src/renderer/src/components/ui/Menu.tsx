import { useEffect, useRef, useState, type ReactNode } from "react";

export interface MenuItem {
  label: ReactNode;
  onSelect: () => void;
  /** Rendered in the destructive colour; still asks for confirmation itself. */
  danger?: boolean;
  disabled?: boolean;
}

/**
 * A row-level overflow menu: one small trigger, a list of actions, closed by
 * Escape or a click anywhere else. Used by the session rows, where the actions
 * must not take space until the row is pointed at.
 */
export function Menu({
  label,
  items,
  trigger = "⋯",
  align = "end",
}: {
  /** Accessible name for the trigger, e.g. "wb1 的操作". */
  label: string;
  items: MenuItem[];
  trigger?: ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  return (
    <span className="menu" ref={rootRef}>
      <button
        type="button"
        className="menu__trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        {trigger}
      </button>
      {open && (
        <div className={`menu__list ${align === "start" ? "" : "menu__list--end"}`} role="menu">
          {items.map((item, index) => (
            <button
              key={index}
              type="button"
              role="menuitem"
              className={`menu__item ${item.danger ? "menu__item--danger" : ""}`}
              disabled={item.disabled}
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
