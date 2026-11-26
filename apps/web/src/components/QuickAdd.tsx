import { useDraft } from "../lib/useDraft";
import { DraftNote } from "./DraftNote";
import { AddSection, Field, FormPanel, type Column } from "./ui";

// The pieces the lists of Settings share: the USED BY column, and the yellow button under a list with the form of its one box.

export const usedBy = <T extends { usedBy: number }>(): Column<T> => ({ key: "usedBy", header: "USED BY", num: true, sort: (r) => r.usedBy, cell: (r) => r.usedBy || "" });

/** The yellow button under a list and, opened by it, the form with the one box of what is added. */
export function QuickAdd({ id, noun, label, type = "text", onAdd }: { id: string; noun: string; label: string; type?: "text" | "number"; onAdd: (text: string) => Promise<boolean> }) {
  return <AddSection label={`New ${noun}`} draftKey={`quick-add:${id}`} form={(close) => <QuickAddForm id={id} noun={noun} label={label} type={type} onAdd={onAdd} onDone={close} />} />;
}

function QuickAddForm({ id, noun, label, type, onAdd, onDone }: { id: string; noun: string; label: string; type: "text" | "number"; onAdd: (text: string) => Promise<boolean>; onDone: () => void }) {
  const [text, setText, saved] = useDraft(`quick-add:${id}`, "");
  const submit = async () => {
    if (await onAdd(text.trim())) {
      saved.discard();
      onDone();
    }
  };
  return (
    <FormPanel title={`New ${noun}`} submitLabel={`Add ${noun}`} canSubmit={text.trim() !== ""} onSubmit={submit} onCancel={() => saved.leave(onDone)}>
      <DraftNote draft={saved} />
      <Field label={label} htmlFor={id}>
        <input id={id} className="input small" type={type} step={type === "number" ? "0.01" : undefined} autoFocus value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
    </FormPanel>
  );
}
