import { and, eq } from "drizzle-orm";
import { forbidden, notFound } from "../../core/errors";
import { db } from "../../db/client";
import { appUser, regComment, regRecord } from "../../db/schema";
import { getCurrentUser } from "../../platform/auth/auth.service";
import { needRecord, needTable } from "./registry.access";
import { open } from "./records.service";
import { queueWebhooks, registryWrite } from "./registry.write";

// The comments on a record (docs/anagrafiche.md, §10.2): who may read a record may comment on it, like the
// commenters of NocoDB; the author changes their own words; whoever may edit the record marks a comment
// resolved. The webhooks of the table that listen to "comment" hear about each new one.

async function readable(tableRef: string | number, recordId: number) {
  const { reg, table, viewer } = await open(tableRef);
  const record = reg.record(recordId);
  if (!record || record.tableId !== table.id) throw notFound("Record");
  needRecord(reg, table, record, viewer, "read");
  return { reg, table, viewer, record };
}

/** GET /registry/tables/:t/records/:id/comments: the oldest first. */
export async function listComments(tableRef: string | number, recordId: number) {
  const { viewer } = await readable(tableRef, recordId);
  const rows = await db
    .select({ id: regComment.id, text: regComment.text, at: regComment.createdAt, editedAt: regComment.editedAt, resolvedAt: regComment.resolvedAt, authorId: regComment.authorId, author: appUser.name })
    .from(regComment)
    .leftJoin(appUser, eq(appUser.id, regComment.authorId))
    .where(eq(regComment.recordId, recordId))
    .orderBy(regComment.id);
  return rows.map((c) => ({
    id: c.id,
    text: c.text,
    at: c.at.toISOString(),
    editedAt: c.editedAt?.toISOString() ?? null,
    resolved: c.resolvedAt !== null,
    author: c.author ?? "system",
    mine: c.authorId === viewer.userId,
  }));
}

/** POST …/comments */
export async function addComment(tableRef: string | number, recordId: number, text: string) {
  const actor = await getCurrentUser();
  const { reg, table, record } = await readable(tableRef, recordId);
  await registryWrite(actor, "api", async (w) => {
    const [row] = await w.tx.insert(regComment).values({ recordId, authorId: actor.id, text }).returning({ id: regComment.id });
    await queueWebhooks(w, table.id, reg, [{ id: recordId, before: record, event: "comment", extra: { comment: { id: row!.id, text, author: actor.name } } }]);
  });
  return listComments(tableRef, recordId);
}

async function commentOf(commentId: number) {
  const [comment] = await db.select({ recordId: regComment.recordId, authorId: regComment.authorId, tableId: regRecord.tableId }).from(regComment).innerJoin(regRecord, eq(regRecord.id, regComment.recordId)).where(eq(regComment.id, commentId));
  if (!comment) throw notFound("Comment");
  return comment;
}

/** PATCH /registry/comments/:id: only its author changes the words. */
export async function editComment(commentId: number, text: string) {
  const actor = await getCurrentUser();
  const comment = await commentOf(commentId);
  if (comment.authorId !== actor.id) throw forbidden("Only who wrote a comment can change it");
  await registryWrite(actor, "api", (w) => w.tx.update(regComment).set({ text, editedAt: new Date() }).where(and(eq(regComment.id, commentId), eq(regComment.authorId, actor.id))));
  return listComments(comment.tableId, comment.recordId);
}

/** POST /registry/comments/:id/resolve: who may change the record marks it resolved, or open again. */
export async function resolveComment(commentId: number, resolved: boolean) {
  const actor = await getCurrentUser();
  const comment = await commentOf(commentId);
  const { reg, table, viewer, record } = await readable(comment.tableId, comment.recordId);
  if (comment.authorId !== actor.id) needRecord(reg, table, record, viewer, "edit");
  await registryWrite(actor, "api", (w) =>
    w.tx.update(regComment).set(resolved ? { resolvedAt: new Date(), resolvedBy: actor.id } : { resolvedAt: null, resolvedBy: null }).where(eq(regComment.id, commentId)),
  );
  return listComments(comment.tableId, comment.recordId);
}

/** DELETE /registry/comments/:id: its author, who manages the table, an admin. */
export async function deleteComment(commentId: number) {
  const actor = await getCurrentUser();
  const comment = await commentOf(commentId);
  if (comment.authorId !== actor.id) {
    const { reg, table, viewer } = await open(comment.tableId);
    needTable(reg, table, viewer, "manage");
  }
  await registryWrite(actor, "api", (w) => w.tx.delete(regComment).where(eq(regComment.id, commentId)));
}
