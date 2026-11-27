import type { ReactNode } from "react";
import { DownloadMenu } from "../DownloadMenu";

/** The top of a page about one thing (an item, a component): its picture, name, a line about it, its commands, and Download. */
export function DetailHeader({ picture, title, subtitle, children }: {
  picture: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Commands under the name (edit, picture…). */
  children?: ReactNode;
}) {
  return (
    <header className="item-head">
      {picture}
      <div className="item-title">
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </div>
      <DownloadMenu />
    </header>
  );
}
