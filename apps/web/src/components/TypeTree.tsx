import { faArrowsUpDownLeftRight, faPlus } from "@fortawesome/free-solid-svg-icons";
import { useEffect, useState } from "react";
import type { ItemType } from "../api/types";
import { buildTree, canMove, type TypeBranch } from "../lib/typeTree";
import { Button, IconButton } from "./Button";

/**
 * The types of the inventory drawn as a tree, to see how they are laid out and to move them: drag a type onto another to put
 * it under it, or onto the strip above to make it a type of its own. A phone cannot drag, and a keyboard neither, so the arrows
 * button of a type picks it up and the next click puts it down. The server has the last word (a name or a parameter that
 * would be written twice is refused, and Settings says why). docs/inventario.md, §20
 */
export function TypeTree({ types, openId, onOpen, onAdd, onMove }: {
  types: ItemType[];
  /** The type whose parameters are open below. */
  openId: number | null;
  onOpen: (id: number) => void;
  onAdd: (parentId: number) => void;
  /** Put a type under another (null: a type of its own). */
  onMove: (id: number, parentId: number | null) => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | "root" | null>(null);
  /** The type picked up with its button (for a screen that cannot drag). */
  const [carrying, setCarrying] = useState<number | null>(null);
  const picked = dragging ?? carrying;
  const canDrop = (target: number | null) => picked !== null && canMove(types, picked, target);
  const nameOf = (id: number | null) => types.find((t) => t.id === id)?.name ?? "";

  // Escape puts down what was picked up with its button
  useEffect(() => {
    if (carrying === null) return;
    const stop = (event: KeyboardEvent) => event.key === "Escape" && setCarrying(null);
    window.addEventListener("keydown", stop);
    return () => window.removeEventListener("keydown", stop);
  }, [carrying]);

  const finish = () => {
    setDragging(null);
    setOver(null);
    setCarrying(null);
  };
  const drop = (target: number | null) => {
    if (picked !== null && canMove(types, picked, target)) onMove(picked, target);
    finish();
  };

  const node = (branch: TypeBranch) => {
    const t = branch.type;
    const target = canDrop(t.id);
    const classes = [
      "type-node",
      t.id === openId ? "open" : "",
      t.id === dragging || t.id === carrying ? "picked" : "",
      target ? "can-drop" : "",
      target && over === t.id ? "drop-here" : "",
    ];
    return (
      <li key={t.id}>
        <div
          className={classes.filter(Boolean).join(" ")}
          role="button"
          tabIndex={0}
          draggable
          aria-label={`${t.path}${t.items ? `, ${t.items} items` : ""}`}
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", String(t.id));
            e.dataTransfer.effectAllowed = "move";
            setDragging(t.id);
          }}
          onDragEnd={finish}
          onDragOver={(e) => {
            if (!target) return;
            e.preventDefault();
            setOver(t.id);
          }}
          onDragLeave={() => setOver((now) => (now === t.id ? null : now))}
          onDrop={(e) => {
            e.preventDefault();
            drop(t.id);
          }}
          onClick={() => (carrying !== null ? (target ? drop(t.id) : finish()) : onOpen(t.id))}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.currentTarget === e.target && (e.preventDefault(), e.currentTarget.click())}
        >
          <span className="type-node-name">{t.name}</span>
          <span className="type-node-meta">
            {t.items > 0 && `${t.items} item${t.items === 1 ? "" : "s"}`}
            {t.items > 0 && t.category && " · "}
            {t.category ?? (t.items > 0 ? "" : "no category")}
          </span>
          <span className="type-node-actions">
            <IconButton icon={faPlus} label={`Add a sub-type to ${t.path}`} onClick={(e) => { e.stopPropagation(); onAdd(t.id); }} />
            <IconButton icon={faArrowsUpDownLeftRight} label={`Move ${t.path}`} onClick={(e) => { e.stopPropagation(); setCarrying(carrying === t.id ? null : t.id); }} />
          </span>
        </div>
        {branch.children.length > 0 && <ul>{branch.children.map(node)}</ul>}
      </li>
    );
  };

  return (
    <div className="type-tree">
      <p className="muted">
        Drag a type onto another to put it under it, or onto the strip to make it a type of its own. Click a type to open its parameters;
        the arrows button picks it up (for a phone or a keyboard), and the next click puts it down. A type cannot go under itself or under
        one of its own sub-types.
      </p>
      {carrying !== null && (
        <div className="type-tree-carrying" role="status">
          <span>Moving <strong>{nameOf(carrying)}</strong>: click the type it goes under (Escape to stop).</span>
          <Button small variant="ghost" onClick={() => setCarrying(null)}>Cancel</Button>
        </div>
      )}
      {picked !== null && (
        <div
          className={`type-tree-root${canDrop(null) ? " can-drop" : ""}${over === "root" && canDrop(null) ? " drop-here" : ""}`}
          onDragOver={(e) => {
            if (!canDrop(null)) return;
            e.preventDefault();
            setOver("root");
          }}
          onDragLeave={() => setOver((now) => (now === "root" ? null : now))}
          onDrop={(e) => {
            e.preventDefault();
            drop(null);
          }}
          onClick={() => carrying !== null && canDrop(null) && drop(null)}
        >
          {canDrop(null) ? `Here: ${nameOf(picked)} becomes a type of its own` : `${nameOf(picked)} is already a type of its own`}
        </div>
      )}
      <ul>{buildTree(types).map(node)}</ul>
    </div>
  );
}
