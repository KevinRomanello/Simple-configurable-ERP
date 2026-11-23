import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import type { ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: IconDefinition;
  variant?: "primary" | "ghost";
  small?: boolean;
}

/** The pill button of the design system. */
export function Button({ icon, variant = "primary", small, className, children, ...rest }: Props) {
  const classes = ["btn", variant === "ghost" ? "ghost" : "", small ? "small" : "", className ?? ""];
  return (
    <button type="button" className={classes.filter(Boolean).join(" ")} {...rest}>
      {icon && <FontAwesomeIcon icon={icon} />}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconDefinition;
  label: string;
  danger?: boolean;
  /** The action does not apply to this row: its place stays empty, so that the icons of every row line up. */
  absent?: boolean;
}

export function IconButton({ icon, label, danger, absent, className, ...rest }: IconButtonProps) {
  const classes = ["icon-btn", danger ? "danger" : "", absent ? "absent" : "", className ?? ""];
  return (
    <button type="button" className={classes.filter(Boolean).join(" ")} title={label} aria-label={label} {...(absent ? { tabIndex: -1, "aria-hidden": true, disabled: true } : {})} {...rest}>
      <FontAwesomeIcon icon={icon} />
    </button>
  );
}
