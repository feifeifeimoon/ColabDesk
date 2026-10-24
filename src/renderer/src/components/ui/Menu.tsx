import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEventHandler,
  type ReactNode,
  type RefObject,
} from "react";
import { CheckIcon } from "./icons";

export interface MenuItem {
  label: ReactNode;
  onSelect: () => void;
  /** A glyph in the item's leading slot; hidden from assistive technology. */
  icon?: ReactNode;
  /** Rendered in the destructive colour; still asks for confirmation itself. */
  danger?: boolean;
  disabled?: boolean;
  /** Draws a separator above this item, grouping what follows. */
  dividerBefore?: boolean;
  /**
   * A toggle. `undefined` means "an ordinary item"; a boolean turns the row
   * into a checkbox item and reserves the leading slot for its tick.
   */
  checked?: boolean;
}

/**
 * The list itself, shared by the trigger menu and the context menu. One
 * implementation keeps the item roles, the tick and the separators identical
 * wherever an action list appears.
 */
export function MenuList({
  items,
  onSelect,
  label,
  className,
  style,
  listRef,
  onKeyDown,
}: {
  items: MenuItem[];
  /** Called before an item's own action, so a popover can close first. */
  onSelect?: () => void;
  label?: string;
  className?: string;
  style?: CSSProperties;
  listRef?: RefObject<HTMLDivElement | null>;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
}) {
  return (
    <div
      ref={listRef}
      className={`menu__list ${className ?? ""}`.trim()}
      role="menu"
      aria-label={label}
      style={style}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      {items.map((item, index) => (
        <Fragment key={index}>
          {item.dividerBefore && <div className="menu__separator" role="separator" />}
          <button
            type="button"
            role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
            aria-checked={item.checked}
            className={`menu__item ${item.danger ? "menu__item--danger" : ""}`}
            disabled={item.disabled}
            onClick={(event) => {
              event.stopPropagation();
              if (item.disabled) return;
              onSelect?.();
              item.onSelect();
            }}
          >
            {item.checked !== undefined ? (
              <span className="menu__icon menu__check" aria-hidden="true">
                {item.checked ? <CheckIcon size={12} /> : null}
              </span>
            ) : item.icon ? (
              <span className="menu__icon" aria-hidden="true">
                {item.icon}
              </span>
            ) : null}
            <span>{item.label}</span>
          </button>
        </Fragment>
      ))}
    </div>
  );
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
        <MenuList
          items={items}
          onSelect={() => setOpen(false)}
          label={label}
          className={align === "start" ? "" : "menu__list--end"}
        />
      )}
    </span>
  );
}
