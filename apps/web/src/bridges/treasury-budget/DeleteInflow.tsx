import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { treasuryBudgetApi } from "./api";
import type { RelatedVoice } from "./types";
import { allVoices, deleteBody, registerWarning, startingTicks, tickAll, voiceKey } from "./inflowVoices";
import { date, moneyFromDecimal } from "../../core/format";
import { useAction } from "../../core/useAction";
import { Button } from "../../core/Button";
import { FormActions, Loading, Table, TableScroll } from "../../core/ui";

/** What the state column says about a voice: that it was received, or that the cash flow does not count it. */
function stateOf(voice: RelatedVoice): string {
  if (voice.received) return `received on ${date(voice.receivedOn)}`;
  if (!voice.counted) return "not counted now";
  return "";
}

/**
 * Deletes an inflow of CASH FLOW choosing where from: the same company is often in three places, the inflow that was expected, the
 * one that arrived and the movement of the register that received it. The panel lists them in three groups, ticks the row that was
 * pressed (so that the start is what it always was: one thing), greys what the person cannot delete saying why, and deletes what is
 * ticked all together or nothing. docs/registro-di-cassa.md, section 5.2
 */
export function DeleteInflow({ from, onClose }: { from: { inflowId: number } | { cashEntryId: number }; onClose: () => void }) {
  const act = useAction();
  const related = useQuery({ queryKey: ["inflows-related", from], queryFn: () => treasuryBudgetApi.relatedInflows(from) });
  // null until the person ticks something: until then, what the panel starts with
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  if (!related.data) return <Loading />;
  const data = related.data;
  const ticked = chosen ?? startingTicks(data);
  const body = deleteBody(data, ticked);
  const count = body.inflowIds.length + body.cashEntryIds.length;
  const warning = registerWarning(data, ticked);

  const toggle = (voice: RelatedVoice) => {
    const next = new Set(ticked);
    if (!next.delete(voiceKey(voice))) next.add(voiceKey(voice));
    setChosen(next);
  };
  const submit = async () => {
    if (await act(() => treasuryBudgetApi.deleteInflows(body))) onClose();
  };
  const group = (title: string, voices: RelatedVoice[]) =>
    voices.length > 0 && (
      <div className="stack tight" key={title}>
        <h4 className="group-label">{title}</h4>
        <TableScroll>
          <Table>
            <thead>
              <tr><th /><th>NAME</th><th>DATE</th><th className="num">AMOUNT</th><th>STATE</th></tr>
            </thead>
            <tbody>
              {voices.map((v) => (
                <tr key={voiceKey(v)} className={v.canDelete ? undefined : "muted"}>
                  <td><input type="checkbox" aria-label={`Delete ${v.name} of ${moneyFromDecimal(v.amount)}`} checked={ticked.has(voiceKey(v))} disabled={!v.canDelete} onChange={() => toggle(v)} /></td>
                  <td className="cell-title">{v.name}{v.why && <div className="hint">{v.why}</div>}</td>
                  <td>{date(v.date) || "—"}</td>
                  <td className="num">{moneyFromDecimal(v.amount)}</td>
                  <td>{stateOf(v)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableScroll>
      </div>
    );

  return (
    <>
      <p className="muted">Everything of this company in the season. Tick what to delete: only the row you pressed is ticked to start with, and everything ticked goes together or nothing does.</p>
      {group("EXPECTED", data.expected)}
      {group("ACTUAL", data.actual)}
      {group("CASH REGISTER", data.register)}
      {data.registerHidden > 0 && (
        <p className="hint warning">
          {data.registerHidden} {data.registerHidden === 1 ? "movement" : "movements"} of the register {data.registerHidden === 1 ? "is" : "are"} tied to these inflows: only the treasury can see and delete {data.registerHidden === 1 ? "it" : "them"}.
        </p>
      )}
      {allVoices(data).length === 0 && <p className="muted">There is nothing to delete.</p>}
      {warning && <p className="hint error" role="status">{warning}</p>}
      <FormActions>
        <Button small disabled={count === 0} onClick={submit}>Delete {count}</Button>
        <Button small variant="ghost" onClick={() => setChosen(tickAll(data))}>Tick all</Button>
        <Button small variant="ghost" onClick={onClose}>Cancel</Button>
      </FormActions>
    </>
  );
}
