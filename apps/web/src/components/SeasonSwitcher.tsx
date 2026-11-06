import { faCheck, faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useState } from "react";
import { useChooseSeason, useChosenSeasonId, useSeason, useSeasons } from "../lib/season";
import { Button } from "./Button";

// The season the whole site shows: chosen at the top of the menu, said again at the top of the page
// when it is not the season of today. Not designed in Figma: built from the menu's own pieces.
// docs/stagioni-anni-fiscali-e-macchine.md

/** "Budget 2026-2027" under the name of the team; opens the list of the seasons, each with its car. */
export function SeasonSwitcher() {
  const seasons = useSeasons().data;
  const season = useSeason();
  const chosen = useChosenSeasonId();
  const choose = useChooseSeason();
  const [open, setOpen] = useState(false);

  // a season remembered by this browser that is no longer there (another database): back to today's
  useEffect(() => {
    if (seasons && chosen !== null && !seasons.some((s) => s.id === chosen)) choose(null);
  }, [seasons, chosen, choose]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  if (!seasons || !season) return <span className="label-s muted">Budget</span>;
  return (
    <div className="season-switcher">
      <button type="button" className="season-button" aria-expanded={open} aria-controls="season-list" onClick={() => setOpen(!open)}>
        <span>Budget {season.name}</span>
        <FontAwesomeIcon icon={open ? faChevronUp : faChevronDown} />
      </button>
      {open && (
        <ul className="season-list" id="season-list" aria-label="Seasons">
          {seasons.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={s.id === season.id ? "chosen" : undefined}
                aria-current={s.id === season.id}
                onClick={() => {
                  setOpen(false);
                  if (s.id !== season.id) choose(s);
                }}
              >
                <span>
                  {s.id === season.id && <FontAwesomeIcon icon={faCheck} />} {s.name}
                  {s.current && <span className="muted"> · current</span>}
                  {s.readOnly && <span className="muted"> · read-only</span>}
                </span>
                <span className="label-s muted">{s.car}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The yellow strip at the top of every page while a season other than today's is shown, or one that is read-only. */
export function SeasonStrip() {
  const seasons = useSeasons().data;
  const season = useSeason();
  const choose = useChooseSeason();
  if (!season || (season.current && !season.readOnly)) return null;
  const today = seasons?.find((s) => s.current);
  return (
    <div className="season-strip" role="status">
      <span>
        {season.current ? `Season ${season.name} (${season.car})` : `You're looking at the season ${season.name} (${season.car})`}
        {season.readOnly && ": it is read-only, its budget cannot be changed"}
      </span>
      {!season.current && today && (
        <Button small onClick={() => choose(null)}>
          Back to {today.name}
        </Button>
      )}
    </div>
  );
}
