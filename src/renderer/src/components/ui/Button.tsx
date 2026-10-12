import type { ButtonHTMLAttributes } from "react";

type Variant = "default" | "primary" | "secondary" | "outline" | "ghost" | "destructive" | "link";
type Size = "md" | "sm" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: boolean;
}

/**
 * The only button in the app. `primary` is the ink affirmative action and there
 * is one per flow; `secondary`/`outline` are the paired non-committal actions;
 * `ghost` lives in dense rows and table cells; `destructive` is irreversible.
 */
export function Button({
  variant = "default",
  size = "md",
  icon = false,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [
    "btn",
    variant !== "default" ? `btn--${variant}` : "",
    size !== "md" ? `btn--${size}` : "",
    icon ? "btn--icon" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={classes} {...rest} />;
}

/** An icon-only button needs a name the eye cannot give it. */
export function IconButton({ label, children, ...rest }: ButtonProps & { label: string }) {
  return (
    <Button aria-label={label} title={label} icon {...rest}>
      {children}
    </Button>
  );
}
