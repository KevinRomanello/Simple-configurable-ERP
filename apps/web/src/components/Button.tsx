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
}

export function IconButton({ icon, label, danger, ...rest }: IconButtonProps) {
  return (
    <button type="button" className={`icon-btn${danger ? " danger" : ""}`} title={label} aria-label={label} {...rest}>
      <FontAwesomeIcon icon={icon} />
    </button>
  );
}
